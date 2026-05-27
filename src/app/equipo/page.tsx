"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Users, Send, CheckCircle2, AlertCircle, Download, Paperclip, Receipt, FileText, PiggyBank, Clock, Calendar, X, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { getRole, getAdminPin } from '@/lib/auth';

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

function parseAttendanceLogs(text: string) {
  if (!text) return [];
  const lines = text.split('\n');
  const dayNames = ['lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado', 'domingo'];
  const logs: { day: string; date: string; entry: string; exit: string }[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();
    const matchedDay = dayNames.find(day => lower.startsWith(day));
    
    if (matchedDay) {
      const dateMatch = trimmed.match(/\d{1,2}\/[a-zA-Zúíáéó\d]+/);
      const timeMatches = trimmed.match(/(\d{1,2}:\d{2}\s*(?:am|pm|AM|PM))/g);
      
      if (dateMatch && timeMatches) {
        logs.push({
          day: matchedDay.charAt(0).toUpperCase() + matchedDay.slice(1),
          date: dateMatch[0],
          entry: timeMatches[0] || '—',
          exit: timeMatches[1] || '—'
        });
      }
    }
  }
  return logs;
}

function parseExcelPayroll(text: string) {
  if (!text) return null;
  
  const nameMatch = text.match(/\*([^*]+)\*/);
  const employeeName = nameMatch ? nameMatch[1].trim() : '';

  const digitsMatch = text.replace(/\s+/g, '').match(/(\d{13})/);
  let employeePhone = '';
  let employeePin = '';
  if (digitsMatch) {
    employeePhone = '52' + digitsMatch[1].slice(0, 10);
    employeePin = digitsMatch[1].slice(10);
  } else {
    const tenDigits = text.replace(/\s+/g, '').match(/(\d{10})/);
    if (tenDigits) {
      employeePhone = '52' + tenDigits[1];
    }
  }

  const amountMatch = text.match(/TOTAL\s+A\s+DEPOSITAR\s*……?\s*\$?\s*([\d,]+)/i) || 
                      text.match(/TOTAL\s+A\s+DEPOSITAR[^\d]*([\d,]+)/i);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : 0;

  const periodMatch = text.match(/^([\d]{1,2}\s+de\s+[a-zA-ZáéíóúÁÉÍÓÚ]+\s+de\s+\d{4})/i) ||
                      text.match(/([\d]{1,2}\s+de\s+[a-zA-ZáéíóúÁÉÍÓÚ]+\s+de\s+\d{4})/i);
  let period = periodMatch ? periodMatch[1].trim() : '';
  
  if (!period) {
    period = '1ra Quincena ' + format(new Date(), 'MMM', { locale: es });
  }

  return {
    employeeName,
    employeePhone,
    employeePin,
    amount,
    period
  };
}

function parseNotesForReceipt(text: string) {
  if (!text) return null;

  const getAmount = (regex: RegExp) => {
    const match = text.match(regex);
    return match ? Number(match[1].replace(/,/g, '')) : 0;
  };

  const baseSalary = getAmount(/NOMINA\s+QUINCENAL[^\d]*([\d,]+)/i);
  const daysWorked = getAmount(/DIAS\s+LAB\+VAC[^\d]*([\d,]+)/i);
  const retardos = getAmount(/RETARDOS[^\d]*([\d,]+)/i);
  const penalizacionPuntualidad = getAmount(/PENALIZACION\s+PUNTUALIDAD[^\d]*([\d,]+)/i);
  const diaFestivo = getAmount(/DIA\s+FESTIVO[^\$]*\$?\s*([\d,]+)/i);
  const bonoApoyoExtras = getAmount(/(?:BONO\s+APOYO|EXTRAS)[^\$]*\$?\s*([\d,]+)/i);

  const integratedNomina = getAmount(/NOMINA\s+INTEGRADA[^\d]*([\d,]+)/i);
  const pagoPrestamos = getAmount(/PAGO\s+PRESTAMOS[^\d]*([\d,]+)/i);
  const adelantoNomina = getAmount(/ADELANTO\s+NOMINA[^\d]*([\d,]+)/i);
  const ahorroQuincenal = getAmount(/AHORRO\s+QUINCENAL[^\d]*([\d,]+)/i);
  const totalDeposit = getAmount(/TOTAL\s+A\s+DEPOSITAR[^\d]*([\d,]+)/i);

  const prestamosRemainingMatch = text.match(/RESTAMOS\s+X\s+PAGAR[^\d]*([\d,]+)\s+de\s+\[?([\d,]+)\]?/i);
  const prestamosRemaining = prestamosRemainingMatch ? Number(prestamosRemainingMatch[1].replace(/,/g, '')) : 0;
  const prestamosTotal = prestamosRemainingMatch ? Number(prestamosRemainingMatch[2].replace(/,/g, '')) : 0;

  const ahorroAcumulado = getAmount(/AHORRO\s+ACUMULADO[^\d]*([\d,]+)/i);
  const vacacionesRemaining = getAmount(/VACACIONES\s+X\s+TOMAR[^\d]*([\d,]+)/i);

  const attendanceLogs = parseAttendanceLogs(text);

  return {
    baseSalary,
    daysWorked,
    retardos,
    penalizacionPuntualidad,
    diaFestivo,
    bonoApoyoExtras,
    integratedNomina,
    pagoPrestamos,
    adelantoNomina,
    ahorroQuincenal,
    totalDeposit,
    prestamosRemaining,
    prestamosTotal,
    ahorroAcumulado,
    vacacionesRemaining,
    attendanceLogs
  };
}

