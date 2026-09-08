"use client";
 
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  ArrowDownLeft, ArrowUpRight, Plus, Download, Search, Edit2, X, Wallet, Landmark, 
  PiggyBank, Globe, Lock, Trash2, RefreshCw, ArrowLeftRight, Settings, ArrowDown, 
  ArrowUp, Eye, Share2, ArrowLeft, ArrowRight, Percent, Calendar, Building2, 
  ExternalLink, TrendingUp, CheckCircle2, Filter, Layers, Tag, ChevronRight, 
  FileSpreadsheet, AlertCircle, Sparkles, Receipt
} from 'lucide-react';
import Link from 'next/link';
import EmployeeModal from '@/components/EmployeeModal';
import { Employee, validatePinAsync, getActiveEmployee } from '@/lib/auth';
import { computeOtaSplit } from '@/lib/beds24';
 
// Inicializar Supabase cliente
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const normalizeText = (text: string) => 
  (text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

 
type Account = {
  id: string;
  name: string;
  group_type: 'EFECTIVO' | 'BANCOS' | 'AHORROS' | 'EXTRANJERO' | 'CUENTAS X COBRAR' | 'CUENTAS X PAGAR' | 'COMISIONES';
  balance: number;
  currency: string;
  sort_index?: number;
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
 
const cleanDescription = (desc: string, accName?: string, paymentMethod?: string) => {
  if (!desc) return '';
  let cleaned = desc
    .replace(/\[Reserva B24:\s*\d+\]/gi, '')
    .replace(/\[Pending Sync:\s*B24\]/gi, '')
    .replace(/\[Synced:\s*B24\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  cleaned = cleaned.replace(/[-|:\s]+$/, '').trim();

  if (/^Hab\s+\d+/i.test(cleaned)) {
    return cleaned;
  }

  const roomMatch = cleaned.match(/(?:habitación|habitacion|hab\.?)\s*(\d+[A-Za-z]?)/i);
  if (roomMatch && roomMatch[1]) {
    const roomStr = `Hab ${roomMatch[1]}`;
    let sobreStr = '';
    if (accName) {
      const aUpper = accName.trim().toUpperCase();
      if (aUpper.startsWith('SOBRE')) sobreStr = accName.trim();
      else if (/^S\d{2}$/.test(aUpper)) sobreStr = `Sobre ${aUpper}`;
    }
    if (!sobreStr && paymentMethod === 'efectivo') {
      const sobreMatch = cleaned.match(/(?:sobre|caja)\s*(?:en\s+sobre:?\s*)?(S\d{2}|[A-Za-z0-9_ -]+)/i);
      if (sobreMatch) {
        const val = sobreMatch[1].trim();
        if (/^S\d{2}$/i.test(val)) sobreStr = `Sobre ${val.toUpperCase()}`;
        else if (val.toLowerCase().startsWith('sobre')) sobreStr = val;
      }
    }

    const guestMatch = cleaned.match(/^([^-–(]+?)(?:\s*\([^)]*\))?\s*(?:de la Habitación|de la hab|-|$)/i);
    const guestName = guestMatch ? guestMatch[1].trim() : '';

    let rest = cleaned;
    if (guestName) {
      rest = rest.replace(new RegExp(`^${guestName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), '');
    }
    rest = rest
      .replace(/(?:de la Habitación|de la hab|habitación|habitacion|hab\.?)\s*\d+[A-Za-z]?/gi, '')
      .replace(/^\s*[-–\s]+/, '')
      .trim();

    return [roomStr, sobreStr, guestName, rest].filter(Boolean).join(' - ');
  }

  return cleaned;
};

const getLocalDateString = (d: Date = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
 
const ENVELOPES = Array.from({ length: 99 }, (_, i) => 'S' + String(i + 1).padStart(2, '0'));

export default function FinanzasPage() {
  // PIN Locking System (Removido por solicitud del cliente: entrada directa)
  const [pinLocked, setPinLocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [validatingPin, setValidatingPin] = useState(false);
 
  // Tipos de cambio dinámicos (Google/ExchangeRate-API)
  const [rates, setRates] = useState<Record<string, number>>({ USD: 17.50, EUR: 18.80, MXN: 1.0 });
 
  // Transferencias entre cuentas
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferFromId, setTransferFromId] = useState('');
  const [transferToId, setTransferToId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDate, setTransferDate] = useState(getLocalDateString());
  const [transferDescription, setTransferDescription] = useState('');
 
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [accName, setAccName] = useState('');
  const [accGroupType, setAccGroupType] = useState<'EFECTIVO' | 'BANCOS' | 'AHORROS' | 'EXTRANJERO' | 'CUENTAS X COBRAR' | 'CUENTAS X PAGAR' | 'COMISIONES'>('EFECTIVO');
  const [accBalance, setAccBalance] = useState('');
  const [accCurrency, setAccCurrency] = useState('MXN');
  const [isSavingAcc, setIsSavingAcc] = useState(false);
 
  // Filtros de rango de fechas en Registro
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterAccountId, setFilterAccountId] = useState<string>('todo');
  const [showAccountOrderModal, setShowAccountOrderModal] = useState(false);
  const [showExportChoiceModal, setShowExportChoiceModal] = useState(false);
  const [showPreviewReportModal, setShowPreviewReportModal] = useState(false);
  const [renamingAccount, setRenamingAccount] = useState<string | null>(null);
  const [renamingNewName, setRenamingNewName] = useState('');
 
  const OFFICIAL_ORDER = [
    'EFE PEND',
    'EFE HUX',
    'EFE TRC',
    'EFE USD',
    'HSBC FISCAL',
    'MERCADO PAGO',
    'BANAMEX',
    'SANTANDER',
    'BBVA RICKY',
    'INV. ROL',
    'INV LAU',
    'BOOKING',
    'WISE',
    'PAYPAL',
    'BBVA €',
    'IBC ROL',
    'IBC LAU',
    'IBC ROLY'
  ];
 
  const financeGroups = [
    { type: 'EFECTIVO', title: 'Efectivo', icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
    { type: 'BANCOS', title: 'Bancos', icon: Landmark, color: 'text-blue-600', bg: 'bg-blue-50', iconColor: 'text-blue-600' },
    { type: 'CUENTAS X COBRAR', title: 'Cuentas x Cobrar', icon: ArrowLeft, color: 'text-amber-600', bg: 'bg-amber-50', iconColor: 'text-amber-600' },
    { type: 'CUENTAS X PAGAR', title: 'Cuentas x Pagar', icon: ArrowRight, color: 'text-rose-600', bg: 'bg-rose-50', iconColor: 'text-rose-600' },
    { type: 'AHORROS', title: 'Ahorros', icon: PiggyBank, color: 'text-purple-600', bg: 'bg-purple-50', iconColor: 'text-purple-600' },
    { type: 'EXTRANJERO', title: 'Extranjero', icon: Globe, color: 'text-indigo-600', bg: 'bg-indigo-50', iconColor: 'text-indigo-600' },
    { type: 'COMISIONES', title: 'Comisiones', icon: Percent, color: 'text-orange-600', bg: 'bg-orange-50', iconColor: 'text-orange-600' },
  ] as const;

  
 
  // Evaluador de expresiones matemáticas seguro
  const evaluateMath = (expr: string): number => {
    if (!expr) return 0;
    let cleaned = expr.replace(/^=/, '').replace(/[^\d+\-*/.()]/g, '');
    if (!cleaned) return 0;
    try {
      const fn = new Function(`return (${cleaned})`);
      const result = fn();
      return isNaN(result) || !isFinite(result) ? 0 : result;
    } catch (e) {
      return 0;
    }
  };

  useEffect(() => {
    const checkPin = async () => {
      const activePin = sessionStorage.getItem('jaroje_session_pin') || '';
      if (activePin) {
        const isValid = await validatePinAsync(activePin, 'admin');
        if (isValid) {
          setPinLocked(false);
          return;
        }
      }
      setPinLocked(true);
    };
    checkPin();
  }, []);

  // Fetching de tipos de cambio dinámicos en vivo
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        if (res.ok) {
          const data = await res.json();
          if (data && data.rates && data.rates.MXN) {
            const mxnRate = data.rates.MXN;
            setRates({
              USD: mxnRate,
              EUR: mxnRate / (data.rates.EUR || 1),
              MXN: 1.0
            });
            console.log("Tipos de cambio cargados en vivo:", { USD: mxnRate, EUR: mxnRate / (data.rates.EUR || 1) });
          }
        }
      } catch (err) {
        console.warn("Fallo al jalar tipo de cambio de API, usando fallbacks:", err);
      }
    };
    fetchRates();
  }, []);

  

  useEffect(() => {
    if (pinInput.length === 4) {
      const validate = async () => {
        setValidatingPin(true);
        setPinError(false);
        try {
          const isValid = await validatePinAsync(pinInput, 'admin');
          if (isValid) {
            sessionStorage.setItem('jaroje_session_pin', pinInput);
            setPinLocked(false);
            window.dispatchEvent(new Event('sync-copilot'));
          } else {
            setPinError(true);
            setPinInput('');
          }
        } catch (e) {
          setPinError(true);
          setPinInput('');
        } finally {
          setValidatingPin(false);
        }
      };
      validate();
    }
  }, [pinInput]);

  const handleDigitPress = (d: string) => {
    if (d === '⌫') {
      setPinInput(p => p.slice(0, -1));
    } else if (d !== '') {
      if (pinInput.length < 4) {
        setPinInput(p => p + d);
      }
    }
  };

  // Escuchar teclado físico para desbloquear el PIN
  useEffect(() => {
    if (!pinLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si el usuario está escribiendo en algún input (aunque en la pantalla de bloqueo no debería haber inputs enfocados)
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.key >= '0' && e.key <= '9') {
        handleDigitPress(e.key);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        handleDigitPress('⌫');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pinLocked, pinInput]);

  const [activeTab, setActiveTab] = useState<'libro' | 'registro' | 'otas'>('libro');
  const [selectedOta, setSelectedOta] = useState<'booking' | 'expedia'>('booking');
  
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtros específicos para la liquidación mensual de comisiones OTAs (Booking / Expedia)
  const [otaPeriodFilter, setOtaPeriodFilter] = useState<'historico' | 'futuras' | 'mes_actual' | 'mes_anterior' | 'este_ano' | 'custom'>('historico');
  const [otaStartDate, setOtaStartDate] = useState('');
  const [otaEndDate, setOtaEndDate] = useState('');
  const [otaStatusFilter, setOtaStatusFilter] = useState<'todos' | 'activos' | 'finalizadas' | 'canceladas'>('activos');
  const [otaSearchQuery, setOtaSearchQuery] = useState('');

  const [accountsOrder, setAccountsOrder] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Cargar el orden de cuentas guardado en el arranque o usar el oficial
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const version = localStorage.getItem('jaroje_accounts_order_version');
      if (version !== 'v3') {
        // Force reset to the new official order once
        localStorage.setItem('jaroje_accounts_order_version', 'v3');
        localStorage.setItem('jaroje_accounts_order', JSON.stringify(OFFICIAL_ORDER.map(x => x.trim().toUpperCase())));
        setAccountsOrder(OFFICIAL_ORDER.map(x => x.trim().toUpperCase()));
        return;
      }

      const saved = localStorage.getItem('jaroje_accounts_order');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setAccountsOrder(parsed.map(x => String(x).trim().toUpperCase()));
            return;
          }
        } catch (e) {
          console.warn("Error parsing saved accounts order:", e);
        }
      }
      setAccountsOrder(OFFICIAL_ORDER.map(x => x.trim().toUpperCase()));
    }
  }, []);

  // Auto-sincronizar el orden de cuentas cuando Supabase cargue nuevas cuentas
  useEffect(() => {
    if (accounts.length > 0 && accountsOrder.length > 0) {
      const activeNames = accounts.map(a => a.name.trim().toUpperCase());
      const currentOrdered = accountsOrder.filter(name => activeNames.includes(name));
      const missing = activeNames.filter(name => !currentOrdered.includes(name));
      
      if (missing.length > 0) {
        const merged = [...currentOrdered, ...missing];
        setAccountsOrder(merged);
        localStorage.setItem('jaroje_accounts_order', JSON.stringify(merged));
      } else if (currentOrdered.length !== accountsOrder.length) {
        setAccountsOrder(currentOrdered);
        localStorage.setItem('jaroje_accounts_order', JSON.stringify(currentOrdered));
      }
    }
  }, [accounts, accountsOrder]);

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
  const [formCategory, setFormCategory] = useState('Proveedores');
  const [formDescription, setFormDescription] = useState('');
  const [formAccountId, setFormAccountId] = useState('');
  const [formEnvelope, setFormEnvelope] = useState('');
  const [formDate, setFormDate] = useState(getLocalDateString());
  const [isSaving, setIsSaving] = useState(false);



  // States for absolute resetting of finances
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    
    try {
      const [accRes, recRes, apiRes] = await Promise.all([
        supabase.from('accounts').select('*').order('sort_index', { ascending: true }).order('name', { ascending: true }),
        supabase.from('finances').select('*, accounts(name)').order('date', { ascending: false }).order('created_at', { ascending: false }),
        fetch('/api/reservas?includeCancelled=true&t=' + Date.now()).then(r => r.json()).catch(err => {
          console.error("Error fetching /api/reservas in Finanzas:", err);
          return null;
        })
      ]);
      
      if (!accRes.error) setAccounts(accRes.data || []);
      if (!recRes.error) setRecords(recRes.data || []);
      
      let rawList: any[] = [];
      if (apiRes) {
        if (Array.isArray(apiRes)) {
          rawList = apiRes;
        } else if (apiRes.data && Array.isArray(apiRes.data)) {
          rawList = apiRes.data;
        } else if (apiRes.bookings && Array.isArray(apiRes.bookings)) {
          rawList = apiRes.bookings;
        }
      }

      if (rawList.length > 0) {
        setReservations(rawList);
      } else {
        const { data: b24Data } = await supabase.from('beds24_reservations').select('*').order('check_in', { ascending: false });
        if (b24Data && b24Data.length > 0) {
          setReservations(b24Data);
        }
      }
    } catch (err) {
      console.error("[Finanzas] Error al cargar datos:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Abrir automáticamente el modal si viene desde el botón FAB del más
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('action') === 'new_movement') {
        setEditingRecord(null);
        setFormType('gasto');
        setFormCategory('Proveedores');
        setFormAmount('');
        setFormDescription('');
        setFormEnvelope('');
        setFormDate(getLocalDateString());
        setShowMoveModal(true);
      }
    }
  }, []);

  const convertToMXN = (balance: number, currency: string) => {
    const curr = (currency || 'MXN').toUpperCase();
    const rate = rates[curr] || 1.0;
    return balance * rate;
  };

  const resolvePaymentMethod = (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return 'transferencia';
    if (acc.group_type === 'EFECTIVO' || (acc.name || '').toUpperCase().includes('EFECTIVO')) {
      return 'efectivo';
    }
    return 'transferencia';
  };

  const executeSaveMovement = async (selectedType: 'ingreso' | 'gasto') => {
    const evaluatedAmount = evaluateMath(formAmount);
    if (!formAmount || evaluatedAmount <= 0 || !formAccountId) {
      alert("Por favor ingresa un monto válido (número o expresión como 500+250)");
      return;
    }
    
    setIsSaving(true);

    let finalDescription = formEnvelope ? `${formEnvelope} - ${formDescription}`.trim() : formDescription;
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
      
      finalDescription = `${formEnvelope ? `${formEnvelope} - ` : ''}${formDescription}${tagsStr}`.trim();
    }

    const resolvedPaymentMethod = resolvePaymentMethod(formAccountId);

    const newRecord = {
      type: selectedType,
      amount: evaluatedAmount,
      category: selectedType === 'ingreso' && formCategory === 'Suministros' ? 'Reserva' : formCategory,
      description: finalDescription,
      account_id: formAccountId,
      payment_method: resolvedPaymentMethod,
      date: formDate
    };

    if (editingRecord) {
      // 1. Revert old balance
      if (editingRecord.account_id) {
        const oldAcc = accounts.find(a => a.id === editingRecord.account_id);
        if (oldAcc) {
          const revertChange = editingRecord.type === 'ingreso' ? -editingRecord.amount : editingRecord.amount;
          await supabase.from('accounts').update({ balance: oldAcc.balance + revertChange }).eq('id', oldAcc.id);
          oldAcc.balance += revertChange;
        }
      }
      
      // 2. Update Record
      const { error: updateErr } = await supabase.from('finances').update(newRecord).eq('id', editingRecord.id);
      
      // 3. Apply new balance
      if (!updateErr) {
        const newAcc = accounts.find(a => a.id === formAccountId);
        if (newAcc) {
          const applyChange = selectedType === 'ingreso' ? evaluatedAmount : -evaluatedAmount;
          await supabase.from('accounts').update({ balance: newAcc.balance + applyChange }).eq('id', newAcc.id);
        }

        // Registrar auditoría de actualización
        try {
          const activeEmp = getActiveEmployee('recepcion');
          const matchedAcc = accounts.find(a => a.id === formAccountId)?.name || 'Desconocido';
          await fetch('/api/employee-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employee_num: activeEmp?.employee_num || '999',
              employee_name: activeEmp?.full_name || 'Administrador',
              department: activeEmp?.department || 'recepcion',
              module: 'finanzas',
              action: 'movimiento_financiero',
              details: JSON.stringify({
                text: `Movimiento Contable (ID: ${editingRecord.id}) - Actualizó ${selectedType === 'ingreso' ? 'Ingreso' : 'Gasto'} de $${evaluatedAmount} en cuenta ${matchedAcc} (${newRecord.category}).`,
                finance: {
                  type: selectedType,
                  amount: evaluatedAmount,
                  category: newRecord.category,
                  account: matchedAcc,
                  description: newRecord.description,
                  id: editingRecord.id
                }
              })
            })
          });
        } catch (logErr) {
          console.error("Error registrando log de actualización:", logErr);
        }
      }
    } else {
      // 1. Insert Record
      const { error: insertErr } = await supabase.from('finances').insert([newRecord]);
      // 2. Update Account Balance
      if (!insertErr) {
        const account = accounts.find(a => a.id === formAccountId);
        if (account) {
          const balanceChange = selectedType === 'ingreso' ? evaluatedAmount : -evaluatedAmount;
          await supabase.from('accounts').update({ balance: account.balance + balanceChange }).eq('id', account.id);
        }

        // Registrar auditoría de creación
        try {
          const activeEmp = getActiveEmployee('recepcion');
          const matchedAcc = accounts.find(a => a.id === formAccountId)?.name || 'Desconocido';
          await fetch('/api/employee-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employee_num: activeEmp?.employee_num || '999',
              employee_name: activeEmp?.full_name || 'Administrador',
              department: activeEmp?.department || 'recepcion',
              module: 'finanzas',
              action: 'movimiento_financiero',
              details: JSON.stringify({
                text: `Movimiento Contable - Creó nuevo ${selectedType === 'ingreso' ? 'Ingreso' : 'Gasto'} de $${evaluatedAmount} en cuenta ${matchedAcc} (${newRecord.category}).`,
                finance: {
                  type: selectedType,
                  amount: evaluatedAmount,
                  category: newRecord.category,
                  account: matchedAcc,
                  description: newRecord.description
                }
              })
            })
          });
        } catch (logErr) {
          console.error("Error registrando log de creación:", logErr);
        }
      }
    }

    setShowMoveModal(false);
    setEditingRecord(null);
    setFormEnvelope('');
    fetchData();
    setIsSaving(false);
  };

  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSaveMovement(formType);
  };

  const handleDeleteMovement = async () => {
    if (!editingRecord || !confirm("¿Seguro que deseas eliminar este movimiento?")) return;
    setIsSaving(true);
    
    // 1. Delete Record
    const { error } = await supabase.from('finances').delete().eq('id', editingRecord.id);
    
    // 2. Revert Balance
    if (!error) {
      if (editingRecord.account_id) {
        const acc = accounts.find(a => a.id === editingRecord.account_id);
        if (acc) {
          const revertChange = editingRecord.type === 'ingreso' ? -editingRecord.amount : editingRecord.amount;
          await supabase.from('accounts').update({ balance: acc.balance + revertChange }).eq('id', acc.id);
        }
      }

      // Registrar auditoría de eliminación
      try {
        const activeEmp = getActiveEmployee('recepcion');
        const matchedAcc = accounts.find(a => a.id === editingRecord.account_id)?.name || 'Desconocido';
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: activeEmp?.employee_num || '999',
            employee_name: activeEmp?.full_name || 'Administrador',
            department: activeEmp?.department || 'recepcion',
            module: 'finanzas',
            action: 'movimiento_financiero',
            details: JSON.stringify({
              text: `Movimiento Contable (ID: ${editingRecord.id}) - Eliminó ${editingRecord.type === 'ingreso' ? 'Ingreso' : 'Gasto'} de $${editingRecord.amount} en cuenta ${matchedAcc} (${editingRecord.category || 'Sin categoría'}).`,
              finance: {
                type: editingRecord.type,
                amount: editingRecord.amount,
                category: editingRecord.category || 'Sin categoría',
                account: matchedAcc,
                description: editingRecord.description,
                id: editingRecord.id,
                deleted: true
              }
            })
          })
        });
      } catch (logErr) {
        console.error("Error registrando log de eliminación:", logErr);
      }
    }
    
    setShowMoveModal(false);
    setEditingRecord(null);
    setFormEnvelope('');
    fetchData();
    setIsSaving(false);
  };

  // Lógica de Transferencias Atómicas entre Cuentas
  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const evaluatedAmount = evaluateMath(transferAmount);
    if (!transferFromId || !transferToId || evaluatedAmount <= 0) {
      alert("Por favor selecciona las cuentas y un monto válido");
      return;
    }

    if (transferFromId === transferToId) {
      alert("No puedes transferir a la misma cuenta");
      return;
    }

    const fromAcc = accounts.find(a => a.id === transferFromId);
    const toAcc = accounts.find(a => a.id === transferToId);
    if (!fromAcc || !toAcc) return;

    // Conversión de divisas si transfieren entre monedas distintas (ej. USD a MXN)
    const convertedFromAmount = evaluatedAmount;
    // Si la moneda origen es distinta a la destino, realizamos la conversión contable
    let convertedToAmount = evaluatedAmount;
    if (fromAcc.currency !== toAcc.currency) {
      // Convertir de origen a MXN, luego de MXN a destino
      const amountInMXN = convertToMXN(evaluatedAmount, fromAcc.currency);
      const destRate = toAcc.currency === 'USD' ? rates.USD : toAcc.currency === 'EUR' ? rates.EUR : 1.0;
      convertedToAmount = amountInMXN / destRate;
    }

    setIsSaving(true);

    try {
      // 1. Registro de gasto en sobre origen
      const recordGasto = {
        type: 'gasto',
        amount: convertedFromAmount,
        category: 'Traspaso',
        description: `Traspaso enviado a ${toAcc.name} (${toAcc.currency}). ${transferDescription}`.trim(),
        account_id: transferFromId,
        payment_method: resolvePaymentMethod(transferFromId),
        date: transferDate || getLocalDateString()
      };

      // 2. Registro de ingreso en sobre destino
      const recordIngreso = {
        type: 'ingreso',
        amount: convertedToAmount,
        category: 'Traspaso',
        description: `Traspaso recibido desde ${fromAcc.name} (${fromAcc.currency}). ${transferDescription}`.trim(),
        account_id: transferToId,
        payment_method: resolvePaymentMethod(transferToId),
        date: transferDate || getLocalDateString()
      };

      const [gastoRes, ingresoRes] = await Promise.all([
        supabase.from('finances').insert([recordGasto]),
        supabase.from('finances').insert([recordIngreso])
      ]);

      if (gastoRes.error || ingresoRes.error) {
        throw new Error(gastoRes.error?.message || ingresoRes.error?.message || "Error al registrar movimientos de traspaso");
      }

      // 3. Actualizar balances de ambas cuentas en Supabase
      await Promise.all([
        supabase.from('accounts').update({ balance: fromAcc.balance - convertedFromAmount }).eq('id', fromAcc.id),
        supabase.from('accounts').update({ balance: toAcc.balance + convertedToAmount }).eq('id', toAcc.id)
      ]);

      // Registrar auditoría de transferencia
      try {
        const activeEmp = getActiveEmployee('recepcion');
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: activeEmp?.employee_num || '999',
            employee_name: activeEmp?.full_name || 'Administrador',
            department: activeEmp?.department || 'recepcion',
            module: 'finanzas',
            action: 'movimiento_financiero',
            details: JSON.stringify({
              text: `Traspaso de Fondos - Realizó un traspaso de $${convertedFromAmount} ${fromAcc.currency} desde ${fromAcc.name} a ${toAcc.name} (Monto recibido: $${convertedToAmount} ${toAcc.currency}).`,
              finance: {
                type: 'traspaso',
                amount: convertedFromAmount,
                currency: fromAcc.currency,
                toAmount: convertedToAmount,
                toCurrency: toAcc.currency,
                account: fromAcc.name,
                toAccount: toAcc.name,
                description: transferDescription || 'Traspaso de fondos',
                date: transferDate || getLocalDateString()
              }
            })
          })
        });
      } catch (logErr) {
        console.error("Error registrando log de transferencia:", logErr);
      }

      alert("✅ Transferencia completada con éxito.");
      setShowTransferModal(false);
      setTransferFromId('');
      setTransferToId('');
      setTransferAmount('');
      setTransferDate(getLocalDateString());
      setTransferDescription('');
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert("❌ Error al procesar la transferencia: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Lógica para Agregar Cuentas/Sobres
  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName) return alert("Por favor ingresa un nombre para la cuenta");

    setIsSavingAcc(true);
    const balanceNum = Number(accBalance) || 0;

    try {
      const { error } = await supabase.from('accounts').insert([{
        name: accName,
        group_type: accGroupType,
        balance: balanceNum,
        currency: accCurrency
      }]);

      if (error) throw error;

      // Si se abre con balance inicial, registrar movimiento contable de ajuste de ingreso
      if (balanceNum > 0) {
        // Encontrar la cuenta creada
        const { data: newAcc } = await supabase.from('accounts').select('id').eq('name', accName).single();
        if (newAcc) {
          await supabase.from('finances').insert([{
            type: 'ingreso',
            amount: balanceNum,
            category: 'Ajuste',
            description: 'Saldo inicial de apertura de la cuenta',
            account_id: newAcc.id,
            payment_method: 'efectivo',
            date: getLocalDateString()
          }]);
        }
      }

      alert("✅ Cuenta creada con éxito.");
      setShowAddAccountModal(false);
      setAccName('');
      setAccBalance('');
      setAccCurrency('MXN');
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert("❌ Error al crear la cuenta: " + err.message);
    } finally {
      setIsSavingAcc(false);
    }
  };

  // Lógica para Eliminar Cuentas de Forma Segura (Preservando Integridad)
  const handleDeleteAccount = async (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return;

    if (acc.balance !== 0) {
      if (!confirm(`⚠️ Esta cuenta tiene un saldo activo de $${Math.round(acc.balance).toLocaleString('es-MX')} ${acc.currency}. Si la eliminas, perderás este saldo en el total general. ¿Deseas continuar?`)) {
        return;
      }
    } else {
      if (!confirm(`¿Seguro que deseas eliminar la cuenta "${acc.name}"?`)) {
        return;
      }
    }

    try {
      // 1. Poner en nulo el id de cuenta de los movimientos para mantener reportes globales sin FK error
      await supabase.from('finances').update({ account_id: null }).eq('account_id', accountId);

      // 2. Eliminar la cuenta
      const { error } = await supabase.from('accounts').delete().eq('id', accountId);
      if (error) throw error;

      alert("✅ Cuenta eliminada con éxito.");
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert("❌ Error al eliminar la cuenta: " + err.message);
    }
  };

  const downloadBackupCSV = () => {
    if (records.length === 0) return;
    const headers = ["Fecha", "Tipo", "Categoría", "Monto", "Cuenta", "Descripción"];
    const csvContent = [
      headers.join(","),
      ...records.map(r => [
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
    link.setAttribute("download", `RESPALDO_FINANZAS_PRE_RESET_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleResetFinances = async () => {
    if (resetConfirmText !== 'RESET') {
      alert("Por favor, escribe RESET en mayúsculas para confirmar.");
      return;
    }
    
    setIsResetting(true);
    try {
      // 1. Ejecutar la limpieza en backend primero
      const response = await fetch('/api/finances/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm_text: 'RESET',
          employee_num: '999',
          employee_name: 'Administrador Principal'
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        // 2. Descargar respaldo automático después de la respuesta exitosa
        if (records.length > 0) {
          downloadBackupCSV();
        }
        alert("✅ " + data.message + "\n\nSe ha descargado automáticamente un archivo CSV con el respaldo del historial anterior en tu dispositivo para seguridad.");
        setShowResetModal(false);
        setResetConfirmText('');
        fetchData(); // Refresca los saldos y el historial a cero
      } else {
        alert("❌ Error: " + (data.error || "Ocurrió un error inesperado."));
      }
    } catch (err: any) {
      console.error(err);
      alert("⚠️ Error de red al intentar restablecer las finanzas: " + err.message);
    } finally {
      setIsResetting(false);
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
                details: JSON.stringify({
                  text: `Reserva (B24 ID: ${actualBookId}) - Concilió manualmente pago pendiente a Beds24 de $${record.amount} (Registro ID: ${record.id}).`,
                  finance: {
                    type: 'reconciled',
                    amount: record.amount,
                    bookingId: actualBookId,
                    description: `Conciliación Beds24 - Registro ID: ${record.id}`
                  }
                })
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
    // 1. Filtrar por tiempo (hoy, semana, mes, todo)
    let matchTime = true;
    if (filterType !== 'todo') {
      const datePart = (r.date || '').substring(0, 10);
      const rDate = new Date(datePart + 'T12:00:00Z'); // Evitar problemas de timezone
      const today = new Date();
      if (filterType === 'hoy') {
        matchTime = rDate.toDateString() === today.toDateString();
      } else if (filterType === 'semana') {
        const lastWeek = new Date(today);
        lastWeek.setDate(lastWeek.getDate() - 7);
        matchTime = rDate >= lastWeek;
      } else if (filterType === 'mes') {
        matchTime = rDate.getMonth() === today.getMonth() && rDate.getFullYear() === today.getFullYear();
      }
    }

    // 2. Filtrar por rango de fechas
    let matchDateRange = true;
    const datePartRange = (r.date || '').substring(0, 10);
    if (startDate) {
      matchDateRange = matchDateRange && (datePartRange >= startDate);
    }
    if (endDate) {
      matchDateRange = matchDateRange && (datePartRange <= endDate);
    }

    // 3. Filtrar por búsqueda de texto
    let matchSearch = true;
    if (searchQuery.trim()) {
      const query = normalizeText(searchQuery).trim();
      const desc = normalizeText(r.description || '');
      const cat = normalizeText(r.category || '');
      const amt = String(r.amount || '');
      const accountName = normalizeText(r.accounts?.name || '');
      const dateStr = String(r.date || '');
      const typeStr = normalizeText(r.type || '');

      matchSearch = desc.includes(query) || 
                    cat.includes(query) || 
                    amt.includes(query) || 
                    accountName.includes(query) ||
                    dateStr.includes(query) ||
                    typeStr.includes(query);
    }

    // 4. Filtrar por cuenta seleccionada
    let matchAccount = true;
    if (filterAccountId && filterAccountId !== 'todo') {
      matchAccount = r.account_id === filterAccountId;
    }

    return matchTime && matchDateRange && matchSearch && matchAccount;
  });

  const isMobileOrPWA = () => {
    if (typeof window === 'undefined') return false;
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isMobile = /android|iphone|ipad|ipod/i.test(userAgent);
    const isStandalone = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;
    return isMobile || isStandalone;
  };

  const exportToCSV = () => {
    if (filteredRecords.length === 0) return alert("No hay datos para exportar.");
    setShowExportChoiceModal(true);
  };

  const executeDownloadFinanceReport = () => {
    setShowExportChoiceModal(false);
    
    // Si es móvil o modo PWA standalone, delegamos al Web Share API para abrir el modal nativo "Guardar en Archivos"
    // Esto evita que iOS PWA navegue dentro del contenedor y secuestre la pantalla con una vista de archivo estática.
    if (isMobileOrPWA()) {
      executeShareFinanceReport();
      return;
    }

    const url = `/api/finances/export?time=${filterType}&startDate=${startDate}&endDate=${endDate}&account=${filterAccountId}&search=${encodeURIComponent(searchQuery)}`;
    
    // Force opening in external browser window/tab to prevent PWA container lock-out
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.setAttribute('download', `Finanzas_Jaroje_${getLocalDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const executeShareFinanceReport = async () => {
    const url = `/api/finances/export?time=${filterType}&startDate=${startDate}&endDate=${endDate}&account=${filterAccountId}&search=${encodeURIComponent(searchQuery)}`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Error al obtener los datos");
      const csvText = await response.text();
      
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const filename = `Finanzas_Jaroje_${getLocalDateString()}.csv`;
      const file = new File([blob], filename, { type: 'text/csv' });
      
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Reporte de Finanzas',
          text: 'Reporte financiero exportado desde StaySync'
        });
      } else {
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }
    } catch (err) {
      console.error(err);
      window.open(url, '_blank');
    }
  };

  const sortAccounts = (accs: any[]) => {
    return [...accs].sort((a, b) => {
      const sortA = a.sort_index !== undefined && a.sort_index !== null ? a.sort_index : 999;
      const sortB = b.sort_index !== undefined && b.sort_index !== null ? b.sort_index : 999;
      if (sortA !== sortB) return sortA - sortB;
      
      const nameA = a.name.trim().toUpperCase();
      const nameB = b.name.trim().toUpperCase();
      return nameA.localeCompare(nameB);
    });
  };

  const moveAccount = async (accName: string, direction: 'up' | 'down') => {
    // 1. Obtener la lista ordenada actual
    const sorted = sortAccounts(accounts);
    const index = sorted.findIndex(a => a.name.trim().toUpperCase() === accName.trim().toUpperCase());
    if (index === -1) return;

    const targetIndex = index + (direction === 'up' ? -1 : 1);
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    // Reordenar el arreglo localmente
    const newSorted = [...sorted];
    const [movedItem] = newSorted.splice(index, 1);
    newSorted.splice(targetIndex, 0, movedItem);

    // Asignar a cada elemento su índice secuencial
    const updatedAccounts = accounts.map(a => {
      const newIdx = newSorted.findIndex(item => item.id === a.id);
      return { ...a, sort_index: newIdx };
    });
    setAccounts(updatedAccounts);

    // Actualizar en Supabase en segundo plano todos los que cambiaron su índice
    try {
      const promises = updatedAccounts.map(a => 
        supabase.from('accounts').update({ sort_index: a.sort_index }).eq('id', a.id)
      );
      await Promise.all(promises);
    } catch (e) {
      console.error("Error al guardar el nuevo orden en Supabase:", e);
    }
  };

  const handleRenameAccount = async (accId: string, currentName: string) => {
    const clean = renamingNewName.trim();
    if (!clean) return alert("El nombre no puede estar vacío.");
    
    const duplicate = accounts.find(a => a.id !== accId && a.name.trim().toUpperCase() === clean.toUpperCase());
    if (duplicate) return alert(`Ya existe una cuenta con el nombre "${clean}".`);
    
    setIsSavingAcc(true);
    const { error } = await supabase
      .from('accounts')
      .update({ name: clean })
      .eq('id', accId);
      
    setIsSavingAcc(false);
    if (error) {
      console.error(error);
      alert("Error al renombrar cuenta en Supabase");
    } else {
      setAccounts(accounts.map(a => a.id === accId ? { ...a, name: clean } : a));
      setRenamingAccount(null);
      setRenamingNewName('');
      
      try {
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: '999',
            employee_name: 'Administrador',
            department: 'recepcion',
            module: 'finanzas',
            action: 'renombrar_cuenta',
            details: JSON.stringify({
              text: `Cuenta "${currentName}" - Renombró cuenta a "${clean}".`,
              account: {
                oldName: currentName,
                newName: clean
              }
            })
          })
        });
      } catch (err) {
        console.error("Error al registrar auditoría:", err);
      }
    }
  };

  const otaPeriodLabels: Record<string, string> = {
    historico: 'Histórico Completo',
    futuras: 'Futuras / Próximas',
    mes_actual: 'Este Mes',
    mes_anterior: 'Mes Anterior',
    este_ano: 'Este Año',
    custom: 'Rango Personalizado'
  };

  const isOtaMatch = (r: any, targetOta: 'booking' | 'expedia') => {
    const ch = String(r.channel || '').toLowerCase();
    const g = String(r.guest_name || '').toLowerCase();
    const s = String(r.source || r.apiSource || r.referer || r.api_source || (r.raw_data && (r.raw_data.source || r.raw_data.channel || r.raw_data.referer)) || '').toLowerCase();
    const notes = String(r.notes || r.comments || '').toLowerCase();
    if (targetOta === 'booking') {
      return ch.includes('booking') || ch.includes('bdc') || g.includes('booking') || g.includes('pagado b') || s.includes('booking') || notes.includes('booking');
    }
    if (targetOta === 'expedia') {
      return ch.includes('expedia') || ch.includes('exp') || g.includes('expedia') || s.includes('expedia') || notes.includes('expedia');
    }
    return false;
  };

  const getOtaReservationMetrics = (r: any, otaType: 'booking' | 'expedia') => {
    const rawPrice = Number(r.price || r.price_estimate || 0);
    const rawDeposit = Number(r.deposit || r.actualPaid || r.rawDeposit || 0);
    
    let totalBruto = rawPrice;
    if (totalBruto <= 0 && rawDeposit > 0) {
      totalBruto = rawDeposit;
    }

    const ch = (r.channel || '').toLowerCase();
    const isBooking = otaType === 'booking' || ch.includes('booking');

    // Desglose oficial de la factura de comisiones OTA:
    // Booking.com:
    // 1. Comisión Base de Booking: 18% sobre la tarifa base de la habitación (sin impuestos)
    // 2. Cargo por procesamiento de tarjeta (Payment Charge): 3.1% sobre el cobro total procesado
    // Total Factura Booking: ~18.23% del total pagado por el huésped
    // (El descuento Genius 10% ya está aplicado en la tarifa vendida y no se paga como comisión en factura)
    if (isBooking) {
      let roomBase = 0;
      if (r.invoice_items && Array.isArray(r.invoice_items) && r.invoice_items.length > 0) {
        const roomItems = r.invoice_items.filter((item: any) => {
          const type = (item.type || '').toLowerCase();
          const desc = (item.description || '').toLowerCase();
          return type === 'charge' && !desc.includes('iva') && !desc.includes('impuesto') && !desc.includes('tax') && !desc.includes('cancel') && item.metaType !== 'beds24_commission_info';
        });
        if (roomItems.length > 0) {
          roomBase = roomItems.reduce((acc: number, it: any) => acc + (Number(it.lineTotal !== undefined ? it.lineTotal : (it.amount || 0))), 0);
        }
      }
      
      // Si no hay desglose en invoice_items, en México la tarifa base antes de IVA (16%) e ISH (3%) es Total Bruto / 1.19
      if (roomBase <= 0 && totalBruto > 0) {
        roomBase = Number((totalBruto / 1.19).toFixed(2));
      }

      // 1. Comisión base Booking: 18% sobre la tarifa base de la habitación
      let bookingBaseCommission = Number((roomBase * 0.18).toFixed(2));

      // 2. Cargo por procesamiento de tarjeta: 3.1% sobre el total cobrado/bruto
      let cardProcessing = Number((totalBruto * 0.031).toFixed(2));

      // 3. Comisión total a liquidar a Booking en la factura mensual
      let commission = Number((bookingBaseCommission + cardProcessing).toFixed(2));

      // Priorizar el campo 'commission' directo de Beds24 si viene disponible (ej. 553.62)
      const metaComm = (r.invoice_items || []).find((it: any) => it.metaType === 'beds24_commission_info');
      const rawComm = Number(r.commission || r.rawCommission || metaComm?.commission || 0);
      if (rawComm > 0) {
        commission = Number(rawComm.toFixed(2));
        if (cardProcessing > 0 && commission > cardProcessing) {
          bookingBaseCommission = Number((commission - cardProcessing).toFixed(2));
        }
      }

      const netRevenue = Number((totalBruto - commission).toFixed(2));
      const commissionPct = totalBruto > 0 ? ((commission / totalBruto) * 100).toFixed(2) : '18.23';

      return {
        totalBruto: Math.max(0, totalBruto),
        roomBase: Math.max(0, roomBase),
        commission: Math.max(0, commission),
        netRevenue: Math.max(0, netRevenue),
        commissionPct,
        breakdown: {
          bookingBaseCommission,
          cardProcessing,
          roomBase,
          totalPct: Number(commissionPct)
        }
      };
    } else {
      // Expedia: 15% flat de comisión
      const rawComm = Number(r.commission || r.rawCommission || 0);
      const commission = rawComm > 0 ? Number(rawComm.toFixed(2)) : Number((totalBruto * 0.15).toFixed(2));
      const netRevenue = Number((totalBruto - commission).toFixed(2));
      const commissionPct = totalBruto > 0 ? ((commission / totalBruto) * 100).toFixed(2) : '15.00';

      return {
        totalBruto: Math.max(0, totalBruto),
        roomBase: Math.max(0, totalBruto),
        commission: Math.max(0, commission),
        netRevenue: Math.max(0, netRevenue),
        commissionPct,
        breakdown: {
          bookingBaseCommission: commission,
          cardProcessing: 0,
          roomBase: totalBruto,
          totalPct: Number(commissionPct)
        }
      };
    }
  };

  const otaAnalytics = useMemo(() => {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const currentYear = today.getFullYear();

    const firstDayCurrentMonth = format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd');
    const lastDayCurrentMonth = format(new Date(today.getFullYear(), today.getMonth() + 1, 0), 'yyyy-MM-dd');

    const firstDayPrevMonth = format(new Date(today.getFullYear(), today.getMonth() - 1, 1), 'yyyy-MM-dd');
    const lastDayPrevMonth = format(new Date(today.getFullYear(), today.getMonth(), 0), 'yyyy-MM-dd');

    const firstDayCurrentYear = `${currentYear}-01-01`;
    const lastDayCurrentYear = `${currentYear}-12-31`;

    const getOtaStats = (otaKey: 'booking' | 'expedia') => {
      const allForOta = reservations.filter(r => {
        const ch = (r.channel || '').toLowerCase();
        if (otaKey === 'booking') return ch.includes('booking');
        if (otaKey === 'expedia') return ch.includes('expedia');
        return false;
      });

      const filtered = allForOta.filter(r => {
        const inDate = r.check_in || '';
        const outDate = r.check_out || '';
        const isCancelled = r.status === 'cancelled';

        // 1. Filtro de estado
        if (otaStatusFilter === 'activos' && isCancelled) return false;
        if (otaStatusFilter === 'finalizadas' && (isCancelled || outDate > todayStr)) return false;
        if (otaStatusFilter === 'canceladas' && !isCancelled) return false;

        // 2. Filtro de periodo
        if (otaPeriodFilter === 'futuras' && inDate < todayStr) return false;
        if (otaPeriodFilter === 'mes_actual' && (inDate < firstDayCurrentMonth || inDate > lastDayCurrentMonth)) return false;
        if (otaPeriodFilter === 'mes_anterior' && (inDate < firstDayPrevMonth || inDate > lastDayPrevMonth)) return false;
        if (otaPeriodFilter === 'este_ano' && (inDate < firstDayCurrentYear || inDate > lastDayCurrentYear)) return false;
        if (otaPeriodFilter === 'custom') {
          if (otaStartDate && inDate < otaStartDate) return false;
          if (otaEndDate && inDate > otaEndDate) return false;
        }

        // 3. Filtro de búsqueda (nombre, id, habitacion)
        if (otaSearchQuery.trim()) {
          const q = otaSearchQuery.toLowerCase().trim();
          const matchName = (r.guest_name || '').toLowerCase().includes(q);
          const matchId = String(r.id || '').toLowerCase().includes(q);
          const matchRoom = (r.room_name || r.room || '').toLowerCase().includes(q);
          if (!matchName && !matchId && !matchRoom) return false;
        }

        return true;
      });

      let totalBruto = 0;
      let totalComision = 0;
      let totalNeto = 0;
      let totalNoches = 0;
      let totalBookingBaseCommission = 0;
      let totalCardProcessing = 0;
      let totalRoomBase = 0;

      const itemsWithMetrics = filtered.map(r => {
        const metrics = getOtaReservationMetrics(r, otaKey);
        totalBruto += metrics.totalBruto;
        totalComision += metrics.commission;
        totalNeto += metrics.netRevenue;
        totalBookingBaseCommission += metrics.breakdown.bookingBaseCommission;
        totalCardProcessing += metrics.breakdown.cardProcessing;
        totalRoomBase += metrics.breakdown.roomBase;

        let noches = 1;
        if (r.check_in && r.check_out) {
          const inD = new Date(r.check_in);
          const outD = new Date(r.check_out);
          noches = Math.max(1, Math.round((outD.getTime() - inD.getTime()) / (1000 * 60 * 60 * 24)));
        }
        totalNoches += noches;

        return {
          ...r,
          metrics,
          noches
        };
      });

      const avgCommissionPct = totalBruto > 0 ? ((totalComision / totalBruto) * 100).toFixed(1) : (otaKey === 'booking' ? '18.2' : '15.0');

      return {
        allCount: allForOta.length,
        filteredCount: filtered.length,
        totalBruto,
        totalComision,
        totalNeto,
        totalNoches,
        totalBookingBaseCommission,
        totalCardProcessing,
        totalRoomBase,
        avgCommissionPct,
        items: itemsWithMetrics
      };
    };

    const bookingStats = getOtaStats('booking');
    const expediaStats = getOtaStats('expedia');

    return {
      booking: bookingStats,
      expedia: expediaStats
    };
  }, [reservations, otaPeriodFilter, otaStartDate, otaEndDate, otaStatusFilter, otaSearchQuery]);

  const exportOtaToCSV = (otaName: string, items: any[]) => {
    if (!items || items.length === 0) {
      alert("No hay reservaciones de esta OTA para exportar con los filtros actuales.");
      return;
    }

    const isBooking = otaName.toLowerCase().includes('booking');
    const headers = isBooking
      ? [
          "ID Reserva", "Huesped", "Canal", "Habitacion", "Check-in", "Check-out", "Noches", 
          "Total Bruto (MXN)", "Tarifa Base Habitación (MXN)", "Comisión Booking 18% Base (MXN)", "Procesamiento Tarjeta 3.1% (MXN)", 
          "Total Comisión Factura Booking (MXN)", "% Comisión Efectivo", "Neto Hotel (MXN)", "Estado", "Telefono"
        ]
      : [
          "ID Reserva", "Huesped", "Canal", "Habitacion", "Check-in", "Check-out", "Noches", 
          "Total Bruto (MXN)", "Comisión OTA 15% (MXN)", "% Comisión", "Neto Hotel (MXN)", "Estado", "Telefono"
        ];
    
    const rows = items.map(item => {
      if (isBooking) {
        return [
          item.id,
          `"${(item.guest_name || '').replace(/"/g, '""')}"`,
          item.channel || otaName,
          `"${(item.room_name || '').replace(/"/g, '""')}"`,
          item.check_in || '',
          item.check_out || '',
          item.noches || 1,
          item.metrics?.totalBruto?.toFixed(2) || '0.00',
          item.metrics?.breakdown?.roomBase?.toFixed(2) || '0.00',
          item.metrics?.breakdown?.bookingBaseCommission?.toFixed(2) || '0.00',
          item.metrics?.breakdown?.cardProcessing?.toFixed(2) || '0.00',
          item.metrics?.commission?.toFixed(2) || '0.00',
          `${item.metrics?.commissionPct || '18.2'}%`,
          item.metrics?.netRevenue?.toFixed(2) || '0.00',
          item.status || '',
          `"${(item.guest_phone || '').replace(/"/g, '""')}"`
        ];
      }
      return [
        item.id,
        `"${(item.guest_name || '').replace(/"/g, '""')}"`,
        item.channel || otaName,
        `"${(item.room_name || '').replace(/"/g, '""')}"`,
        item.check_in || '',
        item.check_out || '',
        item.noches || 1,
        item.metrics?.totalBruto?.toFixed(2) || '0.00',
        item.metrics?.commission?.toFixed(2) || '0.00',
        `${item.metrics?.commissionPct || '15.0'}%`,
        item.metrics?.netRevenue?.toFixed(2) || '0.00',
        item.status || '',
        `"${(item.guest_phone || '').replace(/"/g, '""')}"`
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const filename = `Comisiones_${otaName.replace(/\s+/g, '_')}_${getLocalDateString()}.csv`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalGeneral = accounts
    .filter(curr => curr.group_type !== 'COMISIONES')
    .reduce((acc, curr) => acc + convertToMXN(curr.balance, curr.currency), 0);

  if (pinLocked) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-zinc-950 text-white text-center p-6 select-none">
        {/* Ambient background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-zinc-800 rounded-full blur-[120px] opacity-40 pointer-events-none" />

        <div className="w-16 h-16 bg-white/10 rounded-3xl flex items-center justify-center mb-4 border border-white/10 relative z-10 shadow-inner">
          <Lock size={28} className="text-white animate-pulse" />
        </div>
        
        <h2 className="text-xl font-bold tracking-tight text-white mb-2 relative z-10">
          Caja de Seguridad Bloqueada
        </h2>
        <p className="text-[13px] text-zinc-400 leading-relaxed max-w-[300px] mb-8 relative z-10">
          Esta vista contiene balances, cuentas contables e historial financiero del hotel. Introduce el PIN de administrador para desbloquear.
        </p>

        {/* PIN Indicators */}
        <div className="flex gap-5 mb-8 relative z-10">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                i < pinInput.length
                  ? pinError
                    ? "bg-red-500 border-red-500 scale-110"
                    : "bg-white border-white scale-110"
                  : "border-zinc-700 bg-transparent"
              }`}
            />
          ))}
        </div>

        {/* Pinpad tactile */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[280px] mb-6 relative z-10">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleDigitPress(d)}
              disabled={validatingPin}
              className={`h-14 rounded-2xl font-bold text-lg transition-all active:scale-90 flex items-center justify-center ${
                d === ''
                  ? 'pointer-events-none opacity-0'
                  : d === '⌫'
                  ? 'bg-transparent text-zinc-500 hover:text-zinc-350'
                  : 'bg-white/5 border border-white/10 text-white hover:bg-white/10 shadow-sm'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {pinError && (
          <p className="text-[12px] text-red-400 font-bold mb-4 flex items-center gap-1.5 animate-bounce">
            ⚠️ PIN incorrecto. Reinténtalo.
          </p>
        )}

        <Link 
          href="/panel"
          className="text-[13px] font-bold text-zinc-400 hover:text-white transition-colors bg-white/5 px-4 py-2 rounded-xl border border-white/5"
        >
          Volver al Inicio
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 flex flex-col min-h-screen bg-[#fafafa] pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-[22px] font-extrabold text-zinc-950 tracking-tight uppercase">FINANZAS</h2>
          <p className="text-[13px] font-medium text-zinc-500">Control de Flujo de Efectivo</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={() => setShowAccountOrderModal(true)}
            className="w-10 h-10 bg-white border border-zinc-200 text-zinc-700 rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-all"
            title="Acomodar y Administrar Cuentas"
          >
            <Settings size={16} strokeWidth={2.5} className="text-zinc-700" />
          </button>

          <button 
            onClick={() => {
              setTransferFromId('');
              setTransferToId('');
              setTransferAmount('');
              setTransferDate(getLocalDateString());
              setTransferDescription('');
              setShowTransferModal(true);
            }}
            className="h-10 px-4 bg-white border border-zinc-200 text-zinc-700 rounded-full flex items-center gap-1.5 shadow-sm active:scale-95 transition-all text-xs font-bold"
            title="Transferir entre cuentas"
          >
            <ArrowLeftRight size={14} className="text-zinc-650" />
            <span className="hidden sm:inline">Transferir</span>
          </button>

          <button 
            onClick={fetchData} 
            disabled={isLoading}
            className="w-10 h-10 bg-white border border-zinc-200 text-zinc-700 rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-all"
            title="Actualizar datos"
          >
            <RefreshCw size={16} strokeWidth={2.5} className={isLoading ? "animate-spin text-zinc-500" : "text-zinc-750"} />
          </button>
          
          {activeTab === 'registro' && (
            <button onClick={exportToCSV} className="w-10 h-10 bg-white border border-zinc-200 text-zinc-700 rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-transform">
              <Download size={18} strokeWidth={2.5} />
            </button>
          )}
          
          <button 
            onClick={() => {
              setEditingRecord(null);
              setFormType('gasto');
              setFormCategory('Proveedores');
              setFormAmount('');
              setFormDescription('');
              setFormEnvelope('');
              setFormDate(getLocalDateString());
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
          className={`flex-1 py-2.5 text-[13.5px] font-bold rounded-xl transition-all ${activeTab === 'libro' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
        >
          Libro Contable
        </button>
        <button 
          onClick={() => setActiveTab('registro')}
          className={`flex-1 py-2.5 text-[13.5px] font-bold rounded-xl transition-all ${activeTab === 'registro' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
        >
          Registro
        </button>
        <button 
          onClick={() => setActiveTab('otas')}
          className={`flex-1 py-2.5 text-[13.5px] font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${activeTab === 'otas' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
        >
          <span>Liquidación OTAs</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-extrabold border border-blue-100">
            Booking & Expedia
          </span>
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center"><div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-900 rounded-full animate-spin mx-auto" /></div>
      ) : activeTab === 'libro' ? (
        // VISTA LIBRO CONTABLE (Modern SaaS)
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Total General Consolidado al tope */}
          <div className="bg-zinc-900 text-white rounded-[32px] p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Total General Consolidado (MXN)</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl text-zinc-400 font-bold">$</span>
                  <p className="text-4xl font-black tracking-tighter">{Math.round(totalGeneral).toLocaleString('es-MX')}</p>
                  <span className="text-xs text-zinc-450 font-bold tracking-wider">MXN</span>
                </div>
              </div>
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/10">
                <Wallet size={26} className="text-white" strokeWidth={2.5} />
              </div>
            </div>
          </div>

          {/* Cuadrículas Agrupadas de Cuentas Contables */}
          {financeGroups.map(group => {
            const groupAccounts = sortAccounts(accounts).filter(a => a.group_type === group.type);
            const total = groupAccounts.reduce((sum, curr) => sum + convertToMXN(curr.balance, curr.currency), 0);
            const IconComponent = group.icon;

            return (
              <div key={group.type} className="bg-white border border-zinc-200/85 rounded-[32px] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
                {/* Header */}
                <div className="flex items-center justify-between mb-5 select-none">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${group.bg} ${group.iconColor}`}>
                      <IconComponent size={20} strokeWidth={2.5} />
                    </div>
                    <div>
                      <h3 className="text-[16px] font-extrabold text-zinc-950 tracking-tight">{group.title}</h3>
                      <p className="text-[9px] text-zinc-400 font-extrabold uppercase tracking-widest mt-0.5">Grupo Contable</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">TOTAL</p>
                    <p className={`text-[17px] font-black tracking-tight ${group.color}`}>
                      ${Math.round(total).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>

                {/* Grid of Accounts (2 columns on mobile, 3 columns on tablet/desktop) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3.5 gap-y-3.5">
                  {groupAccounts.length === 0 ? (
                    <div 
                      onClick={() => {
                        setAccGroupType(group.type);
                        setShowAddAccountModal(true);
                      }}
                      className="bg-zinc-50/50 border border-dashed border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/80 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[90px] text-center hover:shadow-sm transition-all cursor-pointer group active:scale-[0.98] col-span-2 sm:col-span-3 select-none"
                    >
                      <Plus size={16} className="text-zinc-450 group-hover:text-zinc-700 transition-colors mb-1.5 animate-pulse" />
                      <span className="text-[10px] font-extrabold text-zinc-450 group-hover:text-zinc-750 transition-colors uppercase tracking-wider leading-none">
                        Añadir Cuenta
                      </span>
                      <span className="text-[8px] text-zinc-400 mt-1 font-bold">Crea tu primera cuenta en {group.title}</span>
                    </div>
                  ) : (
                    groupAccounts.map(acc => (
                      <div 
                        key={acc.id} 
                        onClick={() => {
                          setFilterAccountId(acc.id);
                          setActiveTab('registro');
                        }}
                        className="bg-[#fafafa] border border-zinc-200/50 rounded-2xl p-3.5 hover:bg-white hover:border-zinc-350 hover:shadow-sm transition-all cursor-pointer group active:scale-[0.98] flex flex-col justify-between min-h-[90px]"
                      >
                        <span className="text-[10px] font-extrabold text-zinc-455 uppercase tracking-wide truncate mb-1.5 block group-hover:text-zinc-750 transition-colors">
                          {acc.name}
                        </span>
                        <div className="flex flex-col">
                          <div className="flex items-baseline gap-0.5 min-w-0">
                            <span className="text-[10px] text-zinc-400 font-bold">$</span>
                            <span className="text-[15px] font-black text-zinc-900 tracking-tight leading-none">
                              {Math.round(acc.balance).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                            <span className="text-[8px] text-zinc-455 font-extrabold uppercase ml-0.5">{acc.currency}</span>
                          </div>
                          {acc.currency !== 'MXN' && (
                            <span className="text-[9px] font-bold text-zinc-400/90 leading-none mt-1.5 pt-1 border-t border-dashed border-zinc-250">
                              ≈${Math.round(convertToMXN(acc.balance, acc.currency)).toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}

          {/* Mantenimiento Contable */}
          <div className="bg-rose-50/30 border border-rose-200/50 rounded-[32px] p-6 shadow-sm mt-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center shrink-0 border border-rose-100">
                <Trash2 className="text-rose-600" size={22} strokeWidth={2.5} />
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="text-[15px] font-bold text-zinc-900">Mantenimiento Contable</h4>
                <p className="text-[12px] text-zinc-500 leading-relaxed">
                  Limpia por completo el historial de movimientos y restablece el saldo de todas las cuentas a <span className="font-bold text-rose-600">MX$0</span>. Esta acción es definitiva y no afectará a las reservas ni al inventario físico.
                </p>
                <div className="pt-3">
                  <button
                    onClick={() => {
                      setResetConfirmText('');
                      setShowResetModal(true);
                    }}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-[12px] uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    Restablecer Finanzas a Cero
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'registro' ? (
        // VISTA REGISTRO (Movimientos)
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 flex bg-white border border-zinc-200 p-1 rounded-xl shadow-sm">
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
            
            <div className="flex flex-col gap-2 w-full sm:flex-row sm:items-center sm:w-auto">
              <div className="flex flex-row gap-2 w-full">
                <div className="flex-1 bg-white border border-zinc-200 p-1.5 rounded-xl shadow-sm flex items-center justify-between gap-1.5 px-2.5">
                  <span className="text-[10px] font-extrabold text-zinc-450 uppercase tracking-wider select-none">Desde</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="bg-transparent border-none text-[11px] font-bold text-zinc-700 outline-none cursor-pointer p-0.5 min-w-0 flex-1 text-right"
                  />
                </div>
                <div className="flex-1 bg-white border border-zinc-200 p-1.5 rounded-xl shadow-sm flex items-center justify-between gap-1.5 px-2.5">
                  <span className="text-[10px] font-extrabold text-zinc-455 uppercase tracking-wider select-none">Hasta</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="bg-transparent border-none text-[11px] font-bold text-zinc-700 outline-none cursor-pointer p-0.5 min-w-0 flex-1 text-right"
                  />
                </div>
              </div>
              {(startDate || endDate) && (
                <button
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  className="w-full sm:w-auto text-[10px] font-black text-rose-500 hover:text-rose-600 px-2.5 py-2 rounded-lg bg-rose-50 border border-rose-100 hover:bg-rose-100 transition-colors text-center shrink-0"
                >
                  LIMPIAR FILTRO
                </button>
              )}
            </div>
          </div>

          {/* Barra de Búsqueda Premium */}
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input 
              type="text"
              placeholder="Buscar movimiento por concepto, descripción o monto..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-white border border-zinc-200 rounded-xl text-[12px] font-bold text-zinc-700 outline-none shadow-sm focus:border-zinc-400 focus:ring-1 focus:ring-zinc-950/5 placeholder:text-zinc-400 transition-all"
            />
            {searchQuery && (
              <button 
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center bg-zinc-100 rounded-full text-zinc-400 hover:text-zinc-600 active:scale-95 transition-transform cursor-pointer"
              >
                <X size={11} strokeWidth={3} />
              </button>
            )}
          </div>

          {filterAccountId && filterAccountId !== 'todo' && (
            <div className="flex items-center gap-1.5 px-0.5 animate-in slide-in-from-top-1.5 duration-200">
              <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Filtro Activo:</span>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-950 text-white rounded-full text-[10px] font-extrabold shadow-sm">
                <span>Cuenta: {accounts.find(a => a.id === filterAccountId)?.name || 'Cargando...'}</span>
                <button 
                  onClick={() => setFilterAccountId('todo')}
                  className="hover:text-rose-400 p-0.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer select-none"
                  title="Limpiar filtro"
                >
                  <X size={10} strokeWidth={3} />
                </button>
              </div>
            </div>
          )}

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
                      
                      const envelopeMatch = record.description?.match(/^(S\d{2})\b/);
                      if (envelopeMatch && envelopeMatch[1]) {
                        setFormEnvelope(envelopeMatch[1]);
                        const cleanDesc = record.description.replace(/^(S\d{2})\s*[-:]*\s*/, '');
                        setFormDescription(cleanDescription(cleanDesc));
                      } else {
                        setFormEnvelope('');
                        setFormDescription(cleanDescription(record.description || ''));
                      }
                      
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
                          {record.accounts?.name || 'Desconocido'} • {cleanDescription(record.description, record.accounts?.name, record.payment_method)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-end">
                        <span className={`text-[15px] font-bold ${record.type === 'ingreso' ? 'text-emerald-600' : 'text-zinc-900'}`}>
                          {record.type === 'ingreso' ? '+' : '-'}MX${Math.round(record.amount).toLocaleString('es-MX')}
                        </span>
                        <span className="text-[11px] text-zinc-400 font-medium">
                          {format(new Date((record.date || '').substring(0, 10) + 'T12:00:00Z'), 'd MMM', { locale: es })}
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
      ) : (
        // VISTA LIQUIDACIÓN OTAs (2 Pestañas: Booking.com, Expedia)
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Helper para formatear montos exactos con 2 decimales sin descuadres */}
          {(() => {
            const fmtOtaMoney = (val: number) => (Number(val) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return null;
          })()}
          {/* 2 SUBTABS DE LAS OTAS */}
          <div className="grid grid-cols-2 gap-2 bg-zinc-100/80 p-1.5 rounded-2xl border border-zinc-200/60 shadow-inner">
            {/* Booking.com Tab */}
            <button
              onClick={() => setSelectedOta('booking')}
              className={`py-3 px-3 rounded-xl transition-all flex flex-col items-center justify-center relative cursor-pointer ${
                selectedOta === 'booking'
                  ? 'bg-white text-zinc-950 shadow-md ring-2 ring-blue-600/20'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-white/50'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#003580]" />
                <span className="font-extrabold text-[13px] tracking-tight">Booking.com</span>
              </div>
              <span className={`text-[10px] font-bold mt-0.5 ${selectedOta === 'booking' ? 'text-blue-600' : 'text-zinc-400'}`}>
                {otaAnalytics.booking.filteredCount} reservas • ${(otaAnalytics.booking.totalComision || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} com.
              </span>
            </button>

            {/* Expedia Tab */}
            <button
              onClick={() => setSelectedOta('expedia')}
              className={`py-3 px-3 rounded-xl transition-all flex flex-col items-center justify-center relative cursor-pointer ${
                selectedOta === 'expedia'
                  ? 'bg-white text-zinc-950 shadow-md ring-2 ring-amber-500/20'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-white/50'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FFCC00] border border-amber-400" />
                <span className="font-extrabold text-[13px] tracking-tight">Expedia</span>
              </div>
              <span className={`text-[10px] font-bold mt-0.5 ${selectedOta === 'expedia' ? 'text-amber-600' : 'text-zinc-400'}`}>
                {otaAnalytics.expedia.filteredCount} reservas • ${(otaAnalytics.expedia.totalComision || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} com.
              </span>
            </button>
          </div>

          {/* BANNER COMPARATIVO GLOBAL DE LIQUIDACIÓN DE COMISIONES */}
          <div className="bg-gradient-to-r from-zinc-900 via-zinc-850 to-zinc-900 text-white rounded-[28px] p-5 shadow-xl border border-zinc-800 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={16} className="text-amber-400 animate-pulse" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">
                    Comisiones por Liquidar a Fin de Mes ({otaPeriodLabels[otaPeriodFilter] || 'Este Mes'})
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl text-zinc-400 font-bold">$</span>
                  <span className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                    {(
                      otaAnalytics.booking.totalComision + 
                      otaAnalytics.expedia.totalComision
                    ).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-xs text-zinc-400 font-bold tracking-wider">MXN Total por Transferir a OTAs</span>
                </div>
              </div>

              {/* Mini desglose por canal */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 text-xs flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-zinc-300 font-medium">Booking.com:</span>
                  <strong className="text-white font-black">${(otaAnalytics.booking.totalComision || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>
                <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 text-xs flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-zinc-300 font-medium">Expedia:</span>
                  <strong className="text-white font-black">${(otaAnalytics.expedia.totalComision || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* TARJETAS EJECUTIVAS DE LA OTA SELECCIONADA */}
          {(() => {
            const currentOtaData = otaAnalytics[selectedOta];
            const otaBrandColor = selectedOta === 'booking' ? 'blue' : 'amber';
            const otaTitle = selectedOta === 'booking' ? 'Booking.com' : 'Expedia';
            const matchedAccount = accounts.find(a => a.name.toUpperCase().includes(selectedOta.toUpperCase()));
            const fmtOtaMoney = (val: number) => (Number(val) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            return (
              <div className="space-y-4">
                {/* 4 KPI CARDS */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Card 1: Total Bruto */}
                  <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm space-y-1">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider">Total Reservado (Bruto)</span>
                      <Building2 size={16} className="text-zinc-400" />
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
                      ${fmtOtaMoney(currentOtaData.totalBruto)}
                      <span className="text-[10px] text-zinc-400 ml-1 font-bold">MXN</span>
                    </p>
                    <p className="text-[11px] text-zinc-500 font-medium">
                      {currentOtaData.filteredCount} reservas • {currentOtaData.totalNoches} noches
                    </p>
                  </div>

                  {/* Card 2: Comisión a Pagar a la OTA */}
                  <div className={`bg-white border rounded-2xl p-4 shadow-sm space-y-1 ${
                    selectedOta === 'booking' ? 'border-blue-200/80 bg-blue-50/10' : 'border-amber-200/80 bg-amber-50/10'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700">Comisión por Liquidar ({otaTitle})</span>
                      <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border uppercase ${
                        selectedOta === 'booking' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {currentOtaData.avgCommissionPct}%
                      </span>
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-rose-600 tracking-tight">
                      -${fmtOtaMoney(currentOtaData.totalComision)}
                      <span className="text-[10px] text-rose-400 ml-1 font-bold">MXN</span>
                    </p>
                    <p className="text-[11px] text-zinc-500 font-medium">
                      Total a transferir a {otaTitle}
                    </p>
                  </div>

                  {/* Card 3: Ingreso Neto Hotel */}
                  <div className="bg-white border border-emerald-200/80 rounded-2xl p-4 shadow-sm space-y-1 bg-emerald-50/10">
                    <div className="flex items-center justify-between text-emerald-700">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider">Ingreso Neto Hotel</span>
                      <Wallet size={16} className="text-emerald-600" />
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-emerald-600 tracking-tight">
                      +${fmtOtaMoney(currentOtaData.totalNeto)}
                      <span className="text-[10px] text-emerald-400 ml-1 font-bold">MXN</span>
                    </p>
                    <p className="text-[11px] text-zinc-500 font-medium">
                      Cobro neto que retiene el hotel
                    </p>
                  </div>

                  {/* Card 4: Saldo en Cuenta Contable */}
                  <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm space-y-1">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider">Saldo Cuenta Libro</span>
                      <Landmark size={16} className="text-zinc-400" />
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
                      ${fmtOtaMoney(matchedAccount ? matchedAccount.balance : 0)}
                      <span className="text-[10px] text-zinc-400 ml-1 font-bold">MXN</span>
                    </p>
                    <p className="text-[11px] text-zinc-500 font-medium truncate">
                      {matchedAccount ? matchedAccount.name : `Cuenta COMISIÓN ${otaTitle}`}
                    </p>
                  </div>
                </div>

                {/* DESGLOSE FACTURACIÓN OTA (CONCILIACIÓN FIN DE MES) */}
                <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm ${
                  selectedOta === 'booking'
                    ? 'bg-gradient-to-br from-blue-50/70 via-white to-blue-50/40 border-blue-200/80'
                    : 'bg-gradient-to-br from-amber-50/70 via-white to-amber-50/40 border-amber-200/80'
                }`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-200/70 pb-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-white ${
                        selectedOta === 'booking' ? 'bg-[#003580]' : 'bg-[#FFCC00] text-zinc-900 border border-amber-400'
                      }`}>
                        <Receipt size={18} />
                      </div>
                      <div>
                        <h4 className="font-black text-zinc-900 text-sm">
                          Conciliación de Factura Mensual • {otaTitle}
                        </h4>
                        <p className="text-[11px] text-zinc-500 font-medium">
                          Monto total exigible por la plataforma al cierre del periodo seleccionado
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-500">Total a Liquidar:</span>
                      <span className="text-lg sm:text-xl font-black text-rose-600">
                        ${fmtOtaMoney(currentOtaData.totalComision)} <span className="text-xs font-bold text-rose-400">MXN</span>
                      </span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border uppercase ${
                        selectedOta === 'booking' ? 'bg-blue-100/70 text-blue-800 border-blue-300' : 'bg-amber-100/70 text-amber-800 border-amber-300'
                      }`}>
                        {currentOtaData.avgCommissionPct}%
                      </span>
                    </div>
                  </div>

                  {/* Desglose de componentes de la comisión */}
                  {selectedOta === 'booking' ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {/* 1. Base Habitación (18%) */}
                        <div className="bg-white/90 border border-blue-100 p-3 rounded-xl shadow-xs space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-blue-900 uppercase tracking-wider">1. Comisión Base Booking</span>
                            <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200">18.0%</span>
                          </div>
                          <p className="text-base font-black text-zinc-900">
                            ${fmtOtaMoney(currentOtaData.totalBookingBaseCommission)} <span className="text-[10px] text-zinc-400 font-bold">MXN</span>
                          </p>
                          <p className="text-[10px] text-zinc-400 font-medium">18% sobre tarifa base (${fmtOtaMoney(currentOtaData.totalRoomBase)})</p>
                        </div>

                        {/* 2. Tarjeta (3.1%) */}
                        <div className="bg-white/90 border border-blue-100 p-3 rounded-xl shadow-xs space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-blue-900 uppercase tracking-wider">2. Pago con Tarjeta</span>
                            <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200">3.1%</span>
                          </div>
                          <p className="text-base font-black text-zinc-900">
                            ${fmtOtaMoney(currentOtaData.totalCardProcessing)} <span className="text-[10px] text-zinc-400 font-bold">MXN</span>
                          </p>
                          <p className="text-[10px] text-zinc-400 font-medium">3.1% sobre cobro total (${fmtOtaMoney(currentOtaData.totalBruto)})</p>
                        </div>

                        {/* 3. Total Factura */}
                        <div className="bg-white/90 border border-blue-100 p-3 rounded-xl shadow-xs space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-blue-900 uppercase tracking-wider">3. Factura Exigible Booking</span>
                            <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200">~{currentOtaData.avgCommissionPct}%</span>
                          </div>
                          <p className="text-base font-black text-rose-600">
                            ${fmtOtaMoney(currentOtaData.totalComision)} <span className="text-[10px] text-rose-400 font-bold">MXN</span>
                          </p>
                          <p className="text-[10px] text-zinc-400 font-medium">Total exigible por Booking al cierre de mes</p>
                        </div>
                      </div>

                      {/* Margen Protegido beds24 banner */}
                      <div className="bg-blue-900/5 border border-blue-900/10 rounded-xl p-2.5 flex items-center justify-between text-xs gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🛡️</span>
                          <span className="text-zinc-700 font-medium">
                            <strong>Margen Protegido en Beds24:</strong> El multiplicador de tarifa del <strong>+35%</strong> absorbe holgadamente la deducción de Booking (<strong>~18.2%</strong>) y el descuento Genius (<strong>10%</strong>), blindando el ingreso neto del hotel.
                          </span>
                        </div>
                        <span className="text-[10px] font-black px-2 py-1 bg-white text-blue-900 rounded-lg border border-blue-200 shrink-0">
                          Multiplicador 35% Activo
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="bg-white/90 border border-amber-100 p-3 rounded-xl shadow-xs space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-amber-900 uppercase tracking-wider">1. Comisión Base Expedia</span>
                            <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">15.0%</span>
                          </div>
                          <p className="text-base font-black text-zinc-900">
                            ${fmtOtaMoney(currentOtaData.totalComision)} <span className="text-[10px] text-zinc-400 font-bold">MXN</span>
                          </p>
                          <p className="text-[10px] text-zinc-400 font-medium">Comisión directa por reservación</p>
                        </div>

                        <div className="bg-white/90 border border-amber-100 p-3 rounded-xl shadow-xs space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-amber-900 uppercase tracking-wider">2. Cargos Adicionales</span>
                            <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">0.0%</span>
                          </div>
                          <p className="text-base font-black text-zinc-900">
                            $0.00 <span className="text-[10px] text-zinc-400 font-bold">MXN</span>
                          </p>
                          <p className="text-[10px] text-zinc-400 font-medium">Cobro directo por Expedia Partner Central</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* BARRA DE HERRAMIENTAS Y FILTROS */}
                <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm space-y-3">
                  {/* Selector de periodo rápido */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex bg-zinc-100 p-1 rounded-xl gap-1 flex-wrap">
                      {[
                        { id: 'historico', label: 'Todo' },
                        { id: 'futuras', label: 'Futuras' },
                        { id: 'mes_actual', label: 'Este Mes' },
                        { id: 'mes_anterior', label: 'Mes Anterior' },
                        { id: 'este_ano', label: 'Este Año' },
                        { id: 'custom', label: 'Personalizado' },
                      ].map(f => (
                        <button
                          key={f.id}
                          onClick={() => setOtaPeriodFilter(f.id as any)}
                          className={`px-3 py-1.5 text-[11.5px] font-bold rounded-lg transition-all cursor-pointer ${
                            otaPeriodFilter === f.id
                              ? 'bg-zinc-900 text-white shadow-sm'
                              : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    {/* Botón Exportar CSV */}
                    <button
                      onClick={() => exportOtaToCSV(otaTitle, currentOtaData.items)}
                      className="px-3.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs rounded-xl flex items-center gap-1.5 border border-zinc-200 transition-all cursor-pointer"
                      title="Descargar reporte de comisiones en Excel / CSV"
                    >
                      <Download size={14} />
                      <span>Exportar CSV</span>
                    </button>
                  </div>

                  {/* Fechas personalizadas si aplica */}
                  {otaPeriodFilter === 'custom' && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="bg-zinc-50 border border-zinc-200 p-2 rounded-xl flex items-center justify-between text-xs">
                        <span className="font-extrabold text-zinc-400 text-[10px] uppercase">Desde:</span>
                        <input
                          type="date"
                          value={otaStartDate}
                          onChange={e => setOtaStartDate(e.target.value)}
                          className="bg-transparent font-bold text-zinc-800 outline-none text-xs"
                        />
                      </div>
                      <div className="bg-zinc-50 border border-zinc-200 p-2 rounded-xl flex items-center justify-between text-xs">
                        <span className="font-extrabold text-zinc-400 text-[10px] uppercase">Hasta:</span>
                        <input
                          type="date"
                          value={otaEndDate}
                          onChange={e => setOtaEndDate(e.target.value)}
                          className="bg-transparent font-bold text-zinc-800 outline-none text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {/* Buscador y filtro de estado */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    <div className="sm:col-span-2 relative">
                      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        placeholder={`Buscar por huésped, ID de reserva (#92440470) o habitación...`}
                        value={otaSearchQuery}
                        onChange={e => setOtaSearchQuery(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-10 pr-4 py-2 text-xs font-bold text-zinc-800 placeholder:text-zinc-400 outline-none focus:bg-white focus:ring-2 focus:ring-zinc-900/10"
                      />
                    </div>

                    <div>
                      <select
                        value={otaStatusFilter}
                        onChange={e => setOtaStatusFilter(e.target.value as any)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 outline-none focus:bg-white cursor-pointer"
                      >
                        <option value="activos">Activas y Finalizadas</option>
                        <option value="todos">Todas (Incluye canceladas)</option>
                        <option value="finalizadas">Solo Finalizadas</option>
                        <option value="canceladas">Solo Canceladas</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* LISTADO DE RESERVAS DETALLADAS DE LA OTA */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-[13px] font-extrabold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Receipt size={16} className="text-zinc-600" />
                      Desglose de Reservas {otaTitle} ({currentOtaData.filteredCount})
                    </h4>
                    <span className="text-[11px] font-bold text-zinc-400">
                      Total Comisión por Liquidar: <strong className="text-rose-600 font-extrabold">${fmtOtaMoney(currentOtaData.totalComision)} MXN</strong>
                    </span>
                  </div>

                  {currentOtaData.items.length === 0 ? (
                    <div className="bg-white border border-zinc-200 rounded-2xl p-10 text-center space-y-2">
                      <Building2 size={32} className="text-zinc-300 mx-auto" />
                      <p className="font-extrabold text-zinc-800 text-sm">No se encontraron reservas para {otaTitle}</p>
                      <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                        No hay reservaciones que coincidan con los filtros de fecha o búsqueda seleccionados.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2.5">
                      {currentOtaData.items.map((r: any) => {
                        const inDateStr = r.check_in ? format(new Date(r.check_in + 'T12:00:00Z'), 'dd MMM yyyy', { locale: es }) : 'N/A';
                        const outDateStr = r.check_out ? format(new Date(r.check_out + 'T12:00:00Z'), 'dd MMM yyyy', { locale: es }) : 'N/A';
                        const isCancelled = r.status === 'cancelled';

                        return (
                          <div
                            key={r.id}
                            className={`bg-white border rounded-2xl p-4 shadow-sm transition-all hover:shadow-md ${
                              isCancelled ? 'border-zinc-200 opacity-60 bg-zinc-50/50' : 'border-zinc-200/80 hover:border-zinc-300'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3 mb-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider border ${
                                    selectedOta === 'booking' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                                  }`}>
                                    {r.channel || otaTitle} #{r.id}
                                  </span>
                                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md uppercase border ${
                                    isCancelled 
                                      ? 'bg-zinc-100 text-zinc-600 border-zinc-200' 
                                      : r.is_checked_in 
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                      : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                  }`}>
                                    {isCancelled ? 'Cancelada' : r.is_checked_in ? 'En Casa' : r.status || 'Confirmada'}
                                  </span>
                                </div>
                                <h5 className="font-extrabold text-zinc-900 text-sm">{r.guest_name || 'Huésped sin nombre'}</h5>
                                <p className="text-[11px] text-zinc-500 font-medium">
                                  {r.room_name || 'Habitación sin asignar'} • {r.noches} {r.noches === 1 ? 'noche' : 'noches'} ({inDateStr} → {outDateStr})
                                </p>
                              </div>

                              <Link
                                href={`/public/reserva/${r.id}`}
                                target="_blank"
                                className="px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 font-bold text-xs rounded-xl border border-zinc-200 flex items-center gap-1.5 self-start sm:self-center transition-all cursor-pointer"
                              >
                                <span>Ver Portal</span>
                                <ExternalLink size={12} />
                              </Link>
                            </div>

                            {/* Desglose de 3 columnas de la reserva con 2 decimales */}
                            <div className="grid grid-cols-3 gap-2 text-center bg-zinc-50/70 p-2.5 rounded-xl border border-zinc-100">
                              <div>
                                <span className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-wider block">Total Bruto</span>
                                <span className="font-black text-zinc-900 text-xs sm:text-sm">
                                  ${fmtOtaMoney(r.metrics.totalBruto)}
                                </span>
                              </div>
                              <div className="border-x border-zinc-200/60">
                                <span className="text-[9px] font-extrabold text-rose-600 uppercase tracking-wider block">
                                  Comisión a Liquidar ({r.metrics.commissionPct}%)
                                </span>
                                <span className="font-black text-rose-600 text-xs sm:text-sm">
                                  -${fmtOtaMoney(r.metrics.commission)}
                                </span>
                              </div>
                              <div>
                                <span className="text-[9px] font-extrabold text-emerald-700 uppercase tracking-wider block">Neto Hotel</span>
                                <span className="font-black text-emerald-600 text-xs sm:text-sm">
                                  +${fmtOtaMoney(r.metrics.netRevenue)}
                                </span>
                              </div>
                            </div>

                            {/* Sub-desglose detallado de la factura */}
                            {selectedOta === 'booking' && r.metrics.breakdown && (
                              <div className="mt-2.5 pt-2 border-t border-zinc-100 flex items-center justify-between text-[10px] text-zinc-500 flex-wrap gap-1.5">
                                <span className="font-bold text-zinc-400">Desglose Factura Booking:</span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded-md border border-blue-100 font-bold">
                                    18.0% Base (${fmtOtaMoney(r.metrics.breakdown.roomBase)}): ${fmtOtaMoney(r.metrics.breakdown.bookingBaseCommission)}
                                  </span>
                                  <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded-md border border-blue-100 font-bold">
                                    3.1% Tarjeta (${fmtOtaMoney(r.metrics.totalBruto)}): ${fmtOtaMoney(r.metrics.breakdown.cardProcessing)}
                                  </span>
                                  <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded-md border border-blue-100 font-bold">
                                    Total Factura: ${fmtOtaMoney(r.metrics.commission)} ({r.metrics.commissionPct}%)
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
      {/* Modal Nuevo Movimiento */}
      {showMoveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto pb-8 flex flex-col">
            <div className="flex justify-between items-center mb-5 shrink-0">
              <h3 className="text-xl font-bold text-zinc-900">
                {editingRecord ? 'Editar Movimiento' : 'Registrar Movimiento'}
              </h3>
              <button onClick={() => setShowMoveModal(false)} className="p-2 bg-zinc-100 rounded-full text-zinc-500 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleSaveMovement} className="space-y-5">
              {/* Tabs Tipo */}
              <div className="flex bg-zinc-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setFormType('gasto');
                    if (!editingRecord) setFormCategory('Proveedores');
                  }}
                  className={`flex-1 py-2 text-[14px] font-bold rounded-lg transition-all ${formType === 'gasto' ? 'bg-white text-rose-600 shadow-sm' : 'text-zinc-500'}`}
                >
                  Salida (Gasto)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormType('ingreso');
                    if (!editingRecord) setFormCategory('Reserva Directa');
                  }}
                  className={`flex-1 py-2 text-[14px] font-bold rounded-lg transition-all ${formType === 'ingreso' ? 'bg-white text-emerald-600 shadow-sm' : 'text-zinc-500'}`}
                >
                  Entrada (Ingreso)
                </button>
              </div>

              {/* MONTO DE LA TRANSACCIÓN */}
              <div>
                <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Monto de la Transacción</label>
                <input 
                  type="text" required
                  value={formAmount} onChange={e => setFormAmount(e.target.value)}
                  className="w-full text-3xl font-bold bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-all placeholder:text-zinc-300 text-base font-bold text-zinc-900"
                  placeholder="0.00 o =2500-150"
                />
                
                {/* REAL-TIME PREVIEW FOR FORM AMOUNT & CALCULATOR */}
                {(() => {
                  const evalAmount = evaluateMath(formAmount);
                  const selectedAcc = accounts.find(a => a.id === formAccountId);
                  if (formAmount && evalAmount > 0 && selectedAcc) {
                    return (
                      <div className="mt-3 p-3.5 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-2 animate-in slide-in-from-top-2 duration-300">
                        <p className="font-extrabold text-zinc-455 uppercase tracking-widest text-[8px]">Calculadora Proyectada</p>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase">Monto Evaluado:</span>
                          <span className="font-black text-[13px] text-zinc-800">${Math.round(evalAmount).toLocaleString('es-MX')} {selectedAcc.currency}</span>
                        </div>
                        <div className={`p-2.5 rounded-xl border text-center ${
                          formType === 'ingreso' 
                            ? 'bg-emerald-50/40 border-emerald-100' 
                            : 'bg-rose-50/40 border-rose-100'
                        }`}>
                          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Nuevo Balance Estimado</span>
                          <span className={`font-black text-[15px] tracking-tight block ${
                            formType === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                            ${Math.round(formType === 'ingreso' 
                              ? selectedAcc.balance + evalAmount 
                              : selectedAcc.balance - evalAmount
                            ).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {selectedAcc.currency}
                          </span>
                          <span className={`text-[8.5px] font-bold block mt-0.5 ${
                            formType === 'ingreso' ? 'text-emerald-500/80' : 'text-rose-500/80'
                          }`}>
                            {formType === 'ingreso' ? '+' : '-'}${Math.round(evalAmount).toLocaleString('es-MX')} {selectedAcc.currency}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* 1. SELECCIONAR CUENTA (MANDATORIO) */}
              <div>
                <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">¿De/Para qué Cuenta?</label>
                <select 
                  required
                  value={formAccountId} onChange={e => setFormAccountId(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none font-bold text-base focus:ring-2 focus:ring-zinc-900/10 text-zinc-900 cursor-pointer"
                >
                  <option value="" disabled>Selecciona una Cuenta...</option>
                  {sortAccounts(accounts).map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.group_type})</option>
                  ))}
                </select>
              </div>

              {/* DETALLES DE CUENTA DINÁMICOS */}
              {(() => {
                const selectedAcc = accounts.find(a => a.id === formAccountId);
                if (!selectedAcc) return null;
                return (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    {/* MONTO DISPONIBLE CARD */}
                    <div className="bg-gradient-to-br from-zinc-50 to-zinc-100/50 border border-zinc-200/60 rounded-2xl p-4 text-center shadow-sm">
                      <p className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1">Monto Disponible en Cuenta</p>
                      <p className="text-3xl font-black text-zinc-900 tracking-tight">
                        ${Math.round(selectedAcc.balance).toLocaleString('es-MX')} <span className="text-xs text-zinc-400 font-bold">{selectedAcc.currency || 'MXN'}</span>
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* CONCEPTO / CATEGORÍA */}
              <div>
                <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Concepto / Categoría</label>
                <select 
                  value={formCategory} onChange={e => setFormCategory(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none font-bold text-base focus:ring-2 focus:ring-zinc-900/10 text-zinc-900 cursor-pointer"
                >
                  {formType === 'gasto' ? (
                    <>
                      <option>Proveedores</option>
                      <option>Nomina Fiscal</option>
                      <option>Nomina No Fiscal</option>
                      <option>Préstamos</option>
                      <option>Impuestos</option>
                      <option>Servicios (Luz, Agua, Internet, etc)</option>
                      <option>Suministros</option>
                      <option>Mantenimiento</option>
                      <option>Comisiones</option>
                      <option>Personal</option>
                      <option>Tarjeta de Crédito</option>
                      <option>Transferencia</option>
                      <option>Ajuste</option>
                      <option>Otros</option>
                    </>
                  ) : (
                    <>
                      <option>Reserva Directa</option>
                      <option>Walk In</option>
                      <option>Check In</option>
                      <option>Ingreso Extra</option>
                      <option>Booking</option>
                      <option>Airbnb</option>
                      <option>Ajuste</option>
                      <option>Transferencia</option>
                      <option>Otros</option>
                    </>
                  )}
                </select>
              </div>

              {/* DESCRIPCIÓN */}
              <div>
                <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Descripción (Opcional)</label>
                <input 
                  type="text"
                  value={formDescription} onChange={e => setFormDescription(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-base focus:ring-2 focus:ring-zinc-900/10 text-zinc-900 font-bold"
                  placeholder="Ej. Traspaso, Pago a proveedor..."
                />
              </div>

              {/* SELECT ENVELOPE FOR CASH ACCOUNT */}
              {(() => {
                const selectedAcc = accounts.find(a => a.id === formAccountId);
                const isCash = selectedAcc?.group_type === 'EFECTIVO';
                if (!isCash) return null;
                return (
                  <div className="animate-in fade-in duration-300">
                    <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Número de Sobre (Efectivo)</label>
                    <select
                      value={formEnvelope}
                      onChange={e => setFormEnvelope(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none font-bold text-base focus:ring-2 focus:ring-zinc-900/10 text-zinc-900 cursor-pointer"
                    >
                      <option value="">Ninguno / No aplica</option>
                      {ENVELOPES.map(env => (
                        <option key={env} value={env}>{env}</option>
                      ))}
                    </select>
                  </div>
                );
              })()}

              {/* FECHA */}
              <div>
                <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Fecha</label>
                {editingRecord ? (
                  <input 
                    type="date" required
                    value={formDate} onChange={e => setFormDate(e.target.value)}
                    className="w-full text-base font-bold bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-zinc-900/10 transition-all text-zinc-900"
                  />
                ) : (
                  <div className="w-full text-base font-bold bg-zinc-100 border border-zinc-200 rounded-2xl px-4 py-3 text-zinc-500 select-none">
                    {format(new Date(), 'dd/MM/yyyy')} (Fijo en el día del registro)
                  </div>
                )}
              </div>

              {/* ÚLTIMOS MOVIMIENTOS DINÁMICOS DE LA CUENTA */}
              {(() => {
                const selectedAcc = accounts.find(a => a.id === formAccountId);
                if (!selectedAcc) return null;
                const accRecords = records.filter(r => r.account_id === selectedAcc.id);
                return (
                  <div className="pt-2 animate-in fade-in duration-300">
                    <p className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-2.5">Últimos movimientos de la cuenta</p>
                    <div className="space-y-1.5 max-h-[110px] overflow-y-auto pr-1">
                      {accRecords.length === 0 ? (
                        <p className="text-[11px] text-zinc-400 font-medium italic text-center py-2 bg-zinc-50/50 rounded-lg">Sin movimientos registrados en esta cuenta.</p>
                      ) : (
                        accRecords
                          .slice(0, 3)
                          .map(r => (
                            <div key={r.id} className="flex justify-between items-center bg-zinc-50 p-2.5 rounded-xl border border-zinc-100/50 text-[11px] hover:bg-zinc-100/50 transition-colors duration-200">
                              <div className="truncate pr-2">
                                <span className="font-bold text-zinc-900 block truncate capitalize">{r.category}</span>
                                <span className="text-[10px] text-zinc-450 font-medium block truncate">{cleanDescription(r.description) || 'Sin comentario'}</span>
                              </div>
                              <span className={`font-extrabold whitespace-nowrap ${r.type === 'ingreso' ? 'text-emerald-600' : 'text-zinc-700'}`}>
                                {r.type === 'ingreso' ? '+' : '-'}MX${Math.round(r.amount).toLocaleString('es-MX')}
                              </span>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* GUARDAR Y ACCIONES */}
              <div className="pt-2 flex gap-2">
                {editingRecord && (
                  <button 
                    type="button" 
                    onClick={handleDeleteMovement}
                    disabled={isSaving}
                    className="w-14 shrink-0 bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center rounded-xl transition-colors disabled:opacity-50 border border-rose-200 cursor-pointer"
                  >
                    <X size={20} strokeWidth={2.5} />
                  </button>
                )}
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="flex-1 py-4 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl transition-colors disabled:opacity-50 shadow-lg text-[15px] cursor-pointer flex items-center justify-center"
                >
                  {isSaving ? 'Guardando...' : (editingRecord ? 'Actualizar Movimiento' : 'Guardar Movimiento')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Premium de Restablecimiento Contable (Reset) */}
      {showResetModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-zinc-950/70 backdrop-blur-md p-4 transition-all duration-300">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.25)] border border-red-100 animate-in zoom-in-95 duration-300 flex flex-col relative overflow-hidden text-zinc-900">
            {/* Warning outline top decorator */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-500 to-rose-600" />
            
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center border border-red-100 shrink-0">
                <Lock size={22} className="text-red-600" />
              </div>
              <button 
                onClick={() => { 
                  setShowResetModal(false); 
                  setResetConfirmText(''); 
                }} 
                className="p-2 bg-zinc-100 hover:bg-zinc-200 hover:rotate-90 hover:scale-105 active:scale-95 rounded-full text-zinc-500 transition-all duration-300 cursor-pointer animate-none"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-black text-zinc-900 tracking-tight leading-tight">
                Confirmación de Borrado Permanente
              </h3>
              <p className="text-[12px] text-zinc-500 leading-relaxed">
                Estás a punto de vaciar **todo el historial del Libro Contable** y restablecer el saldo de todas las cuentas contables a **$0 MXN**. 
              </p>
              
              <div className="bg-red-50/50 border border-red-150 rounded-2xl p-3 text-[11px] text-red-700 leading-relaxed font-medium">
                ⚠️ **Esta acción es irreversible**. Se registrará un log de auditoría permanente de tu usuario. Las reservas de huéspedes y el inventario no serán alterados.
              </div>

              <div>
                <label className="block text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-2">
                  Escribe "RESET" para confirmar la acción
                </label>
                <input 
                  type="text"
                  placeholder="RESET"
                  autoFocus
                  value={resetConfirmText}
                  onChange={e => setResetConfirmText(e.target.value)}
                  className="w-full text-center font-black tracking-widest text-lg bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-500 focus:bg-white transition-all text-zinc-900 placeholder:text-zinc-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button 
                  onClick={() => {
                    setShowResetModal(false);
                    setResetConfirmText('');
                  }}
                  disabled={isResetting}
                  className="py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition-all duration-300 text-[13px] active:scale-[0.96] cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleResetFinances}
                  disabled={isResetting || resetConfirmText !== 'RESET'}
                  className="py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all duration-300 disabled:opacity-40 text-[13px] flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(220,38,38,0.25)] hover:shadow-[0_8px_20px_rgba(220,38,38,0.35)] active:scale-[0.96] cursor-pointer"
                >
                  {isResetting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Trash2 size={16} strokeWidth={2.5} />
                      Borrar Todo
                    </>
                  )}
                </button>
              </div>
            </div>
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

      {/* Modal de Opciones de Exportación */}
      {showExportChoiceModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/60 backdrop-blur-md p-4 transition-all duration-300 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.25)] border border-zinc-150 animate-in zoom-in-95 duration-300 flex flex-col text-zinc-900">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-950 border border-zinc-200">
                  <Download size={18} strokeWidth={2.5} className="text-zinc-850" />
                </div>
                <div>
                  <h3 className="text-[17px] font-black text-zinc-900 tracking-tight leading-tight">
                    Exportar Reporte
                  </h3>
                  <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mt-0.5">Escoge una opción</span>
                </div>
              </div>
              <button 
                onClick={() => setShowExportChoiceModal(false)}
                className="p-2 bg-zinc-100 hover:bg-zinc-200 rounded-full text-zinc-505 transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={() => {
                  setShowExportChoiceModal(false);
                  setShowPreviewReportModal(true);
                }}
                className="w-full p-3.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 hover:border-zinc-300 rounded-2xl transition-all active:scale-[0.98] flex items-center gap-3.5 text-left group cursor-pointer"
              >
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                  <Eye size={18} strokeWidth={2.5} />
                </div>
                <div>
                  <span className="font-extrabold text-zinc-900 text-[12.5px] block leading-tight">Visualizar en Pantalla</span>
                  <span className="text-[9.5px] text-zinc-400 font-bold block mt-0.5">Ver datos de movimientos directamente aquí</span>
                </div>
              </button>

              {isMobileOrPWA() ? (
                <button
                  onClick={() => {
                    setShowExportChoiceModal(false);
                    executeShareFinanceReport();
                  }}
                  className="w-full p-3.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 hover:border-zinc-300 rounded-2xl transition-all active:scale-[0.98] flex items-center gap-3.5 text-left group cursor-pointer"
                >
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-650 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                    <Download size={18} strokeWidth={2.5} />
                  </div>
                  <div>
                    <span className="font-extrabold text-zinc-900 text-[12.5px] block leading-tight">Descargar o Compartir</span>
                    <span className="text-[9.5px] text-zinc-400 font-bold block mt-0.5">Guardar en Archivos o mandar por WhatsApp</span>
                  </div>
                </button>
              ) : (
                <button
                  onClick={executeDownloadFinanceReport}
                  className="w-full p-3.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 hover:border-zinc-300 rounded-2xl transition-all active:scale-[0.98] flex items-center gap-3.5 text-left group cursor-pointer"
                >
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                    <Download size={18} strokeWidth={2.5} />
                  </div>
                  <div>
                    <span className="font-extrabold text-zinc-900 text-[12.5px] block leading-tight">Descargar Archivo</span>
                    <span className="text-[9.5px] text-zinc-400 font-bold block mt-0.5">Descargar y guardar Excel directamente</span>
                  </div>
                </button>
              )}
            </div>

            {/* PWA / iOS Safe Tip badge */}
            <div className="mt-3.5 p-3 bg-zinc-50 border border-zinc-150 rounded-2xl text-[9px] text-zinc-450 leading-relaxed font-bold">
              💡 **Tip de Pantalla Completa (PWA)**: Para tu comodidad en móvil y PWA, la opción **Descargar** utiliza el sistema de guardado nativo para que puedas seleccionar **"Guardar en Archivos"** sin salir de la aplicación ni bloquear la pantalla.
            </div>

            <button
              onClick={() => setShowExportChoiceModal(false)}
              className="w-full mt-4 py-3 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl transition-all duration-300 text-[13px] active:scale-[0.96] cursor-pointer text-center"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal de Vista Previa del Reporte Contable */}
      {showPreviewReportModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/70 backdrop-blur-md p-4 transition-all duration-300 animate-in fade-in">
          <div className="bg-white w-full max-w-xl rounded-[32px] p-6 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.25)] border border-zinc-150 animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100">
                  <Eye size={18} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-[17px] font-black text-zinc-900 tracking-tight leading-tight">
                    Visualizador de Reporte
                  </h3>
                  <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mt-0.5">
                    {filteredRecords.length} movimientos encontrados
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setShowPreviewReportModal(false)}
                className="p-2 bg-zinc-100 hover:bg-zinc-200 rounded-full text-zinc-505 transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* CONTENIDO DE LA TABLA SCROLLABLE */}
            <div className="flex-1 overflow-auto border border-zinc-200/60 rounded-2xl bg-zinc-50/50">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-100 border-b border-zinc-200 text-[10px] font-extrabold text-zinc-450 uppercase tracking-wider sticky top-0 z-10">
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Categoría</th>
                    <th className="p-3 text-right">Monto</th>
                    <th className="p-3">Cuenta</th>
                    <th className="p-3">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-150 text-[11px] font-medium text-zinc-700">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-zinc-400 italic">No hay movimientos para mostrar.</td>
                    </tr>
                  ) : (
                    filteredRecords.map(r => (
                      <tr key={r.id} className="hover:bg-zinc-100/50 transition-colors">
                        <td className="p-3 whitespace-nowrap font-bold text-zinc-500">
                          {format(new Date((r.date || '').substring(0, 10) + 'T12:00:00Z'), 'dd/MM/yyyy')}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-extrabold border uppercase tracking-wider ${
                            r.type === 'ingreso' 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-250/30' 
                              : 'bg-rose-50 text-rose-700 border-rose-250/30'
                          }`}>
                            {r.type}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap font-extrabold text-zinc-900 capitalize">{r.category}</td>
                        <td className={`p-3 whitespace-nowrap text-right font-black ${
                          r.type === 'ingreso' ? 'text-emerald-600' : 'text-zinc-800'
                        }`}>
                          {r.type === 'ingreso' ? '+' : '-'}MX${Math.round(r.amount).toLocaleString('es-MX')}
                        </td>
                        <td className="p-3 whitespace-nowrap font-bold text-zinc-650">
                          {r.accounts?.name || 'N/A'}
                        </td>
                        <td className="p-3 min-w-[150px] max-w-[250px] truncate text-zinc-500" title={r.description}>
                          {cleanDescription(r.description, r.accounts?.name, r.payment_method)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-5 pt-3 border-t border-zinc-150 shrink-0 flex gap-3">
              <button
                onClick={() => {
                  setShowPreviewReportModal(false);
                  executeShareFinanceReport();
                }}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all duration-300 text-[13px] active:scale-[0.96] shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Share2 size={14} />
                Compartir Reporte
              </button>
              <button
                onClick={() => setShowPreviewReportModal(false)}
                className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl transition-all duration-300 text-[13px] active:scale-[0.96] cursor-pointer text-center"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Premium de Transferencias entre Cuentas */}
      {showTransferModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/60 backdrop-blur-md p-4 transition-all duration-300">
          <div className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.2)] border border-zinc-150 animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-900 border border-zinc-200">
                  <ArrowLeftRight size={18} className="text-zinc-850" />
                </div>
                <div>
                  <h3 className="text-[17px] font-black text-zinc-900 tracking-tight leading-tight">
                    Traspaso entre Cuentas
                  </h3>
                  <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mt-0.5">Movimiento Contable Interno</span>
                </div>
              </div>
              <button 
                onClick={() => setShowTransferModal(false)}
                className="p-2 bg-zinc-100 hover:bg-zinc-200 rounded-full text-zinc-500 transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleTransfer} className="space-y-4">
              <div>
                <label className="block text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Cuenta de Origen (Deducir)</label>
                <select 
                  required
                  value={transferFromId}
                  onChange={e => setTransferFromId(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 outline-none font-bold text-[13px] focus:ring-4 focus:ring-zinc-950/5 focus:border-zinc-900 focus:bg-white text-zinc-900 cursor-pointer transition-all duration-300"
                >
                  <option value="">Selecciona origen...</option>
                  {sortAccounts(accounts).map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} (${Math.round(acc.balance).toLocaleString('es-MX')} {acc.currency})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Cuenta de Destino (Acreditar)</label>
                <select 
                  required
                  value={transferToId}
                  onChange={e => setTransferToId(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 outline-none font-bold text-[13px] focus:ring-4 focus:ring-zinc-950/5 focus:border-zinc-900 focus:bg-white text-zinc-900 cursor-pointer transition-all duration-300"
                >
                  <option value="">Selecciona destino...</option>
                  {sortAccounts(accounts).map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} (${Math.round(acc.balance).toLocaleString('es-MX')} {acc.currency})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Fecha del Traspaso</label>
                <input 
                  type="date" 
                  required
                  value={transferDate}
                  onChange={e => setTransferDate(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 outline-none font-bold text-[13px] focus:ring-4 focus:ring-zinc-950/5 focus:border-zinc-900 focus:bg-white text-zinc-900 cursor-pointer transition-all duration-300"
                />
              </div>

              <div>
                <label className="block text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Monto del Traspaso</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-extrabold text-zinc-400 text-sm">$</span>
                  <input 
                    type="text" required
                    placeholder="0.00 o expresión (ej. =5000+1200)"
                    value={transferAmount}
                    onChange={e => setTransferAmount(e.target.value)}
                    className="w-full text-lg font-bold bg-zinc-50 border border-zinc-200 rounded-xl pl-8 pr-4 py-2.5 outline-none focus:ring-4 focus:ring-zinc-950/5 focus:border-zinc-900 focus:bg-white transition-all duration-350 text-zinc-900 placeholder:text-zinc-300"
                  />
                </div>

                {/* Math preview & currency conversion preview */}
                {(() => {
                  const evalAmt = evaluateMath(transferAmount);
                  if (evalAmt <= 0) return null;
                  const fromAcc = accounts.find(a => a.id === transferFromId);
                  const toAcc = accounts.find(a => a.id === transferToId);
                  
                  let conversionInfo = null;
                  if (fromAcc && toAcc && fromAcc.currency !== toAcc.currency) {
                    const amountInMXN = convertToMXN(evalAmt, fromAcc.currency);
                    const destRate = toAcc.currency === 'USD' ? rates.USD : toAcc.currency === 'EUR' ? rates.EUR : 1.0;
                    const convertedToAmount = amountInMXN / destRate;
                    
                    conversionInfo = (
                      <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl space-y-1 mt-2.5">
                        <span className="text-indigo-850 font-extrabold text-[8px] uppercase tracking-wider block">Conversión Multidivisa en Vivo</span>
                        <div className="flex justify-between items-center text-[11px] font-bold text-indigo-900">
                          <span>Envía desde {fromAcc.name}:</span>
                          <span>${Math.round(evalAmt).toLocaleString('es-MX')} {fromAcc.currency}</span>
                        </div>
                        <div className="flex justify-between items-center text-[11px] font-bold text-indigo-900">
                          <span>Recibe en {toAcc.name}:</span>
                          <span className="text-[12px] font-black text-indigo-655">${Math.round(convertedToAmount).toLocaleString('es-MX')} {toAcc.currency}</span>
                        </div>
                        <p className="text-[8px] text-indigo-400 font-semibold leading-tight pt-1">
                          Tasa de cambio del día: 1 USD = {rates.USD.toFixed(4)} MXN | 1 EUR = {rates.EUR.toFixed(4)} MXN
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="mt-3 space-y-2 animate-in slide-in-from-top-2 duration-300">
                      <div className="bg-zinc-100/50 p-2 rounded-xl text-center border border-zinc-200/40">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase">Monto Evaluado: </span>
                        <span className="font-extrabold text-[12px] text-zinc-800">${Math.round(evalAmt).toLocaleString('es-MX')} {fromAcc?.currency || ''}</span>
                      </div>
                      {conversionInfo}
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Descripción o Comentario (Opcional)</label>
                <input 
                  type="text"
                  placeholder="Ej. Reubicación de efectivo, fondeo..."
                  value={transferDescription}
                  onChange={e => setTransferDescription(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 outline-none text-[13px] focus:ring-4 focus:ring-zinc-950/5 focus:border-zinc-900 focus:bg-white text-zinc-900 placeholder:text-zinc-400 transition-all duration-300"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 py-3 bg-zinc-150 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition-all duration-300 text-[13px] active:scale-[0.96] cursor-pointer text-center"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isSaving || !transferFromId || !transferToId || evaluateMath(transferAmount) <= 0}
                  className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl transition-all duration-300 text-[13px] active:scale-[0.96] disabled:opacity-45 shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isSaving ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <ArrowLeftRight size={14} />
                      Traspasar
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Acomodar Cuentas (Estilo Inventario) */}
      {showAccountOrderModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/60 backdrop-blur-md p-4 transition-all duration-300">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.25)] border border-zinc-150 animate-in zoom-in-95 duration-300 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <div>
                <h3 className="text-[17px] font-black text-zinc-900 tracking-tight leading-tight">
                  Acomodar Cuentas
                </h3>
                <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mt-0.5">Organiza, Renombra o Elimina</span>
              </div>
              <button 
                onClick={() => setShowAccountOrderModal(false)}
                className="p-2 bg-zinc-100 hover:bg-zinc-200 hover:rotate-90 hover:scale-105 active:scale-95 rounded-full text-zinc-500 transition-all duration-300 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* LISTA DE CUENTAS */}
            <div className="space-y-2 overflow-y-auto pr-1 flex-1 py-1">
              {sortAccounts(accounts).map((acc, index, arr) => (
                <div 
                  key={acc.id}
                  className="flex items-center justify-between bg-zinc-50 border border-zinc-200/60 p-3 rounded-2xl hover:bg-white transition-all duration-300"
                >
                  <div className="truncate flex-1 pr-2">
                    {renamingAccount === acc.id ? (
                      <div className="flex items-center gap-1.5 w-full">
                        <input
                          type="text"
                          value={renamingNewName}
                          onChange={(e) => setRenamingNewName(e.target.value)}
                          className="w-full bg-zinc-100 border border-zinc-300 rounded-lg px-2.5 py-1 text-[12px] font-bold outline-none focus:bg-white focus:border-zinc-900 text-zinc-900"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameAccount(acc.id, acc.name);
                            if (e.key === 'Escape') setRenamingAccount(null);
                          }}
                        />
                        <button 
                          onClick={() => handleRenameAccount(acc.id, acc.name)}
                          className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                        >
                          Sí
                        </button>
                        <button 
                          onClick={() => setRenamingAccount(null)}
                          className="px-2 py-1 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <div>
                        <span className="font-extrabold text-zinc-900 text-[13px] block truncate leading-tight select-none">
                          {acc.name}
                        </span>
                        <span className="text-[8px] font-black text-zinc-400 uppercase tracking-wider block mt-0.5">{acc.group_type}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 select-none">
                    <button
                      disabled={index === 0}
                      onClick={() => moveAccount(acc.name, 'up')}
                      className="p-1.5 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40 rounded-lg text-zinc-650 cursor-pointer active:scale-90 transition-transform"
                      title="Mover arriba"
                    >
                      <ArrowUp size={12} strokeWidth={2.5} />
                    </button>
                    <button
                      disabled={index === arr.length - 1}
                      onClick={() => moveAccount(acc.name, 'down')}
                      className="p-1.5 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40 rounded-lg text-zinc-650 cursor-pointer active:scale-90 transition-transform"
                      title="Mover abajo"
                    >
                      <ArrowDown size={12} strokeWidth={2.5} />
                    </button>
                    {renamingAccount !== acc.id && (
                      <>
                        <button
                          onClick={() => {
                            setRenamingAccount(acc.id);
                            setRenamingNewName(acc.name);
                          }}
                          className="p-1.5 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded-lg transition-all cursor-pointer"
                          title="Renombrar Cuenta"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteAccount(acc.id)}
                          className="p-1.5 hover:bg-rose-50 text-zinc-400 hover:text-rose-600 rounded-lg transition-all cursor-pointer"
                          title="Eliminar Cuenta"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* BOTÓN CREAR NUEVA CUENTA */}
            <div className="pt-3 border-t border-zinc-100 shrink-0 space-y-2">
              <button 
                onClick={() => {
                  setAccName('');
                  setAccBalance('');
                  setAccGroupType('EFECTIVO');
                  setAccCurrency('MXN');
                  setShowAddAccountModal(true);
                }}
                className="w-full py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold border border-zinc-250/60 rounded-xl transition-all duration-300 text-[12px] active:scale-[0.96] cursor-pointer text-center flex items-center justify-center gap-1.5"
              >
                <Plus size={14} strokeWidth={2.5} />
                Agregar Nueva Cuenta
              </button>
              <button 
                onClick={() => setShowAccountOrderModal(false)}
                className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl transition-all duration-300 text-[13px] active:scale-[0.96] cursor-pointer text-center"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Premium para Crear Cuentas */}
      {showAddAccountModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/60 backdrop-blur-md p-4 transition-all duration-300">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.25)] border border-zinc-150 animate-in zoom-in-95 duration-300 flex flex-col">
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-900 border border-zinc-200">
                  <Plus size={18} strokeWidth={2.5} className="text-zinc-850" />
                </div>
                <div>
                  <h3 className="text-[17px] font-black text-zinc-900 tracking-tight leading-tight">
                    Nueva Cuenta
                  </h3>
                  <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mt-0.5">Crear Caja o Cuenta</span>
                </div>
              </div>
              <button 
                onClick={() => setShowAddAccountModal(false)}
                className="p-2 bg-zinc-100 hover:bg-zinc-200 rounded-full text-zinc-500 transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddAccount} className="space-y-4">
              <div>
                <label className="block text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Nombre de la Cuenta</label>
                <input 
                  type="text" required
                  placeholder="Ej. Caja Recepción, Dólares..."
                  value={accName}
                  onChange={e => setAccName(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 outline-none text-[13px] focus:ring-4 focus:ring-zinc-950/5 focus:border-zinc-900 focus:bg-white text-zinc-900 placeholder:text-zinc-400 transition-all duration-300 font-bold"
                />
              </div>

              <div>
                <label className="block text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Grupo Contable</label>
                <select 
                  value={accGroupType}
                  onChange={e => setAccGroupType(e.target.value as any)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 outline-none font-bold text-[13px] focus:ring-4 focus:ring-zinc-950/5 focus:border-zinc-900 focus:bg-white text-zinc-900 cursor-pointer transition-all duration-300"
                >
                  <option value="EFECTIVO">EFECTIVO (Cajas físicas)</option>
                  <option value="BANCOS">BANCOS (Cuentas corrientes)</option>
                  <option value="AHORROS">AHORROS (Fondos guardados)</option>
                  <option value="EXTRANJERO">EXTRANJERO (DLL/EUR)</option>
                  <option value="CUENTAS X COBRAR">CUENTAS X COBRAR (Saldos a favor / Booking)</option>
                  <option value="CUENTAS X PAGAR">CUENTAS X PAGAR (Obligaciones a pagar / Proveedores)</option>
                  <option value="COMISIONES">COMISIONES (Comisiones de OTAs)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Saldo Inicial</label>
                  <input 
                    type="number" step="0.01"
                    placeholder="0.00"
                    value={accBalance}
                    onChange={e => setAccBalance(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 outline-none text-[13px] focus:ring-4 focus:ring-zinc-950/5 focus:border-zinc-900 focus:bg-white text-zinc-900 placeholder:text-zinc-400 transition-all duration-300 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Moneda (Divisa)</label>
                  <select 
                    value={accCurrency}
                    onChange={e => setAccCurrency(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 outline-none font-bold text-[13px] focus:ring-4 focus:ring-zinc-950/5 focus:border-zinc-900 focus:bg-white text-zinc-900 cursor-pointer transition-all duration-300"
                  >
                    <option value="MXN">MXN (Pesos)</option>
                    <option value="USD">USD (Dólares)</option>
                    <option value="EUR">EUR (Euros)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
                  className="flex-1 py-3 bg-zinc-150 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition-all duration-300 text-[13px] active:scale-[0.96] cursor-pointer text-center"
                >
                  Atrás
                </button>
                <button 
                  type="submit"
                  disabled={isSavingAcc || !accName}
                  className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl transition-all duration-300 text-[13px] active:scale-[0.96] disabled:opacity-45 shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isSavingAcc ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Plus size={14} />
                      Crear
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
