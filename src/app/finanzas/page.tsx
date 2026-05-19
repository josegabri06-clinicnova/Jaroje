"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowDownLeft, ArrowUpRight, Plus, Download, Search, Edit2, X, Wallet, Landmark, PiggyBank, Globe } from 'lucide-react';
import Link from 'next/link';

// Inicializar Supabase cliente
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

type Account = {
  id: string;
  name: string;
  group_type: 'EFECTIVO' | 'BANCOS' | 'AHORROS' | 'EXTRANJERO';
  balance: number;
  currency: string;
};

type FinanceRecord = {
  id: string;
  created_at: string;
  type: 'ingreso' | 'gasto';
  amount: number;
  category: string;
  description: string;
  account_id: string | null;
  date: string;
  accounts?: { name: string };
};

export default function FinanzasPage() {
  const [activeTab, setActiveTab] = useState<'libro' | 'registro'>('libro');
  
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filter State
  const [filterType, setFilterType] = useState<'todo' | 'mes' | 'semana' | 'hoy'>('mes');

  // Modal Movement State
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<FinanceRecord | null>(null);
  const [formType, setFormType] = useState<'ingreso' | 'gasto'>('gasto');
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState('Suministros');
  const [formDescription, setFormDescription] = useState('');
  const [formAccountId, setFormAccountId] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSaving, setIsSaving] = useState(false);

  // Modal Quick Transact Account State
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [quickAmount, setQuickAmount] = useState('');
  const [quickConcept, setQuickConcept] = useState('Ajuste');
  const [quickDescription, setQuickDescription] = useState('');

  const fetchData = async () => {
    setIsLoading(true);
    
    const [accRes, recRes] = await Promise.all([
      supabase.from('accounts').select('*').order('created_at', { ascending: true }),
      supabase.from('finances').select('*, accounts(name)').order('date', { ascending: false }).order('created_at', { ascending: false })
    ]);
    
    if (!accRes.error) setAccounts(accRes.data || []);
    if (!recRes.error) setRecords(recRes.data || []);
    
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAmount || isNaN(Number(formAmount)) || !formAccountId) return alert("Rellena todos los campos");
    
    setIsSaving(true);
    const amountNum = Number(formAmount);
    const newRecord = {
      type: formType,
      amount: amountNum,
      category: formType === 'ingreso' && formCategory === 'Suministros' ? 'Reserva' : formCategory,
      description: formDescription,
      account_id: formAccountId,
      payment_method: 'sobre',
      date: formDate
    };

    if (editingRecord) {
      // 1. Revert old balance
      if (editingRecord.account_id) {
        const oldAcc = accounts.find(a => a.id === editingRecord.account_id);
        if (oldAcc) {
          const revertChange = editingRecord.type === 'ingreso' ? -editingRecord.amount : editingRecord.amount;
          await supabase.from('accounts').update({ balance: oldAcc.balance + revertChange }).eq('id', oldAcc.id);
          oldAcc.balance += revertChange; // Update local temporarily
        }
      }
      
      // 2. Update Record
      const { error: updateErr } = await supabase.from('finances').update(newRecord).eq('id', editingRecord.id);
      
      // 3. Apply new balance
      if (!updateErr) {
        const newAcc = accounts.find(a => a.id === formAccountId);
        if (newAcc) {
          const applyChange = formType === 'ingreso' ? amountNum : -amountNum;
          await supabase.from('accounts').update({ balance: newAcc.balance + applyChange }).eq('id', newAcc.id);
        }
      }
    } else {
      // 1. Insert Record
      const { error: insertErr } = await supabase.from('finances').insert([newRecord]);
      // 2. Update Account Balance
      if (!insertErr) {
        const account = accounts.find(a => a.id === formAccountId);
        if (account) {
          const balanceChange = formType === 'ingreso' ? amountNum : -amountNum;
          await supabase.from('accounts').update({ balance: account.balance + balanceChange }).eq('id', account.id);
        }
      }
    }

    setShowMoveModal(false);
    setEditingRecord(null);
    fetchData();
    setIsSaving(false);
  };

  const handleDeleteMovement = async () => {
    if (!editingRecord || !confirm("¿Seguro que deseas eliminar este movimiento?")) return;
    setIsSaving(true);
    
    // 1. Delete Record
    const { error } = await supabase.from('finances').delete().eq('id', editingRecord.id);
    
    // 2. Revert Balance
    if (!error && editingRecord.account_id) {
      const acc = accounts.find(a => a.id === editingRecord.account_id);
      if (acc) {
        const revertChange = editingRecord.type === 'ingreso' ? -editingRecord.amount : editingRecord.amount;
        await supabase.from('accounts').update({ balance: acc.balance + revertChange }).eq('id', acc.id);
      }
    }
    
    setShowMoveModal(false);
    setEditingRecord(null);
    fetchData();
    setIsSaving(false);
  };

  const handleQuickMovement = async (type: 'ingreso' | 'gasto') => {
    if (!editingAccount || !quickAmount || isNaN(Number(quickAmount))) {
      alert("Por favor ingresa un monto válido");
      return;
    }
    
    setIsSaving(true);
    const amountNum = Number(quickAmount);
    
    const newRecord = {
      type: type,
      amount: amountNum,
      category: quickConcept,
      description: quickDescription || `Ajuste de ${type === 'ingreso' ? 'ingreso' : 'gasto'}`,
      account_id: editingAccount.id,
      payment_method: 'sobre',
      date: new Date().toISOString().split('T')[0]
    };
    
    // 1. Insert financial record
    const { error: insertErr } = await supabase.from('finances').insert([newRecord]);
    
    if (insertErr) {
      console.error(insertErr);
      alert("Error al registrar el movimiento en Supabase");
      setIsSaving(false);
      return;
    }
    
    // 2. Update account balance
    const balanceChange = type === 'ingreso' ? amountNum : -amountNum;
    const newBalance = editingAccount.balance + balanceChange;
    
    const { error: updateErr } = await supabase.from('accounts').update({ 
      balance: newBalance 
    }).eq('id', editingAccount.id);
    
    setIsSaving(false);
    
    if (!updateErr) {
      setEditingAccount(null);
      setQuickAmount('');
      setQuickDescription('');
      setQuickConcept('Ajuste');
      fetchData();
    } else {
      alert("Error al actualizar el saldo del sobre");
    }
  };

  const filteredRecords = records.filter(r => {
    if (filterType === 'todo') return true;
    const rDate = new Date(r.date + 'T12:00:00Z'); // Evitar problemas de timezone
    const today = new Date();
    
    if (filterType === 'hoy') {
      return rDate.toDateString() === today.toDateString();
    }
    if (filterType === 'semana') {
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);
      return rDate >= lastWeek;
    }
    if (filterType === 'mes') {
      return rDate.getMonth() === today.getMonth() && rDate.getFullYear() === today.getFullYear();
    }
    return true;
  });

  const exportToCSV = () => {
    if (filteredRecords.length === 0) return alert("No hay datos para exportar.");
    const headers = ["Fecha", "Tipo", "Categoría", "Monto", "Sobre", "Descripción"];
    const csvContent = [
      headers.join(","),
      ...filteredRecords.map(r => [
        format(new Date(r.date), 'dd/MM/yyyy'),
        r.type,
        `"${r.category}"`,
        r.amount,
        `"${r.accounts?.name || 'Desconocido'}"`,
        `"${r.description || ''}"`
      ].join(","))
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Finanzas_Jaroje_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Group Accounts
  const getGroup = (type: string) => accounts.filter(a => a.group_type === type);
  const sumGroup = (type: string) => getGroup(type).reduce((acc, curr) => acc + curr.balance, 0);
  const totalGeneral = accounts.reduce((acc, curr) => acc + curr.balance, 0);

  const renderGroup = (title: string, type: string, colorClass: string, bgClass: string, Icon: any) => {
    const groupAccounts = getGroup(type);
    if (groupAccounts.length === 0) return null;
    const total = sumGroup(type);

    return (
      <div className="bg-white border border-zinc-200/80 rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] mb-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgClass} ${colorClass}`}>
              <Icon size={20} strokeWidth={2.5} />
            </div>
            <h3 className="text-[16px] font-bold text-zinc-900 tracking-tight">{title}</h3>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Total</p>
            <p className={`text-[17px] font-black ${colorClass}`}>${total.toLocaleString('es-MX')}</p>
          </div>
        </div>

        {/* Accounts Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {groupAccounts.map(acc => (
            <div 
              key={acc.id} 
              onClick={() => { setEditingAccount(acc); setEditBalance(acc.balance.toString()); setEditAccountName(acc.name); }}
              className="bg-[#fafafa] border border-zinc-200/60 rounded-2xl p-3.5 hover:bg-white hover:border-zinc-300 hover:shadow-sm transition-all cursor-pointer group active:scale-[0.98]"
            >
              <p className="text-[11px] font-bold text-zinc-500 mb-1.5 truncate group-hover:text-zinc-800 transition-colors">{acc.name}</p>
              <p className="text-[16px] font-black text-zinc-900 leading-none">${acc.balance.toLocaleString('es-MX')}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 flex flex-col min-h-screen bg-[#fafafa] pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight">Sobres Mensuales</h2>
          <p className="text-[13px] font-medium text-zinc-500">Control de Flujo de Efectivo</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'registro' && (
            <button onClick={exportToCSV} className="w-10 h-10 bg-white border border-zinc-200 text-zinc-700 rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-transform">
              <Download size={18} strokeWidth={2.5} />
            </button>
          )}
          <button 
            onClick={() => {
              setEditingRecord(null);
              setFormType('gasto');
              setFormAmount('');
              setFormDescription('');
              setFormDate(new Date().toISOString().split('T')[0]);
              setShowMoveModal(true);
            }} 
            className="w-10 h-10 bg-zinc-900 text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex bg-zinc-200/60 p-1 rounded-2xl">
        <button 
          onClick={() => setActiveTab('libro')}
          className={`flex-1 py-2.5 text-[14px] font-bold rounded-xl transition-all ${activeTab === 'libro' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}
        >
          Libro Contable
        </button>
        <button 
          onClick={() => setActiveTab('registro')}
          className={`flex-1 py-2.5 text-[14px] font-bold rounded-xl transition-all ${activeTab === 'registro' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}
        >
          Registro
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center"><div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-900 rounded-full animate-spin mx-auto" /></div>
      ) : activeTab === 'libro' ? (
        // VISTA LIBRO CONTABLE (Modern SaaS)
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {renderGroup('Efectivo', 'EFECTIVO', 'text-emerald-600', 'bg-emerald-50', Wallet)}
          {renderGroup('Bancos', 'BANCOS', 'text-blue-600', 'bg-blue-50', Landmark)}
          {renderGroup('Ahorros', 'AHORROS', 'text-indigo-600', 'bg-indigo-50', PiggyBank)}
          {renderGroup('Extranjero', 'EXTRANJERO', 'text-violet-600', 'bg-violet-50', Globe)}
          
          <div className="bg-zinc-900 text-white rounded-[32px] p-6 shadow-2xl relative overflow-hidden mt-2">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Total General</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl text-zinc-400 font-bold">$</span>
                  <p className="text-4xl font-black tracking-tighter">{totalGeneral.toLocaleString('es-MX')}</p>
                </div>
              </div>
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/10">
                <Wallet size={26} className="text-white" strokeWidth={2.5} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        // VISTA REGISTRO (Movimientos)
        <div className="space-y-4">
          <div className="flex bg-white border border-zinc-200 p-1 rounded-xl shadow-sm">
            {[
              { id: 'todo', label: 'Todo' },
              { id: 'mes', label: 'Mes' },
              { id: 'semana', label: 'Semana' },
              { id: 'hoy', label: 'Hoy' },
            ].map(f => (
              <button 
                key={f.id}
                onClick={() => setFilterType(f.id as any)}
                className={`flex-1 py-1.5 text-[12px] font-bold rounded-lg transition-all ${filterType === f.id ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500'}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col divide-y divide-zinc-100 overflow-hidden">
            {filteredRecords.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 text-[13px] font-medium">No hay movimientos registrados.</div>
            ) : (
              filteredRecords.map(record => (
                <div 
                  key={record.id} 
                  onClick={() => {
                    setEditingRecord(record);
                    setFormType(record.type);
                    setFormAmount(record.amount.toString());
                    setFormCategory(record.category);
                    setFormDescription(record.description || '');
                    setFormAccountId(record.account_id || '');
                    setFormDate(record.date);
                    setShowMoveModal(true);
                  }}
                  className="p-4 flex items-center justify-between hover:bg-zinc-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      record.type === 'ingreso' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
                    }`}>
                      {record.type === 'ingreso' ? <ArrowDownLeft size={18} strokeWidth={2.5} /> : <ArrowUpRight size={18} strokeWidth={2.5} />}
                    </div>
                    <div>
                      <span className="block text-[15px] font-semibold text-zinc-900 leading-tight mb-0.5 capitalize">
                        {record.category}
                      </span>
                      <span className="text-[12px] font-medium text-zinc-500 line-clamp-1 max-w-[160px]">
                        {record.accounts?.name || 'Desconocido'} • {record.description}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`text-[15px] font-bold ${record.type === 'ingreso' ? 'text-emerald-600' : 'text-zinc-900'}`}>
                      {record.type === 'ingreso' ? '+' : '-'}MX${record.amount.toLocaleString('es-MX')}
                    </span>
                    <span className="text-[11px] text-zinc-400 font-medium">
                      {format(new Date(record.date + 'T12:00:00Z'), 'd MMM', { locale: es })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Modal Registrar Movimiento en Cuenta/Sobre */}
      {editingAccount && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
             <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-zinc-900 leading-tight">
                Registrar Movimiento<br/>
                <span className="text-xs font-semibold text-zinc-500">Sobre: {editingAccount.name} (${editingAccount.balance.toLocaleString('es-MX')})</span>
              </h3>
              <button onClick={() => { setEditingAccount(null); setQuickAmount(''); setQuickDescription(''); }} className="p-2 bg-zinc-100 rounded-full text-zinc-500">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Monto (MXN)</label>
                <input 
                  type="number" step="0.01" required
                  placeholder="0.00" autoFocus
                  value={quickAmount} onChange={e => setQuickAmount(e.target.value)}
                  className="w-full text-2xl font-bold bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-2 outline-none focus:ring-2 focus:ring-zinc-900/10 transition-all text-center placeholder:text-zinc-300"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Concepto / Categoría</label>
                <select 
                  value={quickConcept} onChange={e => setQuickConcept(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 outline-none font-bold text-[13px] focus:ring-2 focus:ring-zinc-900/10 text-zinc-900"
                >
                  <option>Ajuste</option>
                  <option>Reserva Directa</option>
                  <option>Venta Extra</option>
                  <option>Suministros</option>
                  <option>Limpieza</option>
                  <option>Mantenimiento</option>
                  <option>Servicios (Luz, Agua)</option>
                  <option>Nómina</option>
                  <option>Otros</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Descripción (Opcional)</label>
                <input 
                  type="text"
                  placeholder="Comentario sobre el movimiento"
                  value={quickDescription} onChange={e => setQuickDescription(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 outline-none text-[13px] focus:ring-2 focus:ring-zinc-900/10"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button 
                  onClick={() => handleQuickMovement('ingreso')}
                  disabled={isSaving || !quickAmount}
                  className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors disabled:opacity-40 text-[13px] flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98] cursor-pointer"
                >
                  <ArrowDownLeft size={16} strokeWidth={2.5} />
                  + Ingreso
                </button>
                <button 
                  onClick={() => handleQuickMovement('gasto')}
                  disabled={isSaving || !quickAmount}
                  className="py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-colors disabled:opacity-40 text-[13px] flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98] cursor-pointer"
                >
                  <ArrowUpRight size={16} strokeWidth={2.5} />
                  - Gasto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nuevo Movimiento */}
      {showMoveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto pb-8">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-bold text-zinc-900">Registrar Movimiento</h3>
              <button onClick={() => setShowMoveModal(false)} className="p-2 bg-zinc-100 rounded-full text-zinc-500">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleSaveMovement} className="space-y-5">
              {/* Tabs Tipo */}
              <div className="flex bg-zinc-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setFormType('gasto')}
                  className={`flex-1 py-2 text-[14px] font-bold rounded-lg transition-all ${formType === 'gasto' ? 'bg-white text-rose-600 shadow-sm' : 'text-zinc-500'}`}
                >
                  Salida (Gasto)
                </button>
                <button
                  type="button"
                  onClick={() => setFormType('ingreso')}
                  className={`flex-1 py-2 text-[14px] font-bold rounded-lg transition-all ${formType === 'ingreso' ? 'bg-white text-emerald-600 shadow-sm' : 'text-zinc-500'}`}
                >
                  Entrada (Ingreso)
                </button>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Monto</label>
                <input 
                  type="number" step="0.01" required
                  value={formAmount} onChange={e => setFormAmount(e.target.value)}
                  className="w-full text-3xl font-bold bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-all placeholder:text-zinc-300 text-base"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">¿De/Para qué Sobre?</label>
                <select 
                  required
                  value={formAccountId} onChange={e => setFormAccountId(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none font-bold text-base focus:ring-2 focus:ring-zinc-900/10 text-zinc-900"
                >
                  <option value="" disabled>Selecciona un Sobre...</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.group_type})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Concepto / Categoría</label>
                <select 
                  value={formCategory} onChange={e => setFormCategory(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none font-medium text-base focus:ring-2 focus:ring-zinc-900/10"
                >
                  {formType === 'gasto' ? (
                    <>
                      <option>Suministros</option>
                      <option>Limpieza</option>
                      <option>Mantenimiento</option>
                      <option>Servicios (Luz, Agua)</option>
                      <option>Nómina</option>
                      <option>Impuestos</option>
                      <option>Transferencia a otro Sobre</option>
                      <option>Otros</option>
                    </>
                  ) : (
                    <>
                      <option>Reserva Directa</option>
                      <option>Venta Extra</option>
                      <option>Transferencia de otro Sobre</option>
                      <option>Otros</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Descripción (Opcional)</label>
                <input 
                  type="text"
                  value={formDescription} onChange={e => setFormDescription(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-base focus:ring-2 focus:ring-zinc-900/10"
                  placeholder="Ej. Traspaso, Pago a proveedor..."
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Fecha</label>
                <input 
                  type="date" required
                  value={formDate} onChange={e => setFormDate(e.target.value)}
                  className="w-full text-base font-bold bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-zinc-900/10 transition-all"
                />
              </div>

              <div className="pt-2 flex gap-2">
                {editingRecord && (
                  <button 
                    type="button" 
                    onClick={handleDeleteMovement}
                    disabled={isSaving}
                    className="w-14 shrink-0 bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center rounded-xl transition-colors disabled:opacity-50 border border-rose-200"
                  >
                    <X size={20} strokeWidth={2.5} />
                  </button>
                )}
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="flex-1 py-4 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl transition-colors disabled:opacity-50 shadow-lg text-[15px]"
                >
                  {isSaving ? 'Guardando...' : (editingRecord ? 'Actualizar Movimiento' : 'Guardar Movimiento')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
