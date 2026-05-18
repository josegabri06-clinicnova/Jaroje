"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Users, Send, CheckCircle2, AlertCircle, Download, Paperclip } from 'lucide-react';
import Link from 'next/link';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

type PayrollRecord = {
  id: string;
  created_at: string;
  employee_name: string;
  employee_phone: string;
  amount: number;
  type: 'nomina' | 'anticipo' | 'bono';
  period: string;
  notes: string;
  document_url?: string;
  whatsapp_sent: boolean;
};

export default function EquipoPage() {
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('34'); // Default prefijo España, ajustar según cliente
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'nomina' | 'anticipo' | 'bono'>('nomina');
  const [period, setPeriod] = useState('1ra Quincena ' + format(new Date(), 'MMM', { locale: es }));
  const [file, setFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sendWhatsapp, setSendWhatsapp] = useState(true);

  const fetchRecords = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('payroll')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) console.error("Error fetching payroll:", error);
    else setRecords(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !name || !phone) return alert("Completa todos los campos obligatorios");
    
    setIsSaving(true);
    
    let document_url = null;

    // 1. Subir archivo si existe
    if (file) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('payroll_documents')
        .upload(fileName, file);
        
      if (uploadError) {
        console.error("Error subiendo archivo:", uploadError);
        alert("Hubo un error subiendo el documento. Se guardará el pago sin adjunto.");
      } else {
        const { data: publicUrlData } = supabase.storage
          .from('payroll_documents')
          .getPublicUrl(fileName);
        document_url = publicUrlData.publicUrl;
      }
    }

    // 2. Guardar en Supabase
    const newRecord = {
      employee_name: name,
      employee_phone: phone,
      amount: Number(amount),
      type,
      period,
      document_url,
      whatsapp_sent: false
    };

    const { data: inserted, error: dbError } = await supabase
      .from('payroll')
      .insert([newRecord])
      .select()
      .single();
    
    if (dbError) {
      console.error(dbError);
      alert("Error al guardar en base de datos");
      setIsSaving(false);
      return;
    }

    // 3. Enviar WhatsApp (Opcional)
    if (sendWhatsapp && inserted) {
      try {
        const waRes = await fetch('/api/payroll/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, employeeName: name, amount, period, type, document_url })
        });
        
        if (waRes.ok) {
          await supabase.from('payroll').update({ whatsapp_sent: true }).eq('id', inserted.id);
        }
      } catch (err) {
        console.error("Error enviando WA", err);
      }
    }

    setShowModal(false);
    setAmount('');
    setName('');
    setFile(null);
    fetchRecords();
    setIsSaving(false);
  };

  const totalMes = records.reduce((acc, curr) => acc + curr.amount, 0);

  const exportToCSV = () => {
    if (records.length === 0) return alert("No hay datos para exportar.");
    
    const headers = ["Fecha", "Empleado", "Periodo", "Tipo", "Monto", "WhatsApp Enviado"];
    const csvContent = [
      headers.join(","),
      ...records.map(r => [
        format(new Date(r.created_at), 'dd/MM/yyyy HH:mm'),
        `"${r.employee_name}"`,
        `"${r.period}"`,
        r.type,
        r.amount,
        r.whatsapp_sent ? 'Sí' : 'No'
      ].join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Nominas_Jaroje_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 flex flex-col min-h-screen bg-[#fafafa] pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight">Equipo</h2>
          <p className="text-[13px] font-medium text-zinc-500">Gestión de Nóminas</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={exportToCSV}
            className="w-10 h-10 bg-white border border-zinc-200 text-zinc-700 rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-transform"
          >
            <Download size={18} strokeWidth={2.5} />
          </button>
          <button 
            onClick={() => setShowModal(true)}
            className="w-10 h-10 bg-zinc-900 text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* KPI Resumen */}
      <div className="bg-white border border-zinc-200/80 p-5 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users size={20} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-[12px] font-semibold text-zinc-500 uppercase tracking-widest">Total Pagado (Mes)</p>
            <div className="flex items-baseline gap-1">
              <span className="text-lg text-zinc-400 font-medium">MX$</span>
              <p className="text-2xl font-bold tracking-tighter text-zinc-900">{totalMes.toLocaleString('es-MX')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Historial de Pagos */}
      <div className="pt-2">
        <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Historial de Pagos</h3>
        <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col divide-y divide-zinc-100 overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center"><div className="w-5 h-5 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin mx-auto" /></div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 text-[13px] font-medium">No hay nóminas registradas.</div>
          ) : (
            records.map(record => (
              <div key={record.id} className="p-4 hover:bg-zinc-50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex flex-col">
                    <span className="text-[15px] font-bold text-zinc-900">{record.employee_name}</span>
                    <span className="text-[12px] font-medium text-zinc-500">{record.period}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[16px] font-bold text-zinc-900">MX${record.amount.toLocaleString('es-MX')}</span>
                    <span className="text-[11px] font-bold uppercase px-2 py-0.5 mt-1 rounded bg-zinc-100 text-zinc-500">
                      {record.type}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-100/50">
                  {record.whatsapp_sent ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                      <CheckCircle2 size={12} /> WhatsApp Enviado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                      <AlertCircle size={12} /> Sin notificar
                    </span>
                  )}
                  {record.document_url && (
                    <a href={record.document_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md transition-colors ml-1">
                      <Paperclip size={12} /> Ver adjunto
                    </a>
                  )}
                  <span className="text-[11px] text-zinc-400 ml-auto">{format(new Date(record.created_at), 'd MMM', { locale: es })}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal Registrar Pago */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 overflow-y-auto max-h-[90vh]">
            <h3 className="text-xl font-bold text-zinc-900 mb-6">Registrar Pago</h3>
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Empleado</label>
                <input 
                  type="text" required
                  value={name} onChange={e => setName(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[15px] focus:ring-2 focus:ring-zinc-900/10"
                  placeholder="Nombre completo"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Monto (MX$)</label>
                  <input 
                    type="number" required
                    value={amount} onChange={e => setAmount(e.target.value)}
                    className="w-full font-bold bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-zinc-900/10"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Tipo</label>
                  <select 
                    value={type} onChange={e => setType(e.target.value as any)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-zinc-900/10"
                  >
                    <option value="nomina">Nómina</option>
                    <option value="anticipo">Anticipo</option>
                    <option value="bono">Bono</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Periodo</label>
                <input 
                  type="text" required
                  value={period} onChange={e => setPeriod(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[14px] focus:ring-2 focus:ring-zinc-900/10"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Teléfono (Para WhatsApp)</label>
                <input 
                  type="tel" required
                  value={phone} onChange={e => setPhone(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[15px] focus:ring-2 focus:ring-zinc-900/10"
                  placeholder="34600112233"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Comprobante (Opcional)</label>
                <input 
                  type="file"
                  onChange={e => setFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[13px] focus:ring-2 focus:ring-zinc-900/10 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[13px] file:font-semibold file:bg-zinc-900 file:text-white hover:file:bg-zinc-800"
                  accept="image/*,.pdf"
                />
              </div>

              <div className="flex items-center gap-3 bg-zinc-50 p-3 rounded-xl border border-zinc-200">
                <input 
                  type="checkbox" 
                  id="wa"
                  checked={sendWhatsapp} onChange={e => setSendWhatsapp(e.target.checked)}
                  className="w-5 h-5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="wa" className="flex-1 text-[13px] font-medium text-zinc-700 cursor-pointer flex items-center gap-2">
                  <Send size={14} className="text-emerald-500" />
                  Enviar comprobante por WhatsApp
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="flex-1 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Guardando...' : 'Registrar Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