export default function EquipoPage() {
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  // Finance integration state
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  
  // Form State
  const [activeFormTab, setActiveFormTab] = useState<'excel' | 'manual'>('excel');
  const [rawText, setRawText] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('52'); // Prefijo México por defecto
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'nomina' | 'anticipo' | 'bono'>('nomina');
  const [period, setPeriod] = useState('1ra Quincena ' + format(new Date(), 'MMM', { locale: es }));
  const [file, setFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sendWhatsapp, setSendWhatsapp] = useState(true);
  
  // Details Modal State
  const [selectedRecordForDetails, setSelectedRecordForDetails] = useState<PayrollRecord | null>(null);

  // Google Sheets sync state
  const [sheetUrl, setSheetUrl] = useState('');
  const [syncedEmployees, setSyncedEmployees] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [sheetRows, setSheetRows] = useState<any[]>([]);
  const [isLoadingSheetRows, setIsLoadingSheetRows] = useState(false);
  const [loadedFromSheet, setLoadedFromSheet] = useState(false);

  const handleExcelPaste = (val: string) => {
    setRawText(val);
    const parsed = parseExcelPayroll(val);
    if (parsed) {
      if (parsed.employeeName) setName(parsed.employeeName);
      if (parsed.employeePhone) setPhone(parsed.employeePhone);
      if (parsed.amount) setAmount(parsed.amount.toString());
      if (parsed.period) setPeriod(parsed.period);
    }
  };
  
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const handleRetryWhatsapp = async (record: PayrollRecord) => {
    setRetryingId(record.id);
    try {
      const waRes = await fetch('/api/payroll/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone: record.employee_phone, 
          employeeName: record.employee_name, 
          amount: record.amount.toString(), 
          period: record.period, 
          type: record.type, 
          document_url: record.document_url,
          notes: record.notes
        })
      });
      
      if (waRes.ok) {
        await supabase.from('payroll').update({ whatsapp_sent: true }).eq('id', record.id);
        alert("¡WhatsApp enviado con éxito!");
        setSelectedRecordForDetails(prev => prev && prev.id === record.id ? { ...prev, whatsapp_sent: true } : prev);
        fetchRecords();
      } else {
        const errData = await waRes.json();
        alert(`Fallo al reenviar WhatsApp: ${errData.error || 'Error de API'}`);
      }
    } catch (err: any) {
      console.error("Error reenviando WA", err);
      alert(`Error al conectar con la API de WhatsApp: ${err.message || err}`);
    } finally {
      setRetryingId(null);
    }
  };


  const fetchLiveSheetRows = async () => {
    setIsLoadingSheetRows(true);
    try {
      const res = await fetch('/api/payroll/sync');
      const data = await res.json();
      if (data.success && Array.isArray(data.rows)) {
        setSheetRows(data.rows);
      }
    } catch (err) {
      console.error("Error al cargar celdas en vivo del Google Sheet:", err);
    } finally {
      setIsLoadingSheetRows(false);
    }
  };

  const fetchSyncConfig = async () => {
    try {
      const { data: urlData } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'google_sheet_nominas_url')
        .maybeSingle();
      if (urlData) {
        setSheetUrl(urlData.value);
        fetchLiveSheetRows();
      }

      const { data: empData } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'official_employees')
        .maybeSingle();
      if (empData && empData.value) {
        setSyncedEmployees(JSON.parse(empData.value));
      }
    } catch (err) {
      console.error("Error cargando configuración de sincronización:", err);
    }
  };

  const handleSyncGoogleSheets = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetUrl.trim()) return alert("Por favor ingresa un enlace de Google Sheets válido.");
    
    setIsSyncing(true);
    try {
      const role = getRole() || 'admin';
      const pin = getAdminPin();

      const res = await fetch('/api/payroll/sync', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': role,
          'x-admin-pin': pin
        },
        body: JSON.stringify({ sheetUrl })
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`¡Sincronización exitosa! Se importaron ${data.count} empleados de forma correcta.`);
        if (data.employees) {
          setSyncedEmployees(data.employees);
          if (typeof window !== 'undefined') {
            localStorage.setItem('jaroje_official_employees', JSON.stringify(data.employees));
          }
        }
        setShowSyncSettings(false);
      } else {
        alert(`Error al sincronizar: ${data.error || 'Error desconocido'}`);
      }
    } catch (err: any) {
      console.error("Error sincronizando:", err);
      alert(`Error de red o servidor: ${err.message || err}`);
    } finally {
      setIsSyncing(false);
    }
  };

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

  const handleDeleteRecord = async (id: string, employeeName: string, amount: number, period: string) => {
    const confirm = window.confirm(`¿Estás seguro de que deseas eliminar el registro de nómina de ${employeeName} por MX$${amount.toLocaleString('es-MX')} (${period})?\n\nEsta acción eliminará también el registro contable asociado en Finanzas y devolverá el saldo a la cuenta.`);
    if (!confirm) return;

    try {
      // 1. Buscar si hay una transacción en 'finances' para esta nómina para revertirla
      const financeDesc = `Nómina ${period} - Empleado: ${employeeName}`;
      const { data: finRecords } = await supabase
        .from('finances')
        .select('*')
        .eq('description', financeDesc)
        .eq('category', 'Nóminas');

      if (finRecords && finRecords.length > 0) {
        for (const fin of finRecords) {
          // Revertir el balance en la cuenta
          if (fin.account_id) {
            const { data: acc } = await supabase.from('accounts').select('balance').eq('id', fin.account_id).single();
            if (acc) {
              await supabase.from('accounts').update({ balance: acc.balance + fin.amount }).eq('id', fin.account_id);
            }
          }
          // Eliminar transacción en finanzas
          await supabase.from('finances').delete().eq('id', fin.id);
        }
      }

      // 2. Eliminar el registro en payroll
      const { error } = await supabase.from('payroll').delete().eq('id', id);
      if (error) throw error;

      alert("Registro de nómina eliminado y saldo contable restaurado con éxito.");
      fetchRecords();
      setSelectedRecordForDetails(null);
    } catch (err) {
      console.error(err);
      alert("Error al eliminar el registro.");
    }
  };

  const fetchAccounts = async () => {
    const { data } = await supabase.from('accounts').select('*').order('name', { ascending: true });
    if (data) {
      setAccounts(data);
    }
  };

  useEffect(() => {
    fetchRecords();
    fetchAccounts();
    fetchSyncConfig();
    
    // Abrir automáticamente el modal de nómina si viene del botón FAB (+)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('action') === 'pay_payroll') {
        setShowModal(true);
      }
    }
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
      notes: rawText || '',
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

    // 2b. Registrar egreso en FINANZAS si se seleccionó una cuenta
    if (selectedAccountId && inserted) {
      try {
        const financeRecord = {
          type: 'egreso',
          amount: Number(amount),
          category: 'Nóminas',
          description: `Nómina ${period} - Empleado: ${name}`,
          account_id: selectedAccountId,
          payment_method: 'Transferencia',
          date: new Date().toISOString().split('T')[0]
        };

        const { error: finError } = await supabase.from('finances').insert([financeRecord]);
        if (!finError) {
          // Obtener saldo actual de la cuenta para restar el egreso
          const { data: acc } = await supabase.from('accounts').select('balance').eq('id', selectedAccountId).single();
          if (acc) {
            await supabase.from('accounts').update({ balance: acc.balance - Number(amount) }).eq('id', selectedAccountId);
          }
        } else {
          console.error("Error al registrar en finanzas:", finError);
        }
      } catch (finErr) {
        console.error("Error en flujo de registro financiero:", finErr);
      }
    }

    // 3. Enviar WhatsApp (Opcional)
    if (sendWhatsapp && inserted) {
      try {
        const waRes = await fetch('/api/payroll/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            phone, 
            employeeName: name, 
            amount, 
            period, 
            type, 
            document_url,
            notes: inserted.notes
          })
        });
        
        if (waRes.ok) {
          await supabase.from('payroll').update({ whatsapp_sent: true }).eq('id', inserted.id);
        } else {
          const errData = await waRes.json();
          alert(`Guardado en base de datos, pero falló WhatsApp: ${errData.error || 'Error de API'}`);
        }
      } catch (err: any) {
        console.error("Error enviando WA", err);
        alert(`Error al intentar conectar con la API de WhatsApp: ${err.message || err}`);
      }
    }

    setShowModal(false);
    setAmount('');
    setName('');
    setRawText('');
    setFile(null);
    setLoadedFromSheet(false);
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
            <p className="text-[12px] font-semibold text-zinc-550 uppercase tracking-widest">Total Pagado (Mes)</p>
            <div className="flex items-baseline gap-1">
              <span className="text-lg text-zinc-400 font-medium">MX$</span>
              <p className="text-2xl font-bold tracking-tighter text-zinc-900">{totalMes.toLocaleString('es-MX')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sincronización con Google Sheets Card */}
      <div className="bg-white border border-zinc-200/80 p-5 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2M9 17H7v-2h2v2zm0-4H7v-2h2v2zm0-4H7V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/>
              </svg>
            </div>
            <div>
              <h4 className="text-[14px] font-bold text-zinc-800">Sincronización con Google Sheets</h4>
              <p className="text-[12px] text-zinc-550 font-medium">Mantén la lista de empleados actualizada sin dependencias de Cloud.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSyncSettings(!showSyncSettings)}
            className="text-[12px] font-bold text-zinc-650 hover:text-zinc-900 bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            {showSyncSettings ? 'Ocultar' : 'Configurar'}
          </button>
        </div>

        {(showSyncSettings || syncedEmployees.length > 0) && (
          <div className="pt-2 border-t border-zinc-100 space-y-4">
            {showSyncSettings && (
              <form onSubmit={handleSyncGoogleSheets} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={sheetUrl}
                  onChange={e => setSheetUrl(e.target.value)}
                  placeholder="Enlace para compartir de Google Sheets..."
                  className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 outline-none text-[13px] focus:ring-2 focus:ring-zinc-900/10 font-sans text-zinc-800"
                  required
                />
                <button
                  type="submit"
                  disabled={isSyncing}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl px-5 py-3 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {isSyncing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Sincronizando...</span>
                    </>
                  ) : (
                    <span>Sincronizar ahora</span>
                  )}
                </button>
              </form>
            )}

            {syncedEmployees.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-50/50 border border-zinc-200/50 p-3 rounded-xl text-[12px]">
                <div className="flex items-center gap-1.5 text-zinc-650 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{syncedEmployees.length} empleados activos vinculados desde la nube</span>
                </div>
                <div className="text-[11px] font-medium text-zinc-400">
                  {sheetUrl ? "Conexión activa con Google Sheets" : "Fallback local activo"}
                </div>
              </div>
            )}
          </div>
        )}
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
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-100/50 flex-wrap">
                  {record.whatsapp_sent ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                      <CheckCircle2 size={12} /> WhatsApp Enviado
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">
                        <AlertCircle size={12} /> Sin notificar
                      </span>
                      <button
                        onClick={() => handleRetryWhatsapp(record)}
                        disabled={retryingId === record.id}
                        className="text-[11px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 disabled:opacity-50 px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                      >
                        {retryingId === record.id ? (
                          <div className="w-3 h-3 border-2 border-amber-700 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Send size={10} />
                        )}
                        Reintentar
                      </button>
                    </div>
                  )}
                  {record.document_url && (
                    <a href={record.document_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md transition-colors ml-1">
                      <Paperclip size={12} /> Ver adjunto
                    </a>
                  )}
                  {record.notes && (
                    <button 
                      onClick={() => setSelectedRecordForDetails(record)}
                      className="flex items-center gap-1 text-[11px] font-bold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                    >
                      <Receipt size={12} /> Ver Desglose
                    </button>
                  )}
                  <button 
                    onClick={() => handleDeleteRecord(record.id, record.employee_name, record.amount, record.period)}
                    className="flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-md transition-colors cursor-pointer ml-1 border border-rose-100/50"
                    title="Eliminar Nómina"
                  >
                    <Trash2 size={12} />
                    <span>Eliminar</span>
                  </button>
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
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-zinc-900">Registrar Pago</h3>
              <button 
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setAmount('');
                  setName('');
                  setRawText('');
                  setFile(null);
                  setLoadedFromSheet(false);
                }}
                className="w-8 h-8 rounded-full bg-zinc-100 text-zinc-505 flex items-center justify-center hover:bg-zinc-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Selector de Pestañas */}
            <div className="flex bg-zinc-100 p-1 rounded-xl mb-4">
              <button
                type="button"
                onClick={() => setActiveFormTab('excel')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeFormTab === 'excel' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-505 hover:text-zinc-800'
                }`}
              >
                Smart Paste (Excel)
              </button>
              <button
                type="button"
                onClick={() => setActiveFormTab('manual')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeFormTab === 'manual' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-505 hover:text-zinc-800'
                }`}
              >
                Ingreso Manual
              </button>
            </div>
            
            <form onSubmit={handleSave} className="space-y-4">
              {activeFormTab === 'excel' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Pegar Nómina de Excel</label>
                    <textarea
                      rows={5}
                      value={rawText}
                      onChange={e => handleExcelPaste(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[13px] focus:ring-2 focus:ring-zinc-900/10 font-mono"
                      placeholder="Pega aquí el texto que copiaste del Excel del cliente..."
                    />
                  </div>

                  {rawText && (
                    <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-2">
                      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">Previsualización Inteligente</span>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
                        <div>
                          <span className="text-zinc-400 font-medium block text-[11px]">Empleado</span>
                          <span className="font-bold text-zinc-800 truncate block">{name || 'No detectado'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400 font-medium block text-[11px]">Neto a Depositar</span>
                          <span className="font-bold text-emerald-600 block">{amount ? `MX$${Number(amount).toLocaleString('es-MX')}` : 'No detectado'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400 font-medium block text-[11px]">Teléfono (WhatsApp)</span>
                          <span className="font-bold text-zinc-800 block truncate">{phone || 'No detectado'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400 font-medium block text-[11px]">Periodo</span>
                          <span className="font-bold text-zinc-800 block truncate">{period || 'No detectado'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Formulario Editable de Revisión */}
              <div className="space-y-4 border-t border-zinc-100 pt-4">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                  {activeFormTab === 'excel' ? 'Revisión y Ajustes' : 'Datos del Pago'}
                </span>
                
                <div>
                  <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Empleado</label>
                  <input 
                    type="text" required
                    list="employee-names"
                    value={name} 
                    onChange={e => {
                      const val = e.target.value;
                      setName(val);
                      
                      // 1. Autocompletado tradicional básico
                      const found = syncedEmployees.find(emp => emp.full_name.toLowerCase().trim() === val.toLowerCase().trim());
                      if (found && found.phone) {
                        setPhone(found.phone);
                      }
                      
                      // 2. Importación Inteligente de Celdas desde Google Sheets
                      if (val) {
                        const sheetMatch = sheetRows.find(row => (row['nombre'] || '').toLowerCase().trim() === val.toLowerCase().trim());
                        if (sheetMatch) {
                          // Extraer y limpiar Whatsapp
                          const rawPhone = sheetMatch['whatsapp'] || sheetMatch['telefono'] || sheetMatch['teléfono'] || '';
                          const cleanPhone = rawPhone.replace(/\D/g, '');
                          if (cleanPhone) setPhone(cleanPhone.startsWith('52') ? cleanPhone : '52' + cleanPhone);

                          // Extraer y limpiar monto (= TOTAL A DEPOSITAR)
                          const rawAmount = sheetMatch['= total a depositar'] || sheetMatch['total a depositar'] || '';
                          const cleanAmount = rawAmount.replace(/[^\d.]/g, '');
                          if (cleanAmount) setAmount(cleanAmount);

                          // Construir desglose automático premium
                          const concepts: string[] = [];
                          const addConcept = (label: string, colName: string) => {
                            const valStr = sheetMatch[colName];
                            if (valStr && valStr !== '$0' && valStr !== '$0.00' && valStr !== '0' && valStr !== '$ 0' && valStr !== '$ -' && valStr.trim() !== '') {
                              concepts.push(`${label}: ${valStr.trim()}`);
                            }
                          };
                          
                          addConcept('NÓMINA BASE', 'nomina quincenal');
                          addConcept('DÍAS TRAB', 'dias lab+vac');
                          addConcept('RETARDOS', 'retardos');
                          addConcept('PENALIZACIÓN PUNTUALIDAD', 'penalizacion puntualidad');
                          addConcept('EXTRAS', '+ extras');
                          addConcept('INTEGRADA', '= nomina integrada');
                          addConcept('PAGO PRÉSTAMO', '- pago prestamos');
                          addConcept('ADELANTO', '- adelanto nomina');
                          addConcept('AHORRO QNA', '- ahorro quincenal');
                          addConcept('PRÉSTAMO RESTANTE', 'prestamos x pagar');
                          addConcept('AHORRO ACUMULADO', 'ahorro acumulado');
                          addConcept('VACACIONES POR TOMAR', 'vacaciones x tomar');

                          const generatedBreakdown = concepts.join(' 🔸 ');
                          setRawText(generatedBreakdown);
                          setLoadedFromSheet(true);
                        } else {
                          setLoadedFromSheet(false);
                        }
                      } else {
                        setLoadedFromSheet(false);
                      }
                    }}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[15px] focus:ring-2 focus:ring-zinc-900/10 text-zinc-800"
                    placeholder="Escribe el nombre del empleado..."
                  />
                  {loadedFromSheet && (
                    <div className="mt-2 text-[11px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-200/50 px-3 py-1.5 rounded-xl flex items-center gap-1.5 animate-in slide-in-from-top-1 duration-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>✨ Datos y Desglose cargados en vivo desde Google Sheets</span>
                    </div>
                  )}
                  <datalist id="employee-names">
                    {syncedEmployees.map((emp, i) => (
                      <option key={`${emp.employee_num}-${i}`} value={emp.full_name}>
                        {emp.department.toUpperCase()} — No. {emp.employee_num}
                      </option>
                    ))}
                  </datalist>
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
                  <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Cuenta Financiera (Para Finanzas)</label>
                  <select 
                    value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-zinc-900/10"
                  >
                    <option value="">-- No registrar en Finanzas --</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} (Saldo: MX${acc.balance.toLocaleString('es-MX')})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Teléfono (Para WhatsApp)</label>
                  <input 
                    type="tel" required
                    value={phone} onChange={e => setPhone(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[15px] focus:ring-2 focus:ring-zinc-900/10"
                    placeholder="529581003298"
                  />
                </div>

                {rawText && (
                  <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-2">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">Desglose de Conceptos (WhatsApp)</span>
                    <p className="text-[12px] font-bold text-zinc-700 leading-normal whitespace-pre-wrap font-mono bg-white p-3 border border-zinc-200/50 rounded-xl">
                      {rawText.replace(/ 🔸 /g, '\n')}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Comprobante (Opcional)</label>
                  <input 
                    type="file"
                    onChange={e => setFile(e.target.files ? e.target.files[0] : null)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[13px] focus:ring-2 focus:ring-zinc-900/10 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[13px] file:font-semibold file:bg-zinc-900 file:text-white hover:file:bg-zinc-800 cursor-pointer"
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
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => {
                    setShowModal(false);
                    setAmount('');
                    setName('');
                    setRawText('');
                    setFile(null);
                    setLoadedFromSheet(false);
                  }}
                  className="flex-1 py-3.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition-colors cursor-pointer text-[14px]"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="flex-1 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl transition-colors disabled:opacity-50 cursor-pointer shadow-lg text-[14px]"
                >
                  {isSaving ? 'Guardando...' : 'Registrar Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DETALLE DE RECIBO DIGITAL PREMIUM */}
      {selectedRecordForDetails && (() => {
        const details = parseNotesForReceipt(selectedRecordForDetails.notes);
        if (!details) return null;
        
        return (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 overflow-y-auto max-h-[90vh] space-y-6">
              
              {/* Header Modal */}
              <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-zinc-900 text-white flex items-center justify-center shadow-md">
                    <Receipt size={22} strokeWidth={2.2} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-955 leading-tight">Recibo Digital</h3>
                    <span className="text-[12px] font-medium text-zinc-505">{selectedRecordForDetails.period}</span>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedRecordForDetails(null)}
                  className="w-8 h-8 rounded-full bg-zinc-100 text-zinc-505 flex items-center justify-center hover:bg-zinc-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Empleado e Info */}
              <div className="flex items-center justify-between bg-zinc-50 p-4 rounded-2xl border border-zinc-200/60">
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Empleado</span>
                  <span className="text-[16px] font-bold text-zinc-900">{selectedRecordForDetails.employee_name}</span>
                  <span className="text-[12px] font-medium text-zinc-505 mt-0.5">Tel: +{selectedRecordForDetails.employee_phone}</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">Tipo</span>
                  <span className="text-[12px] font-bold uppercase bg-zinc-900 text-white px-2.5 py-0.5 rounded mt-1 inline-block">
                    {selectedRecordForDetails.type}
                  </span>
                </div>
              </div>

              {/* Box de Depósito Neto */}
              <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-3xl text-center shadow-[0_4px_12px_rgba(16,185,129,0.05)]">
                <span className="text-[12px] font-semibold text-emerald-600 uppercase tracking-widest block mb-1">Total a Depositar</span>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-xl font-medium text-emerald-500">MX$</span>
                  <span className="text-3xl font-extrabold text-emerald-700 tracking-tighter">
                    {selectedRecordForDetails.amount.toLocaleString('es-MX')}
                  </span>
                </div>
              </div>

              {/* Desglose de Ingresos y Egresos */}
              <div className="grid grid-cols-2 gap-4">
                {/* Columna Ingresos */}
                <div className="space-y-3">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block border-b border-zinc-100 pb-1">Ingresos (+)</span>
                  <div className="space-y-2 text-[13px]">
                    <div className="flex justify-between font-medium">
                      <span className="text-zinc-505">Sueldo Base:</span>
                      <span className="text-zinc-900 font-bold">MX${details.baseSalary.toLocaleString('es-MX')}</span>
                    </div>
                    {details.diaFestivo > 0 && (
                      <div className="flex justify-between font-medium text-emerald-600">
                        <span>Festivo:</span>
                        <span className="font-bold">+${details.diaFestivo.toLocaleString('es-MX')}</span>
                      </div>
                    )}
                    {details.bonoApoyoExtras > 0 && (
                      <div className="flex justify-between font-medium text-emerald-600">
                        <span>Bonos/Extras:</span>
                        <span className="font-bold">+${details.bonoApoyoExtras.toLocaleString('es-MX')}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold border-t border-dashed border-zinc-200 pt-2 text-[14px]">
                      <span className="text-zinc-800">Total Integrado:</span>
                      <span className="text-zinc-955">MX${details.integratedNomina.toLocaleString('es-MX')}</span>
                    </div>
                  </div>
                </div>

                {/* Columna Egresos */}
                <div className="space-y-3">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block border-b border-zinc-100 pb-1">Egresos (-)</span>
                  <div className="space-y-2 text-[13px]">
                    {details.pagoPrestamos > 0 && (
                      <div className="flex justify-between font-medium text-rose-600">
                        <span>Pago Préstamo:</span>
                        <span className="font-bold">-${details.pagoPrestamos.toLocaleString('es-MX')}</span>
                      </div>
                    )}
                    {details.adelantoNomina > 0 && (
                      <div className="flex justify-between font-medium text-rose-600">
                        <span>Adelanto:</span>
                        <span className="font-bold">-${details.adelantoNomina.toLocaleString('es-MX')}</span>
                      </div>
                    )}
                    {details.ahorroQuincenal > 0 && (
                      <div className="flex justify-between font-medium text-amber-600">
                        <span>Ahorro:</span>
                        <span className="font-bold">-${details.ahorroQuincenal.toLocaleString('es-MX')}</span>
                      </div>
                    )}
                    {(details.pagoPrestamos === 0 && details.adelantoNomina === 0 && details.ahorroQuincenal === 0) && (
                      <div className="text-zinc-400 italic text-center py-2 text-[12px]">Sin deducciones</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Cuentas de Control (Préstamos, Ahorro, Vacaciones) */}
              <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl space-y-4">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">Saldos & Control Quincenal</span>
                
                <div className="space-y-3">
                  {/* Préstamo Pendiente */}
                  {details.prestamosTotal > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[12px] font-bold">
                        <span className="text-zinc-600">Préstamo por Pagar:</span>
                        <span className="text-zinc-900">MX${details.prestamosRemaining.toLocaleString('es-MX')} de MX${details.prestamosTotal.toLocaleString('es-MX')}</span>
                      </div>
                      <div className="w-full bg-zinc-200 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-zinc-900 h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(0, Math.min(100, (1 - (details.prestamosRemaining / details.prestamosTotal)) * 100))}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-zinc-400 font-semibold block text-right">
                        {((1 - (details.prestamosRemaining / details.prestamosTotal)) * 100).toFixed(0)}% Liquidado
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {/* Ahorro Acumulado */}
                    <div className="bg-white border border-zinc-200 p-3 rounded-xl flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                        <PiggyBank size={18} />
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 font-bold block uppercase">Alcancía</span>
                        <span className="text-[14px] font-extrabold text-zinc-800">MX${details.ahorroAcumulado.toLocaleString('es-MX')}</span>
                      </div>
                    </div>

                    {/* Vacaciones */}
                    <div className="bg-white border border-zinc-200 p-3 rounded-xl flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <Calendar size={18} />
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 font-bold block uppercase">Vacaciones</span>
                        <span className="text-[14px] font-extrabold text-zinc-800">{details.vacacionesRemaining} Días</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bitácora de Asistencia */}
              {details.attendanceLogs.length > 0 && (
                <div className="space-y-3">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">Bitácora de Asistencia ({details.attendanceLogs.length} Días)</span>
                  <div className="border border-zinc-200/80 rounded-2xl overflow-hidden max-h-48 overflow-y-auto divide-y divide-zinc-100">
                    {details.attendanceLogs.map((log, index) => (
                      <div key={index} className="flex justify-between items-center p-3 text-[13px] hover:bg-zinc-50 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-800">{log.day}</span>
                          <span className="text-zinc-400 font-semibold bg-zinc-100 px-2 py-0.5 rounded text-[11px]">{log.date}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-zinc-500 font-medium">
                          <Clock size={12} className="text-zinc-400" />
                          <span>{log.entry}</span>
                          <span className="text-zinc-300">—</span>
                          <span>{log.exit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer Modal */}
              <div className="pt-4 border-t border-zinc-100 flex flex-col gap-2.5">
                <div className="flex gap-3">
                  {selectedRecordForDetails.document_url && (
                    <a 
                      href={selectedRecordForDetails.document_url}
                      target="_blank" rel="noopener noreferrer"
                      className="flex-1 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-center transition-colors text-[13px] flex items-center justify-center gap-1.5"
                    >
                      <Paperclip size={14} /> Ver Comprobante
                    </a>
                  )}
                  
                  <button 
                    onClick={() => handleRetryWhatsapp(selectedRecordForDetails)}
                    disabled={retryingId === selectedRecordForDetails.id}
                    className={`flex-1 py-3 font-bold rounded-xl transition-colors text-[13px] flex items-center justify-center gap-1.5 border cursor-pointer ${
                      selectedRecordForDetails.whatsapp_sent
                        ? "bg-zinc-50 border-zinc-200 hover:bg-zinc-100 text-zinc-700"
                        : "bg-amber-50 border-amber-200 hover:bg-amber-100 text-amber-800 animate-pulse"
                    }`}
                  >
                    {retryingId === selectedRecordForDetails.id ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      selectedRecordForDetails.whatsapp_sent ? <Send size={14} className="text-zinc-500" /> : <Send size={14} />
                    )}
                    {selectedRecordForDetails.whatsapp_sent ? "Reenviar WhatsApp" : "Notificar WhatsApp"}
                  </button>
                </div>
                
                <button
                  onClick={() => handleDeleteRecord(selectedRecordForDetails.id, selectedRecordForDetails.employee_name, selectedRecordForDetails.amount, selectedRecordForDetails.period)}
                  className="w-full py-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-xl transition-colors text-[13px] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={14} />
                  <span>Eliminar Nómina del Sistema</span>
                </button>

                <button 
                  onClick={() => setSelectedRecordForDetails(null)}
                  className="w-full py-3 bg-zinc-950 hover:bg-zinc-800 text-white font-bold rounded-xl transition-colors text-[13px] cursor-pointer"
                >
                  Entendido
                </button>
              </div>


            </div>
          </div>
        );
      })()}
    </div>
  );
}
