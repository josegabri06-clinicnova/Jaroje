"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowDownLeft, ArrowUpRight, Plus, Download, Search, Edit2, X, Wallet, Landmark, PiggyBank, Globe } from 'lucide-react';
import Link from 'next/link';
import EmployeeModal from '@/components/EmployeeModal';
import { Employee } from '@/lib/auth';

// Inicializar Supabase cliente
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

type Account = {
  id: string;
  name: string;
  group_type: 'EFECTIVO' | 'BANCOS' | 'AHORROS' | 'EXTRANJERO' | 'CUENTAS X COBRAR';
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
  payment_method?: string;
};

const cleanDescription = (desc: string) => {
  if (!desc) return '';
  let cleaned = desc
    .replace(/\[Reserva B24:\s*\d+\]/gi, '')
    .replace(/\[Pending Sync:\s*B24\]/gi, '')
    .replace(/\[Synced:\s*B24\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  cleaned = cleaned.replace(/[-|:\s]+$/, '').trim();
  return cleaned;
};

export default function FinanzasPage() {
  const [activeTab, setActiveTab] = useState<'libro' | 'registro'>('libro');
  
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncingRecordId, setSyncingRecordId] = useState<string | null>(null);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [recordToSync, setRecordToSync] = useState<FinanceRecord | null>(null);
  
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

    let finalDescription = formDescription;
    if (editingRecord) {
      const b24TagsMatch = editingRecord.description?.match(/\[Reserva B24:\s*\d+\]/i);
      const pendingSyncTag = editingRecord.description?.includes('[Pending Sync: B24]');
      const syncedTag = editingRecord.description?.includes('[Synced: B24]');

      let tagsStr = '';
      if (b24TagsMatch) {
        tagsStr += ` ${b24TagsMatch[0]}`;
      }
      if (pendingSyncTag) {
        tagsStr += ` [Pending Sync: B24]`;
      } else if (syncedTag) {
        tagsStr += ` [Synced: B24]`;
      }
      
      finalDescription = `${formDescription}${tagsStr}`.trim();
    }

    const newRecord = {
      type: formType,
      amount: amountNum,
      category: formType === 'ingreso' && formCategory === 'Suministros' ? 'Reserva' : formCategory,
      description: finalDescription,
      account_id: formAccountId,
      payment_method: editingRecord?.payment_method || 'sobre',
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

  const handleSyncWithBeds24 = async (record: FinanceRecord, employee: Employee) => {
    if (syncingRecordId) return;
    
    // Parse actualBookId
    const bookIdMatch = record.description?.match(/\[Reserva B24:\s*(\d+)\]/);
    const actualBookId = bookIdMatch ? bookIdMatch[1] : null;
    
    if (!actualBookId) {
      alert("No se encontró el ID de reserva de Beds24 en la descripción del registro.");
      return;
    }

    setSyncingRecordId(record.id);

    try {
      const response = await fetch('/api/reservas/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: actualBookId,
          amount: record.amount,
          paymentMethod: record.payment_method || 'efectivo',
          employeeNum: employee.employee_num
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Update local database description tag
        const updatedDesc = record.description
          .replace('[Pending Sync: B24]', '[Synced: B24]');

        const { error: updateErr } = await supabase
          .from('finances')
          .update({ description: updatedDesc })
          .eq('id', record.id);

        if (updateErr) {
          console.error("Error al actualizar estado en Supabase:", updateErr);
          alert("Sincronizado con Beds24 con éxito, pero falló la actualización local en Supabase.");
        } else {
          // Log de conciliación manual
          try {
            await fetch('/api/employee-logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                employee_num: employee.employee_num,
                employee_name: employee.full_name,
                department: employee.department,
                module: 'recepcion',
                action: 'payment_reconciled',
                details: `Concilió manualmente pago pendiente a Beds24 de $${record.amount} para reserva B24 ID ${actualBookId} (Registro ID: ${record.id})`
              })
            });
          } catch (logErr) {
            console.error("Error registrando log de conciliación:", logErr);
          }

          alert("✅ Sincronización exitosa con Beds24 y conciliación completada localmente.");
          fetchData();
        }
      } else {
        alert(`❌ Falló la conciliación con Beds24:\n${data.error || 'Error desconocido'}`);
      }
    } catch (err: any) {
      console.error("Error de conexión durante la conciliación:", err);
      alert(`⚠️ Error de red al conectar con Beds24:\n${err.message || err}`);
    } finally {
      setSyncingRecordId(null);
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
        `"${cleanDescription(r.description) || ''}"`
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
              onClick={() => { setEditingAccount(acc); setQuickAmount(''); setQuickDescription(''); setQuickConcept('Ajuste'); }}
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
          {renderGroup('Cuentas x Cobrar', 'CUENTAS X COBRAR', 'text-amber-600', 'bg-amber-50', Landmark)}
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
              filteredRecords.map(record => {
                const isPendingSync = record.description?.includes('[Pending Sync: B24]');
                const isSynced = record.description?.includes('[Synced: B24]');

                return (
                  <div 
                    key={record.id} 
                    onClick={() => {
                      setEditingRecord(record);
                      setFormType(record.type);
                      setFormAmount(record.amount.toString());
                      setFormCategory(record.category);
                      setFormDescription(cleanDescription(record.description || ''));
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
                        <div className="flex items-center flex-wrap gap-1.5 mb-0.5">
                          <span className="text-[15px] font-semibold text-zinc-900 leading-tight capitalize">
                            {record.category}
                          </span>
                          {isPendingSync && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-50 text-amber-700 border border-amber-250/60 uppercase tracking-wider animate-pulse">
                              Pendiente B24
                            </span>
                          )}
                          {isSynced && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-250/60 uppercase tracking-wider">
                              Sincronizado
                            </span>
                          )}
                        </div>
                        <span className="text-[12px] font-medium text-zinc-500 line-clamp-1 max-w-[200px]">
                          {record.accounts?.name || 'Desconocido'} • {cleanDescription(record.description)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-end">
                        <span className={`text-[15px] font-bold ${record.type === 'ingreso' ? 'text-emerald-600' : 'text-zinc-900'}`}>
                          {record.type === 'ingreso' ? '+' : '-'}MX${record.amount.toLocaleString('es-MX')}
                        </span>
                        <span className="text-[11px] text-zinc-400 font-medium">
                          {format(new Date(record.date + 'T12:00:00Z'), 'd MMM', { locale: es })}
                        </span>
                      </div>
                      
                      {isPendingSync && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRecordToSync(record);
                            setShowEmployeeModal(true);
                          }}
                          disabled={syncingRecordId === record.id}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {syncingRecordId === record.id ? (
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : 'Conciliar'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Modal Registrar Movimiento en Cuenta/Sobre */}
      {editingAccount && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/60 backdrop-blur-md p-4 transition-all duration-300">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.2)] border border-zinc-150 animate-in zoom-in-95 duration-300 flex flex-col">
             <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-[17px] font-black text-zinc-900 tracking-tight leading-tight">
                  Sobre: {editingAccount.name}
                </h3>
                <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mt-0.5">{editingAccount.group_type}</span>
              </div>
              <button 
                onClick={() => { 
                  setEditingAccount(null); 
                  setQuickAmount(''); 
                  setQuickDescription(''); 
                  setQuickConcept('Ajuste');
                }} 
                className="p-2 bg-zinc-100 hover:bg-zinc-200 hover:rotate-90 hover:scale-105 active:scale-95 rounded-full text-zinc-500 transition-all duration-300 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* MONTO TOTAL EN GRANDE */}
            <div className="bg-gradient-to-br from-zinc-50 to-zinc-100/50 border border-zinc-200/60 rounded-2xl p-4 text-center mb-4 shadow-sm">
              <p className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1">Monto Disponible</p>
              <p className="text-3xl font-black text-zinc-900 tracking-tight">
                ${editingAccount.balance.toLocaleString('es-MX')} <span className="text-xs text-zinc-400 font-bold">{editingAccount.currency || 'MXN'}</span>
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Monto de la Transacción</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-extrabold text-zinc-400 text-sm">$</span>
                  <input 
                    type="number" step="0.01" required
                    placeholder="0.00" autoFocus
                    value={quickAmount} onChange={e => setQuickAmount(e.target.value)}
                    className="w-full text-xl font-bold bg-zinc-50 border border-zinc-200 rounded-xl pl-8 pr-4 py-2.5 outline-none focus:ring-4 focus:ring-zinc-950/5 focus:border-zinc-900 focus:bg-white transition-all duration-350 text-zinc-900 placeholder:text-zinc-300"
                  />
                </div>

                {/* REAL-TIME PREVIEW CALCULATOR */}
                {quickAmount && !isNaN(Number(quickAmount)) && Number(quickAmount) > 0 && (
                  <div className="mt-3 p-3 bg-zinc-50 border border-zinc-150 rounded-2xl space-y-2.5 animate-in slide-in-from-top-2 duration-300">
                    <p className="font-extrabold text-zinc-400 uppercase tracking-widest text-[8px]">Calculadora Proyectada</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-emerald-50/40 hover:bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl transition-all duration-300">
                        <span className="text-emerald-800 font-extrabold text-[9px] uppercase tracking-wider block mb-1">Si es Ingreso</span>
                        <span className="font-black text-[13px] text-emerald-600 tracking-tight block">
                          ${(editingAccount.balance + Number(quickAmount)).toLocaleString('es-MX')}
                        </span>
                        <span className="text-[8px] text-emerald-500/80 font-bold block mt-0.5">+{Number(quickAmount).toLocaleString('es-MX')} MXN</span>
                      </div>
                      <div className="bg-rose-50/40 hover:bg-rose-50 border border-rose-100 p-2.5 rounded-xl transition-all duration-300">
                        <span className="text-rose-800 font-extrabold text-[9px] uppercase tracking-wider block mb-1">Si es Gasto</span>
                        <span className="font-black text-[13px] text-rose-600 tracking-tight block">
                          ${(editingAccount.balance - Number(quickAmount)).toLocaleString('es-MX')}
                        </span>
                        <span className="text-[8px] text-rose-500/80 font-bold block mt-0.5">-{Number(quickAmount).toLocaleString('es-MX')} MXN</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Concepto / Categoría</label>
                <select 
                  value={quickConcept} onChange={e => setQuickConcept(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 outline-none font-bold text-[13px] focus:ring-4 focus:ring-zinc-950/5 focus:border-zinc-900 focus:bg-white text-zinc-900 cursor-pointer transition-all duration-300"
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
                <label className="block text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Descripción (Opcional)</label>
                <input 
                  type="text"
                  placeholder="Comentario sobre el movimiento"
                  value={quickDescription} onChange={e => setQuickDescription(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 outline-none text-[13px] focus:ring-4 focus:ring-zinc-950/5 focus:border-zinc-900 focus:bg-white text-zinc-900 placeholder:text-zinc-400 transition-all duration-300"
                />
              </div>

              {/* RECENT MOVEMENTS IN THIS ENVELOPE */}
              <div className="pt-1">
                <p className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-2">Últimos movimientos del sobre</p>
                <div className="space-y-1.5 max-h-[110px] overflow-y-auto pr-1">
                  {records.filter(r => r.account_id === editingAccount.id).length === 0 ? (
                    <p className="text-[11px] text-zinc-400 font-medium italic text-center py-2 bg-zinc-50/50 rounded-lg">Sin movimientos registrados en este sobre.</p>
                  ) : (
                    records
                      .filter(r => r.account_id === editingAccount.id)
                      .slice(0, 3)
                      .map(r => (
                        <div key={r.id} className="flex justify-between items-center bg-zinc-50 p-2 rounded-xl border border-zinc-100/50 text-[11px] hover:bg-zinc-100/50 transition-colors duration-200">
                          <div className="truncate pr-2">
                            <span className="font-bold text-zinc-900 block truncate capitalize">{r.category}</span>
                            <span className="text-[10px] text-zinc-400 font-medium block truncate">{cleanDescription(r.description) || 'Sin comentario'}</span>
                          </div>
                          <span className={`font-extrabold whitespace-nowrap ${r.type === 'ingreso' ? 'text-emerald-600' : 'text-zinc-700'}`}>
                            {r.type === 'ingreso' ? '+' : '-'}MX${r.amount.toLocaleString('es-MX')}
                          </span>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* ACCIONES DE COBRO/GASTO CONTABLE */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button 
                  onClick={() => handleQuickMovement('ingreso')}
                  disabled={isSaving || !quickAmount || isNaN(Number(quickAmount))}
                  className="py-3 bg-emerald-600 hover:bg-emerald-700 hover:-translate-y-0.5 text-white font-bold rounded-xl transition-all duration-300 disabled:opacity-40 text-[13px] flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(16,185,129,0.25)] hover:shadow-[0_8px_20px_rgba(16,185,129,0.35)] active:scale-[0.96] cursor-pointer"
                >
                  <ArrowDownLeft size={16} strokeWidth={2.5} />
                  + Ingreso
                </button>
                <button 
                  onClick={() => handleQuickMovement('gasto')}
                  disabled={isSaving || !quickAmount || isNaN(Number(quickAmount))}
                  className="py-3 bg-rose-600 hover:bg-rose-700 hover:-translate-y-0.5 text-white font-bold rounded-xl transition-all duration-300 disabled:opacity-40 text-[13px] flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(244,63,94,0.25)] hover:shadow-[0_8px_20px_rgba(244,63,94,0.35)] active:scale-[0.96] cursor-pointer"
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

      {/* Modal de Firma de Empleado para Autorizar Conciliación */}
      <EmployeeModal
        isOpen={showEmployeeModal}
        onClose={() => {
          setShowEmployeeModal(false);
          setRecordToSync(null);
        }}
        module="recepcion"
        title="Autorización de Conciliación"
        description="Ingresa tu código de recepcionista para sincronizar este cobro con Beds24."
        onSuccess={(employee) => {
          if (recordToSync) {
            handleSyncWithBeds24(recordToSync, employee);
          }
        }}
      />
    </div>
  );
}
