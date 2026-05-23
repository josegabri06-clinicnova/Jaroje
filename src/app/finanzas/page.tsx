"use client";
 
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowDownLeft, ArrowUpRight, Plus, Download, Search, Edit2, X, Wallet, Landmark, PiggyBank, Globe, Lock, Trash2, RefreshCw, ArrowLeftRight } from 'lucide-react';
import Link from 'next/link';
import EmployeeModal from '@/components/EmployeeModal';
import { Employee, validatePinAsync } from '@/lib/auth';
 
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
  const [transferDescription, setTransferDescription] = useState('');
 
  // Gestionar cuentas (Agregar y Quitar)
  const [showManageAccountsModal, setShowManageAccountsModal] = useState(false);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [accName, setAccName] = useState('');
  const [accGroupType, setAccGroupType] = useState<'EFECTIVO' | 'BANCOS' | 'AHORROS' | 'EXTRANJERO' | 'CUENTAS X COBRAR'>('EFECTIVO');
  const [accBalance, setAccBalance] = useState('');
  const [accCurrency, setAccCurrency] = useState('MXN');
  const [isSavingAcc, setIsSavingAcc] = useState(false);
 
  // Filtro de Cuenta en Registro
  const [filterAccountId, setFilterAccountId] = useState('todo');

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
    'REVOLUT',
    'BBVA €',
    'IBC ROL',
    'IBC LAU',
    'IBC ROLY'
  ];

  
 
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
      setPinLocked(false); // Mantener abierto de inmediato
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

  const [activeTab, setActiveTab] = useState<'libro' | 'registro'>('libro');
  
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [accountsOrder, setAccountsOrder] = useState<string[]>([]);
  const [reorderMode, setReorderMode] = useState(false);
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
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSaving, setIsSaving] = useState(false);

  // Modal Quick Transact Account State
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [quickAmount, setQuickAmount] = useState('');
  const [quickConcept, setQuickConcept] = useState('Ajuste');
  const [quickDescription, setQuickDescription] = useState('');

  // States for absolute resetting of finances
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    
    const [accRes, recRes] = await Promise.all([
      supabase.from('accounts').select('*').order('name', { ascending: true }),
      supabase.from('finances').select('*, accounts(name)').order('date', { ascending: false }).order('created_at', { ascending: false })
    ]);
    
    if (!accRes.error) setAccounts(accRes.data || []);
    if (!recRes.error) setRecords(recRes.data || []);
    
    setIsLoading(false);
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
        setFormDate(new Date().toISOString().split('T')[0]);
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
    if (acc.group_type === 'EFECTIVO' || acc.name.toUpperCase().includes('EFECTIVO')) {
      return 'efectivo';
    }
    return 'transferencia';
  };

  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const evaluatedAmount = evaluateMath(formAmount);
    if (!formAmount || evaluatedAmount <= 0 || !formAccountId) {
      alert("Por favor ingresa un monto válido (número o expresión como 500+250)");
      return;
    }
    
    setIsSaving(true);

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

    const resolvedPaymentMethod = resolvePaymentMethod(formAccountId);

    const newRecord = {
      type: formType,
      amount: evaluatedAmount,
      category: formType === 'ingreso' && formCategory === 'Suministros' ? 'Reserva' : formCategory,
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
          oldAcc.balance += revertChange; // Update local temporarily
        }
      }
      
      // 2. Update Record
      const { error: updateErr } = await supabase.from('finances').update(newRecord).eq('id', editingRecord.id);
      
      // 3. Apply new balance
      if (!updateErr) {
        const newAcc = accounts.find(a => a.id === formAccountId);
        if (newAcc) {
          const applyChange = formType === 'ingreso' ? evaluatedAmount : -evaluatedAmount;
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
          const balanceChange = formType === 'ingreso' ? evaluatedAmount : -evaluatedAmount;
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
    const evaluatedAmount = evaluateMath(quickAmount);
    if (!editingAccount || !quickAmount || evaluatedAmount <= 0) {
      alert("Por favor ingresa un monto válido (número o expresión como 500+250)");
      return;
    }
    
    setIsSaving(true);
    
    const resolvedPaymentMethod = resolvePaymentMethod(editingAccount.id);

    const newRecord = {
      type: type,
      amount: evaluatedAmount,
      category: quickConcept,
      description: quickDescription || `Ajuste de ${type === 'ingreso' ? 'ingreso' : 'gasto'}`,
      account_id: editingAccount.id,
      payment_method: resolvedPaymentMethod,
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
    const balanceChange = type === 'ingreso' ? evaluatedAmount : -evaluatedAmount;
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
      alert("Error al actualizar el saldo de la cuenta");
    }
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
        date: new Date().toISOString().split('T')[0]
      };

      // 2. Registro de ingreso en sobre destino
      const recordIngreso = {
        type: 'ingreso',
        amount: convertedToAmount,
        category: 'Traspaso',
        description: `Traspaso recibido desde ${fromAcc.name} (${fromAcc.currency}). ${transferDescription}`.trim(),
        account_id: transferToId,
        payment_method: resolvePaymentMethod(transferToId),
        date: new Date().toISOString().split('T')[0]
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

      alert("✅ Transferencia completada con éxito.");
      setShowTransferModal(false);
      setTransferFromId('');
      setTransferToId('');
      setTransferAmount('');
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
            date: new Date().toISOString().split('T')[0]
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
      if (!confirm(`⚠️ Esta cuenta tiene un saldo activo de $${acc.balance.toLocaleString('es-MX')} ${acc.currency}. Si la eliminas, perderás este saldo en el total general. ¿Deseas continuar?`)) {
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
    // 1. Filtrar por tiempo (hoy, semana, mes, todo)
    let matchTime = true;
    if (filterType !== 'todo') {
      const rDate = new Date(r.date + 'T12:00:00Z'); // Evitar problemas de timezone
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

    // 2. Filtrar por cuenta específica
    let matchAccount = true;
    if (filterAccountId !== 'todo') {
      matchAccount = r.account_id === filterAccountId;
    }

    // 3. Filtrar por búsqueda de texto
    let matchSearch = true;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const desc = String(r.description || '').toLowerCase();
      const cat = String(r.category || '').toLowerCase();
      const amt = String(r.amount || '');
      const accountName = String(r.accounts?.name || '').toLowerCase();
      const dateStr = String(r.date || '');
      const typeStr = String(r.type || '').toLowerCase();

      matchSearch = desc.includes(query) || 
                    cat.includes(query) || 
                    amt.includes(query) || 
                    accountName.includes(query) ||
                    dateStr.includes(query) ||
                    typeStr.includes(query);
    }

    return matchTime && matchAccount && matchSearch;
  });

  const exportToCSV = () => {
    if (filteredRecords.length === 0) return alert("No hay datos para exportar.");
    window.location.href = `/api/finances/export?time=${filterType}&account=${filterAccountId}&search=${encodeURIComponent(searchQuery)}`;
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

  const totalGeneral = accounts.reduce((acc, curr) => acc + convertToMXN(curr.balance, curr.currency), 0);

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
          href="/"
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
            onClick={() => setReorderMode(!reorderMode)}
            className={`h-10 px-4 rounded-full flex items-center gap-1.5 shadow-sm active:scale-95 transition-all text-xs font-bold border ${
              reorderMode
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-white border-zinc-200 text-zinc-700'
            }`}
            title="Reordenar cuentas manualmente"
          >
            <span>{reorderMode ? '✓ Guardar Orden' : '⇄ Acomodar Cuentas'}</span>
          </button>

          <button 
            onClick={() => {
              setTransferFromId('');
              setTransferToId('');
              setTransferAmount('');
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
            onClick={() => setShowManageAccountsModal(true)}
            className="h-10 px-4 bg-white border border-zinc-200 text-zinc-700 rounded-full flex items-center gap-1.5 shadow-sm active:scale-95 transition-all text-xs font-bold"
            title="Gestionar Cuentas"
          >
            <PiggyBank size={14} className="text-zinc-650" />
            <span className="hidden sm:inline">Gestionar Cuentas</span>
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
          {/* Total General Consolidado al tope */}
          <div className="bg-zinc-900 text-white rounded-[32px] p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Total General Consolidado (MXN)</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl text-zinc-400 font-bold">$</span>
                  <p className="text-4xl font-black tracking-tighter">{totalGeneral.toLocaleString('es-MX')}</p>
                  <span className="text-xs text-zinc-450 font-bold tracking-wider">MXN</span>
                </div>
              </div>
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/10">
                <Wallet size={26} className="text-white" strokeWidth={2.5} />
              </div>
            </div>
          </div>

          {/* Cuadrícula Unificada de Cuentas */}
          <div className="bg-white border border-zinc-200/85 rounded-[32px] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-zinc-50 border border-zinc-200/60 text-zinc-800">
                  <Landmark size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-[16px] font-extrabold text-zinc-950 tracking-tight">Cuentas Contables</h3>
                  <p className="text-[9px] text-zinc-400 font-extrabold uppercase tracking-widest mt-0.5">Libro de Cuentas Activas</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
              {sortAccounts(accounts).map((acc, index, arr) => {
                let groupBadge = '';
                let badgeColor = '';
                switch(acc.group_type) {
                  case 'EFECTIVO':
                    groupBadge = 'Efectivo';
                    badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-150/40';
                    break;
                  case 'BANCOS':
                    groupBadge = 'Bancos';
                    badgeColor = 'bg-blue-50 text-blue-700 border-blue-150/40';
                    break;
                  case 'AHORROS':
                    groupBadge = 'Ahorros';
                    badgeColor = 'bg-purple-50 text-purple-700 border-purple-150/40';
                    break;
                  case 'EXTRANJERO':
                    groupBadge = 'Extranjero';
                    badgeColor = 'bg-violet-50 text-violet-700 border-violet-150/40';
                    break;
                  case 'CUENTAS X COBRAR':
                    groupBadge = 'Cuentas x Cobrar';
                    badgeColor = 'bg-amber-50 text-amber-700 border-amber-150/40';
                    break;
                  default:
                    groupBadge = acc.group_type;
                    badgeColor = 'bg-zinc-50 text-zinc-700 border-zinc-150';
                }

                return (
                  <div 
                    key={acc.id} 
                    className={`border rounded-2xl p-4 transition-all relative flex flex-col justify-between min-h-[125px] ${
                      reorderMode
                        ? 'border-emerald-300 ring-2 ring-emerald-500/5 bg-white shadow-sm'
                        : 'border-zinc-200/70 bg-[#fafafa] hover:bg-white hover:border-zinc-350 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="truncate flex-1">
                        <p className="text-[12px] font-extrabold text-zinc-950 truncate leading-snug">{acc.name}</p>
                        <span className={`inline-block text-[8px] font-extrabold px-1.5 py-0.5 rounded-md border mt-1 select-none tracking-wide uppercase ${badgeColor}`}>
                          {groupBadge}
                        </span>
                      </div>
                      {reorderMode && (
                        <div className="flex gap-0.5 shrink-0 select-none">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={(e) => { e.stopPropagation(); moveAccount(acc.name, 'up'); }}
                            className="w-6 h-6 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40 disabled:hover:bg-zinc-100 rounded-md flex items-center justify-center text-[10px] font-black text-zinc-700 cursor-pointer border border-zinc-250/60 active:scale-90 transition-transform"
                            title="Subir / Mover Izquierda"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={index === arr.length - 1}
                            onClick={(e) => { e.stopPropagation(); moveAccount(acc.name, 'down'); }}
                            className="w-6 h-6 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40 disabled:hover:bg-zinc-100 rounded-md flex items-center justify-center text-[10px] font-black text-zinc-700 cursor-pointer border border-zinc-250/60 active:scale-90 transition-transform"
                            title="Bajar / Mover Derecha"
                          >
                            ↓
                          </button>
                        </div>
                      )}
                    </div>
                    
                    <div 
                      onClick={() => {
                        if (!reorderMode) {
                          setEditingAccount(acc);
                          setQuickAmount('');
                          setQuickDescription('');
                          setQuickConcept('Ajuste');
                        }
                      }}
                      className={`mt-4 ${!reorderMode ? 'cursor-pointer' : 'select-none'}`}
                    >
                      <div className="flex items-baseline gap-0.5">
                        <span className="text-[10px] text-zinc-400 font-bold">$</span>
                        <p className="text-[17px] font-black text-zinc-950 tracking-tight leading-none">
                          {acc.balance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <span className="text-[9px] text-zinc-450 font-extrabold uppercase ml-0.5">{acc.currency}</span>
                      </div>
                      {acc.currency !== 'MXN' && (
                        <p className="text-[9.5px] font-bold text-zinc-400/90 leading-none mt-2 pt-1 border-t border-dashed border-zinc-200">
                          ≈ ${convertToMXN(acc.balance, acc.currency).toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

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
      ) : (
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
            
            <div className="sm:w-56 bg-white border border-zinc-200 p-1 rounded-xl shadow-sm flex items-center">
              <select
                value={filterAccountId}
                onChange={e => setFilterAccountId(e.target.value)}
                className="w-full bg-transparent border-none text-[12px] font-bold text-zinc-700 py-1.5 px-2 outline-none cursor-pointer"
              >
                <option value="todo">Todas las Cuentas</option>
                {sortAccounts(accounts).map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                ))}
              </select>
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
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-[12px] font-bold text-zinc-700 outline-none shadow-sm focus:border-zinc-400 focus:ring-1 focus:ring-zinc-950/5 placeholder:text-zinc-400 transition-all"
            />
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

      {/* Modal Registrar Movimiento en Cuenta */}
      {editingAccount && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/60 backdrop-blur-md p-4 transition-all duration-300">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.2)] border border-zinc-150 animate-in zoom-in-95 duration-300 flex flex-col">
             <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-[17px] font-black text-zinc-900 tracking-tight leading-tight">
                  Cuenta: {editingAccount.name}
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
              {(() => {
                const evalQuick = evaluateMath(quickAmount);
                return (
                  <>
                    <div>
                      <label className="block text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">Monto de la Transacción</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-extrabold text-zinc-400 text-sm">$</span>
                        <input 
                          type="text" required
                          placeholder="0.00 o fórmula (ej. =500-120)" autoFocus
                          value={quickAmount} onChange={e => setQuickAmount(e.target.value)}
                          className="w-full text-xl font-bold bg-zinc-50 border border-zinc-200 rounded-xl pl-8 pr-4 py-2.5 outline-none focus:ring-4 focus:ring-zinc-950/5 focus:border-zinc-900 focus:bg-white transition-all duration-350 text-zinc-900 placeholder:text-zinc-300"
                        />
                      </div>

                      {/* REAL-TIME PREVIEW CALCULATOR */}
                      {quickAmount && evalQuick > 0 && (
                        <div className="mt-3 p-3 bg-zinc-50 border border-zinc-150 rounded-2xl space-y-2.5 animate-in slide-in-from-top-2 duration-300">
                          <p className="font-extrabold text-zinc-400 uppercase tracking-widest text-[8px]">Calculadora Proyectada</p>
                          <div className="bg-zinc-100/50 p-2 rounded-xl text-center border border-zinc-200/40">
                            <span className="text-[9px] font-bold text-zinc-400 uppercase">Resultado Evaluado: </span>
                            <span className="font-black text-[12px] text-zinc-800">${evalQuick.toLocaleString('es-MX')} {editingAccount.currency}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-emerald-50/40 hover:bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl transition-all duration-300">
                              <span className="text-emerald-800 font-extrabold text-[9px] uppercase tracking-wider block mb-1">Si es Ingreso</span>
                              <span className="font-black text-[13px] text-emerald-600 tracking-tight block">
                                ${(editingAccount.balance + evalQuick).toLocaleString('es-MX')}
                              </span>
                              <span className="text-[8px] text-emerald-500/80 font-bold block mt-0.5">+{evalQuick.toLocaleString('es-MX')} {editingAccount.currency}</span>
                            </div>
                            <div className="bg-rose-50/40 hover:bg-rose-50 border border-rose-100 p-2.5 rounded-xl transition-all duration-300">
                              <span className="text-rose-800 font-extrabold text-[9px] uppercase tracking-wider block mb-1">Si es Gasto</span>
                              <span className="font-black text-[13px] text-rose-600 tracking-tight block">
                                ${(editingAccount.balance - evalQuick).toLocaleString('es-MX')}
                              </span>
                              <span className="text-[8px] text-rose-500/80 font-bold block mt-0.5">-{evalQuick.toLocaleString('es-MX')} {editingAccount.currency}</span>
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
                        placeholder="Comentario del movimiento"
                        value={quickDescription} onChange={e => setQuickDescription(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 outline-none text-[13px] focus:ring-4 focus:ring-zinc-950/5 focus:border-zinc-900 focus:bg-white text-zinc-900 placeholder:text-zinc-400 transition-all duration-300"
                      />
                    </div>

                    {/* RECENT MOVEMENTS IN THIS ACCOUNT */}
                    <div className="pt-1">
                      <p className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest mb-2">Últimos movimientos de la cuenta</p>
                      <div className="space-y-1.5 max-h-[110px] overflow-y-auto pr-1">
                        {records.filter(r => r.account_id === editingAccount.id).length === 0 ? (
                          <p className="text-[11px] text-zinc-400 font-medium italic text-center py-2 bg-zinc-50/50 rounded-lg">Sin movimientos registrados en esta cuenta.</p>
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
                        disabled={isSaving || !quickAmount || evalQuick <= 0}
                        className="py-3 bg-emerald-600 hover:bg-emerald-700 hover:-translate-y-0.5 text-white font-bold rounded-xl transition-all duration-300 disabled:opacity-40 text-[13px] flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(16,185,129,0.25)] hover:shadow-[0_8px_20px_rgba(16,185,129,0.35)] active:scale-[0.96] cursor-pointer"
                      >
                        <ArrowDownLeft size={16} strokeWidth={2.5} />
                        + Ingreso
                      </button>
                      <button 
                        onClick={() => handleQuickMovement('gasto')}
                        disabled={isSaving || !quickAmount || evalQuick <= 0}
                        className="py-3 bg-rose-600 hover:bg-rose-700 hover:-translate-y-0.5 text-white font-bold rounded-xl transition-all duration-300 disabled:opacity-40 text-[13px] flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(244,63,94,0.25)] hover:shadow-[0_8px_20px_rgba(244,63,94,0.35)] active:scale-[0.96] cursor-pointer"
                      >
                        <ArrowUpRight size={16} strokeWidth={2.5} />
                        - Gasto
                      </button>
                    </div>
                  </>
                );
              })()}
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

              <div>
                <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Monto</label>
                <input 
                  type="text" required
                  value={formAmount} onChange={e => setFormAmount(e.target.value)}
                  className="w-full text-3xl font-bold bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-all placeholder:text-zinc-300 text-base font-bold"
                  placeholder="0.00 o =250000-256000"
                />
                {/* REAL-TIME PREVIEW FOR FORM AMOUNT */}
                {formAmount && evaluateMath(formAmount) > 0 && (
                  <div className="mt-2 p-3 bg-zinc-50 border border-zinc-150 rounded-2xl animate-in slide-in-from-top-2 duration-300 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Total Evaluado:</span>
                    <span className="font-extrabold text-[14px] text-zinc-800">${evaluateMath(formAmount).toLocaleString('es-MX')} MXN</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">¿De/Para qué Cuenta?</label>
                <select 
                  required
                  value={formAccountId} onChange={e => setFormAccountId(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none font-bold text-base focus:ring-2 focus:ring-zinc-900/10 text-zinc-900"
                >
                  <option value="" disabled>Selecciona una Cuenta...</option>
                  {sortAccounts(accounts).map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.group_type})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Concepto / Categoría</label>
                <select 
                  value={formCategory} onChange={e => setFormCategory(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none font-medium text-base focus:ring-2 focus:ring-zinc-900/10 text-zinc-900 font-bold"
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
                      <option>Otros</option>
                    </>
                  ) : (
                    <>
                      <option>Reserva Directa</option>
                      <option>Walk In</option>
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
                    <option key={acc.id} value={acc.id}>{acc.name} (${acc.balance.toLocaleString('es-MX')} {acc.currency})</option>
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
                    <option key={acc.id} value={acc.id}>{acc.name} (${acc.balance.toLocaleString('es-MX')} {acc.currency})</option>
                  ))}
                </select>
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
                          <span>${evalAmt.toLocaleString('es-MX')} {fromAcc.currency}</span>
                        </div>
                        <div className="flex justify-between items-center text-[11px] font-bold text-indigo-900">
                          <span>Recibe en {toAcc.name}:</span>
                          <span className="text-[12px] font-black text-indigo-655">${convertedToAmount.toLocaleString('es-MX')} {toAcc.currency}</span>
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
                        <span className="font-extrabold text-[12px] text-zinc-800">${evalAmt.toLocaleString('es-MX')} {fromAcc?.currency || ''}</span>
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

      {/* Modal Premium de Gestión de Cuentas */}
      {showManageAccountsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/60 backdrop-blur-md p-4 transition-all duration-300">
          <div className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.2)] border border-zinc-150 animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-5 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-900 border border-zinc-200">
                  <PiggyBank size={18} strokeWidth={2.5} className="text-zinc-850" />
                </div>
                <div>
                  <h3 className="text-[17px] font-black text-zinc-900 tracking-tight leading-tight">
                    Administrar Cuentas
                  </h3>
                  <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mt-0.5">Carteras y Cuentas Activas</span>
                </div>
              </div>
              <button 
                onClick={() => setShowManageAccountsModal(false)}
                className="p-2 bg-zinc-100 hover:bg-zinc-200 rounded-full text-zinc-500 transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* List of Envelopes */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 mb-4">
              {sortAccounts(accounts).map(acc => (
                <div key={acc.id} className="flex justify-between items-center bg-zinc-50 hover:bg-zinc-100/50 p-3 rounded-2xl border border-zinc-200/55 transition-all duration-200">
                  <div>
                    <span className="font-extrabold text-zinc-900 text-[13px] block leading-tight">{acc.name}</span>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block mt-0.5">{acc.group_type}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-black text-[13px] text-zinc-800">${acc.balance.toLocaleString('es-MX')} <span className="text-[9px] text-zinc-400 font-bold">{acc.currency}</span></span>
                    <button 
                      onClick={() => handleDeleteAccount(acc.id)}
                      className="p-2 hover:bg-rose-50 text-zinc-400 hover:text-rose-600 rounded-xl transition-all cursor-pointer"
                      title="Eliminar cuenta"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex gap-3 shrink-0">
              <button 
                onClick={() => setShowManageAccountsModal(false)}
                className="flex-1 py-3 bg-zinc-150 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition-all duration-300 text-[13px] active:scale-[0.96] cursor-pointer text-center"
              >
                Cerrar
              </button>
              <button 
                onClick={() => {
                  setAccName('');
                  setAccBalance('');
                  setAccGroupType('EFECTIVO');
                  setAccCurrency('MXN');
                  setShowAddAccountModal(true);
                }}
                className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl transition-all duration-300 text-[13px] active:scale-[0.96] shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                Nueva Cuenta
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
                  <option value="CUENTAS X COBRAR">CUENTAS X COBRAR</option>
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
