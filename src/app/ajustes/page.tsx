"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
// @ts-ignore
import { startRegistration } from '@simplewebauthn/browser';
import { 
  Hotel, Shield, ChevronRight, ChevronUp, ChevronDown,
  Star, Key, X, Check, Eye, EyeOff, LogOut,
  Users, Plus, Trash2, Edit2, ArrowUp, ArrowDown,
  Database, Sparkles, History, AlertTriangle, CheckCircle2, Download, Wrench,
  TrendingUp, RotateCcw
} from 'lucide-react';
import { 
  getAdminPin, getStaffLimpiezaPin, getStaffMantenimientoPin, getRecepcionPin, 
  saveAdminPin, saveStaffLimpiezaPin, saveStaffMantenimientoPin, saveRecepcionPin, 
  logout 
} from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { format, subDays, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';

type PinTarget = 'admin' | 'staff_limpieza' | 'staff_mantenimiento' | 'recepcion' | null;

interface Employee {
  employee_num: string;
  full_name: string;
  department: 'recepcion' | 'limpieza' | 'mantenimiento';
}

interface Account {
  id: string;
  name: string;
  group_type: 'EFECTIVO' | 'BANCOS' | 'AHORROS' | 'EXTRANJERO' | 'CUENTAS X COBRAR' | 'CUENTAS X PAGAR' | 'COMISIONES';
  balance: number;
  currency: string;
  sort_index?: number | null;
}

export default function AjustesPage() {
  const router = useRouter();

  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    perfil: false,
    seguridad: false,
    whatsapp: false,
    contable: false,
    tarifas: false,
    empleados: false,
    depuracion: false,
  });

  const [disableAutoWA, setDisableAutoWA] = useState(false);
  const [savingAutoWA, setSavingAutoWA] = useState(false);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Depuración states
  const [depurarTab, setDepurarTab] = useState<'logs' | 'tasks'>('logs');
  const [depurarLogs, setDepurarLogs] = useState<any[]>([]);
  const [depurarTasks, setDepurarTasks] = useState<any[]>([]);
  const [isLoadingDepurar, setIsLoadingDepurar] = useState(false);
  const [depurarSelectedIds, setDepurarSelectedIds] = useState<Set<string>>(new Set());
  const [showPurgeConfirmModal, setShowPurgeConfirmModal] = useState(false);
  const [purgeBackedUpConfirmed, setPurgeBackedUpConfirmed] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // PIN states
  const [pinModal, setPinModal]     = useState<PinTarget>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin]         = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPins, setShowPins]     = useState(false);
  const [pinError, setPinError]     = useState('');
  const [pinSuccess, setPinSuccess] = useState('');

  // Employees CRUD states
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  
  // Employees Form states
  const [formEmployeeNum, setFormEmployeeNum] = useState('');
  const [formEmployeeName, setFormEmployeeName] = useState('');
  const [formEmployeeDept, setFormEmployeeDept] = useState<'recepcion' | 'limpieza' | 'mantenimiento'>('recepcion');
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);

  // Cuentas states
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showAccountOrderModal, setShowAccountOrderModal] = useState(false);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [accName, setAccName] = useState('');
  const [accBalance, setAccBalance] = useState('');
  const [accGroupType, setAccGroupType] = useState<'EFECTIVO' | 'BANCOS' | 'AHORROS' | 'EXTRANJERO' | 'CUENTAS X COBRAR' | 'CUENTAS X PAGAR' | 'COMISIONES'>('EFECTIVO');
  const [accCurrency, setAccCurrency] = useState('MXN');
  const [isSavingAcc, setIsSavingAcc] = useState(false);
  const [renamingAccount, setRenamingAccount] = useState<string | null>(null);
  const [renamingNewName, setRenamingNewName] = useState('');

  // Load pins and employees on mount
  const fetchEmployees = async () => {
    setIsLoadingEmployees(true);
    try {
      const res = await fetch('/api/employees');
      if (res.ok) {
        const body = await res.json();
        if (body.success && Array.isArray(body.data)) {
          setEmployees(body.data);
          // Keep local mirror updated
          localStorage.setItem('jaroje_official_employees', JSON.stringify(body.data));
        }
      }
    } catch (e) {
      console.error('Error fetching employees:', e);
    } finally {
      setIsLoadingEmployees(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .order('sort_index', { ascending: true })
        .order('name', { ascending: true });
      if (!error && data) {
        setAccounts(data);
      }
    } catch (e) {
      console.error("Error fetching accounts:", e);
    }
  };

  const fetchDepurarData = async () => {
    setIsLoadingDepurar(true);
    try {
      const [logsRes, tasksRes] = await Promise.all([
        fetch('/api/employee-logs'),
        fetch('/api/tasks?status=resuelta')
      ]);

      const logsJson = await logsRes.json();
      const tasksJson = await tasksRes.json();

      if (logsJson.success) setDepurarLogs(logsJson.data || []);
      if (tasksJson.success) {
        setDepurarTasks((tasksJson.data || []).filter((t: any) => t.status === 'resuelta'));
      }
    } catch (e) {
      console.error("Error al cargar datos históricos para limpieza:", e);
    } finally {
      setIsLoadingDepurar(false);
      setDepurarSelectedIds(new Set());
    }
  };

  useEffect(() => {
    if (expandedSections.depuracion) {
      fetchDepurarData();
    }
  }, [expandedSections.depuracion]);

  const activeDepurarData = depurarTab === 'logs' ? depurarLogs : depurarTasks;

  const handleToggleDepurarRow = (id: string) => {
    const next = new Set(depurarSelectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setDepurarSelectedIds(next);
  };

  const handleToggleDepurarAll = () => {
    if (depurarSelectedIds.size === activeDepurarData.length) {
      setDepurarSelectedIds(new Set());
    } else {
      setDepurarSelectedIds(new Set(activeDepurarData.map(item => String(item.id))));
    }
  };

  const handleDepurarQuickSelect = (days: number) => {
    const cutoffDate = subDays(new Date(), days);
    const matched = activeDepurarData.filter(item => {
      const itemDate = new Date(item.created_at || item.resolved_at);
      return isBefore(itemDate, cutoffDate);
    });

    if (matched.length === 0) {
      setToastMessage(`⚠️ Ningún registro tiene más de ${days} días.`);
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }

    setDepurarSelectedIds(new Set(matched.map(item => String(item.id))));
    setToastMessage(`✓ Seleccionados ${matched.length} registros anteriores a ${days} días.`);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleDepurarSelectAll = () => {
    setDepurarSelectedIds(new Set(activeDepurarData.map(item => String(item.id))));
  };

  const handleDepurarExportJSON = () => {
    if (depurarSelectedIds.size === 0) {
      alert("Selecciona al menos un registro para descargar.");
      return;
    }

    const itemsToExport = activeDepurarData.filter(item => depurarSelectedIds.has(String(item.id)));
    const filename = `respaldo_jaroje_${depurarTab}_${format(new Date(), 'yyyy-MM-dd')}.json`;
    const jsonStr = JSON.stringify(itemsToExport, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    setToastMessage("📥 ¡Respaldo JSON descargado con éxito!");
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleDepurarExportCSV = () => {
    if (depurarSelectedIds.size === 0) {
      alert("Selecciona al menos un registro para descargar.");
      return;
    }

    const itemsToExport = activeDepurarData.filter(item => depurarSelectedIds.has(String(item.id)));
    let csvContent = "";

    if (depurarTab === 'logs') {
      const headers = ["ID", "Fecha", "Empleado", "Módulo", "Acción", "Habitación", "Detalles"];
      csvContent = [
        headers.join(","),
        ...itemsToExport.map(item => [
          item.id,
          format(new Date(item.created_at), 'yyyy-MM-dd HH:mm'),
          `"${(item.employee_name || 'Sistema').replace(/"/g, '""')}"`,
          `"${(item.module || 'recepcion').replace(/"/g, '""')}"`,
          `"${(item.action || '').replace(/"/g, '""')}"`,
          `"${(item.room || 'General').replace(/"/g, '""')}"`,
          `"${(item.details || '').replace(/"/g, '""')}"`
        ].join(","))
      ].join("\n");
    } else {
      const headers = ["ID", "Fecha Reporte", "Fecha Resolución", "Ubicación", "Reportado Por", "Descripción"];
      csvContent = [
        headers.join(","),
        ...itemsToExport.map(item => [
          item.id,
          format(new Date(item.created_at), 'yyyy-MM-dd HH:mm'),
          item.resolved_at ? format(new Date(item.resolved_at), 'yyyy-MM-dd HH:mm') : '—',
          `"${(item.room || 'General').replace(/"/g, '""')}"`,
          `"${(item.reported_by || 'Staff').replace(/"/g, '""')}"`,
          `"${(item.description || '').replace(/"/g, '""')}"`
        ].join(","))
      ].join("\n");
    }

    const filename = `respaldo_jaroje_${depurarTab}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    setToastMessage("📥 ¡Respaldo CSV descargado con éxito!");
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handlePurgeSubmit = async () => {
    if (!purgeBackedUpConfirmed) {
      alert("Por favor, confirma que has descargado un respaldo de los datos.");
      return;
    }

    setIsPurging(true);
    try {
      const idsArray = Array.from(depurarSelectedIds);
      const url = depurarTab === 'logs' ? '/api/employee-logs' : '/api/tasks';

      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsArray })
      });

      const json = await res.json();
      if (json.success) {
        setToastMessage(`🔥 Se eliminaron permanentemente ${idsArray.length} registros.`);
        setTimeout(() => setToastMessage(''), 4000);
        setShowPurgeConfirmModal(false);
        setPurgeBackedUpConfirmed(false);
        fetchDepurarData();
      } else {
        throw new Error(json.error || "Error en el servidor");
      }
    } catch (e: any) {
      console.error(e);
      alert(`Error al eliminar datos: ${e.message}`);
    } finally {
      setIsPurging(false);
    }
  };

  const [passkeys, setPasskeys] = useState<any[]>([]);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [showRecoveryKey, setShowRecoveryKey] = useState(false);
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false);

  const generateRandomKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segment = (len: number) => {
      let str = '';
      for (let i = 0; i < len; i++) {
        str += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return str;
    };
    return `JRJ-SEC-${segment(4)}-${segment(4)}-${segment(4)}`;
  };

  const fetchRecoveryKey = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'admin_recovery_key')
        .maybeSingle();
      if (!error && data) {
        setRecoveryKey(data.value);
      } else {
        setRecoveryKey('JRJ-SEC-9X2P-7QLK-4M1Z');
      }
    } catch (e) {
      console.error('Error fetching recovery key:', e);
    }
  };

  const handleRegenerateRecoveryKey = async () => {
    if (!confirm('¿Estás seguro de que deseas regenerar la Llave de Recuperación Maestra? La llave anterior dejará de ser válida inmediatamente.')) {
      return;
    }
    setIsRegeneratingKey(true);
    const newKey = generateRandomKey();
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({ key: 'admin_recovery_key', value: newKey }, { onConflict: 'key' });
      
      if (error) throw error;
      
      setRecoveryKey(newKey);
      alert('✅ Llave de Recuperación Maestra regenerada con éxito. Asegúrate de guardarla en un lugar seguro.');
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al regenerar la llave: ${err.message}`);
    } finally {
      setIsRegeneratingKey(false);
    }
  };

  const fetchDisableAutoWA = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'disable_automatic_whatsapp')
        .maybeSingle();
      if (!error && data) {
        setDisableAutoWA(data.value === true || data.value === 'true');
      } else {
        setDisableAutoWA(false);
      }
    } catch (e) {
      console.error('Error fetching disable auto WA setting:', e);
    }
  };

  const handleToggleAutoWA = async (checked: boolean) => {
    setSavingAutoWA(true);
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({ key: 'disable_automatic_whatsapp', value: String(checked) }, { onConflict: 'key' });
      
      if (error) throw error;
      setDisableAutoWA(checked);
      setToastMessage(checked ? "⏸️ WhatsApp automático pausado." : "▶️ WhatsApp automático activado.");
      setTimeout(() => setToastMessage(''), 3000);
    } catch (err: any) {
      console.error(err);
      alert(`Error al actualizar configuración de WhatsApp: ${err.message}`);
    } finally {
      setSavingAutoWA(false);
    }
  };

  const fetchPasskeys = async () => {
    try {
      const { data, error } = await supabase
        .from('user_passkeys')
        .select('id, device_name, created_at')
        .eq('role', 'admin')
        .order('created_at', { ascending: false });
      if (!error && data) {
        setPasskeys(data);
      }
    } catch (err) {
      console.error('Error fetching passkeys:', err);
    }
  };

  const handleRegisterBiometrics = async () => {
    const deviceNameInput = prompt("Introduce un nombre para este dispositivo (ej: iPhone de Josega, Laptop Trabajo):");
    if (!deviceNameInput) return;
    
    try {
      const resOptions = await fetch('/api/auth/webauthn/register/options');
      const options = await resOptions.json();
      if (!resOptions.ok) throw new Error(options.error || 'Error al obtener opciones de registro');
      
      const credential = await startRegistration(options);
      
      const resVerify = await fetch('/api/auth/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationResponse: credential,
          deviceName: deviceNameInput
        })
      });
      const verifyResult = await resVerify.json();
      if (!resVerify.ok) throw new Error(verifyResult.error || 'Error al verificar credencial');
      
      alert('✅ ¡Dispositivo registrado con éxito!');
      fetchPasskeys();
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al registrar biometría: ${err.message}`);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este dispositivo de los accesos autorizados?')) return;
    try {
      const res = await fetch('/api/auth/webauthn/register/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar el dispositivo');

      alert('✅ Dispositivo eliminado.');
      fetchPasskeys();
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error al eliminar dispositivo: ${err.message}`);
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchAccounts();
    fetchPasskeys();
    fetchRecoveryKey();
    fetchDisableAutoWA();

    // Check section parameter on load
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const section = params.get('section');
      if (section && ['perfil', 'seguridad', 'contable', 'tarifas', 'empleados', 'depuracion'].includes(section)) {
        setExpandedSections(prev => ({
          ...prev,
          [section]: true
        }));
        setTimeout(() => {
          const el = document.getElementById(`section-${section}`);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 300);
      }
    }
  }, []);

  const openPinModal = (target: PinTarget) => {
    setPinModal(target);
    setCurrentPin(''); setNewPin(''); setConfirmPin('');
    setPinError(''); setPinSuccess('');
  };

  const savePinChange = () => {
    const currentCorrect = 
      pinModal === 'admin' 
        ? getAdminPin() 
        : pinModal === 'recepcion'
        ? getRecepcionPin()
        : pinModal === 'staff_limpieza' 
        ? getStaffLimpiezaPin() 
        : getStaffMantenimientoPin();

    if (currentPin !== currentCorrect) { setPinError('El PIN actual no es correcto.'); return; }
    if (newPin.length < 4)             { setPinError('El PIN nuevo debe tener al menos 4 dígitos.'); return; }
    if (!/^\d+$/.test(newPin))         { setPinError('El PIN solo puede contener números.'); return; }
    if (newPin !== confirmPin)         { setPinError('Los PINs nuevos no coinciden.'); return; }
    
    if (pinModal === 'admin') saveAdminPin(newPin);
    else if (pinModal === 'recepcion') saveRecepcionPin(newPin);
    else if (pinModal === 'staff_limpieza') saveStaffLimpiezaPin(newPin);
    else saveStaffMantenimientoPin(newPin);

    // Disparar sincronización silenciosa del Copiloto en caliente
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('sync-copilot'));
    }

    setPinSuccess('✅ PIN actualizado correctamente.');
    setPinError('');
    setTimeout(() => { setPinModal(null); setPinSuccess(''); }, 1500);
  };

  // Employees CRUD actions
  const openEditEmployee = (emp?: Employee) => {
    if (emp) {
      setEditingEmployee(emp);
      setFormEmployeeNum(emp.employee_num);
      setFormEmployeeName(emp.full_name);
      setFormEmployeeDept(emp.department);
    } else {
      setEditingEmployee(null);
      setFormEmployeeNum('');
      setFormEmployeeName('');
      setFormEmployeeDept('recepcion');
    }
    setShowEmployeeModal(true);
  };

  const handleSaveEmployee = async () => {
    if (!/^\d{3}$/.test(formEmployeeNum)) {
      alert('El código de empleado debe tener exactamente 3 dígitos numéricos.');
      return;
    }
    if (!formEmployeeName.trim()) {
      alert('Por favor ingresa el nombre completo del empleado.');
      return;
    }

    setIsSavingEmployee(true);
    try {
      let updatedList = [...employees];
      if (editingEmployee) {
        // Edit mode
        updatedList = updatedList.map(e => 
          (e.employee_num === editingEmployee.employee_num && e.department === editingEmployee.department)
            ? { ...e, employee_num: formEmployeeNum, full_name: formEmployeeName.trim(), department: formEmployeeDept }
            : e
        );
      } else {
        // Add mode: check if code is already in use
        const codeExists = employees.some(e => e.employee_num === formEmployeeNum);
        if (codeExists) {
          alert('El código de empleado ya está en uso. Por favor asigna un código único.');
          setIsSavingEmployee(false);
          return;
        }
        updatedList.push({
          employee_num: formEmployeeNum,
          full_name: formEmployeeName.trim(),
          department: formEmployeeDept
        });
      }

      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees: updatedList })
      });

      if (res.ok) {
        setEmployees(updatedList);
        localStorage.setItem('jaroje_official_employees', JSON.stringify(updatedList));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('sync-copilot'));
        }
        setShowEmployeeModal(false);
      } else {
        const body = await res.json();
        alert(`Error al guardar: ${body.error || 'Error desconocido'}`);
      }
    } catch (e) {
      console.error(e);
      alert('Error guardando cambios.');
    } finally {
      setIsSavingEmployee(false);
    }
  };

  const handleDeleteEmployee = async (emp: Employee) => {
    if (!confirm(`¿Estás seguro de que deseas dar de baja a ${emp.full_name}?`)) {
      return;
    }

    try {
      const updatedList = employees.filter(
        e => !(e.employee_num === emp.employee_num && e.department === emp.department)
      );

      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees: updatedList })
      });

      if (res.ok) {
        setEmployees(updatedList);
        localStorage.setItem('jaroje_official_employees', JSON.stringify(updatedList));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('sync-copilot'));
        }
      } else {
        const body = await res.json();
        alert(`Error al eliminar: ${body.error || 'Error desconocido'}`);
      }
    } catch (e) {
      console.error(e);
      alert('Error de red al eliminar empleado.');
    }
  };

  const handleMoveEmployee = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= employees.length) return;

    const updatedList = [...employees];
    // Swap
    const temp = updatedList[index];
    updatedList[index] = updatedList[newIndex];
    updatedList[newIndex] = temp;

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees: updatedList })
      });

      if (res.ok) {
        setEmployees(updatedList);
        localStorage.setItem('jaroje_official_employees', JSON.stringify(updatedList));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('sync-copilot'));
        }
      } else {
        const body = await res.json();
        alert(`Error al ordenar empleado: ${body.error || 'Error desconocido'}`);
      }
    } catch (e) {
      console.error(e);
      alert('Error de red al ordenar empleado.');
    }
  };

  // --- ACCOUNT CRUD HANDLERS ---
  const sortAccounts = (accs: Account[]) => {
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
    const sorted = sortAccounts(accounts);
    const index = sorted.findIndex(a => a.name.trim().toUpperCase() === accName.trim().toUpperCase());
    if (index === -1) return;

    const targetIndex = index + (direction === 'up' ? -1 : 1);
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    const newSorted = [...sorted];
    const [movedItem] = newSorted.splice(index, 1);
    newSorted.splice(targetIndex, 0, movedItem);

    const updatedAccounts = accounts.map(a => {
      const newIdx = newSorted.findIndex(item => item.id === a.id);
      return { ...a, sort_index: newIdx };
    });
    setAccounts(updatedAccounts);

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
              text: `Renombró cuenta: "${currentName}" a "${clean}"`,
              account: {
                oldName: currentName,
                newName: clean
              }
            })
          })
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

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
      await supabase.from('finances').update({ account_id: null }).eq('account_id', accountId);

      const { error } = await supabase.from('accounts').delete().eq('id', accountId);
      if (error) throw error;

      alert("✅ Cuenta eliminada con éxito.");
      fetchAccounts();
    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      alert("❌ Error al eliminar la cuenta: " + errMsg);
    }
  };

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

      if (balanceNum > 0) {
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
      fetchAccounts();
    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      alert("❌ Error al crear la cuenta: " + errMsg);
    } finally {
      setIsSavingAcc(false);
    }
  };

  const handleLogout = () => { logout(); router.replace('/login'); };

  const CollapsibleSection = ({ 
    id,
    icon, 
    title, 
    isOpen, 
    onToggle, 
    children,
    headerAddon
  }: { 
    id: string;
    icon: React.ReactNode; 
    title: string; 
    isOpen: boolean; 
    onToggle: () => void; 
    children: React.ReactNode;
    headerAddon?: React.ReactNode;
  }) => (
    <div id={`section-${id}`} className="border border-zinc-200/80 rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden mb-4 transition-all duration-300">
      <div 
        onClick={onToggle}
        className="flex items-center justify-between p-4.5 cursor-pointer hover:bg-zinc-50/50 select-none"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-zinc-100 rounded-lg flex items-center justify-center text-zinc-650 shrink-0">
            {icon}
          </div>
          <h2 className="text-[12.5px] font-black text-zinc-900 uppercase tracking-wider leading-none">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {headerAddon}
          <button onClick={onToggle} className="p-1.5 rounded-lg hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600 transition-colors">
            {isOpen ? <ChevronUp size={16} strokeWidth={2.5} /> : <ChevronDown size={16} strokeWidth={2.5} />}
          </button>
        </div>
      </div>
      
      {isOpen && (
        <div className="border-t border-zinc-150 p-4 bg-white animate-in fade-in duration-200">
          {children}
        </div>
      )}
    </div>
  );

  const Row = ({ label, value, onPress }: { label: string; value?: string; onPress?: () => void }) => (
    <div onClick={onPress} className={`flex items-center justify-between py-3.5 border-b border-zinc-100 last:border-none ${onPress ? 'cursor-pointer active:bg-zinc-50' : ''}`}>
      <span className="text-[15px] font-medium text-zinc-800">{label}</span>
      <div className="flex items-center gap-2">
        {value && <span className="text-[13px] font-medium text-zinc-400">{value}</span>}
        {onPress && <ChevronRight size={16} className="text-zinc-300" strokeWidth={2.5} />}
      </div>
    </div>
  );

  return (
    <div className="space-y-1 pb-24 bg-[#fafafa] px-4 sm:px-6">
      
      <div className="mb-6 pt-4">
        <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight leading-tight">Ajustes</h2>
        <p className="text-[13px] font-medium text-zinc-500 mt-1">Jaroje Hotel · Versión 1.2.0</p>
      </div>

      {/* 1. PERFIL DEL HOTEL */}
      <CollapsibleSection
        id="perfil"
        icon={<Hotel size={15} strokeWidth={2.5} />}
        title="Perfil del Hotel"
        isOpen={expandedSections.perfil}
        onToggle={() => toggleSection('perfil')}
      >
        <div className="py-2.5 flex items-center gap-4 border-b border-zinc-100 pb-4">
          <div className="w-14 h-14 rounded-xl bg-zinc-900 flex items-center justify-center shrink-0 shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-white" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div>
            <h3 className="text-[17px] font-semibold text-zinc-900 leading-tight">Condominios Jaroje</h3>
            <div className="flex items-center gap-1.5 mt-1">
              {[1,2,3,4,5].map(i => <Star key={i} size={11} className="text-zinc-900 fill-zinc-900" />)}
              <span className="text-[11px] font-medium text-zinc-400 ml-1">• Premium</span>
            </div>
          </div>
        </div>
        <div className="divide-y divide-zinc-100">
          <Row label="Nombre del hotel" value="Condominios Jaroje" />
          <Row label="Habitaciones" value="21 unidades" />
        </div>
      </CollapsibleSection>

      {/* 2. SEGURIDAD Y ACCESO */}
      <CollapsibleSection
        id="seguridad"
        icon={<Shield size={15} strokeWidth={2.5} />}
        title="Seguridad y Acceso"
        isOpen={expandedSections.seguridad}
        onToggle={() => toggleSection('seguridad')}
      >
        <div className="divide-y divide-zinc-100">
          <Row label="Cambiar PIN Recepción" value="••••" onPress={() => openPinModal('recepcion')} />
          <Row label="Cambiar PIN Limpieza" value="••••" onPress={() => openPinModal('staff_limpieza')} />
          <Row label="Cambiar PIN Mantenimiento" value="••••" onPress={() => openPinModal('staff_mantenimiento')} />

          <div className="py-3.5 flex items-center justify-between border-b border-zinc-100 last:border-none">
            <div className="flex flex-col">
              <span className="text-[15px] font-medium text-zinc-800">Llave de Recuperación Maestra</span>
              <span className="text-[11px] text-zinc-400 mt-0.5 font-sans">Usada para registrar nuevos dispositivos Admin</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-mono font-bold text-zinc-700 bg-zinc-100 px-2.5 py-1 rounded">
                {showRecoveryKey ? recoveryKey : '••••-••••-••••-••••'}
              </span>
              <button
                type="button"
                onClick={() => setShowRecoveryKey(!showRecoveryKey)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer"
                title={showRecoveryKey ? "Ocultar llave" : "Mostrar llave"}
              >
                {showRecoveryKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button
                type="button"
                onClick={handleRegenerateRecoveryKey}
                disabled={isRegeneratingKey}
                className="p-1.5 rounded-lg hover:bg-zinc-150 text-zinc-500 hover:text-zinc-800 transition-colors disabled:opacity-40 cursor-pointer"
                title="Regenerar llave"
              >
                <RotateCcw size={16} className={isRegeneratingKey ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
          
          <div className="p-4 bg-zinc-50/50 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h4 className="text-[13px] font-bold text-zinc-900">Accesos Biométricos (Face ID / Touch ID)</h4>
                <p className="text-[11px] text-zinc-500 mt-0.5">Dispositivos registrados que pueden acceder como Administrador sin PIN.</p>
              </div>
              <button
                type="button"
                onClick={handleRegisterBiometrics}
                className="px-3 py-2 bg-zinc-900 text-white rounded-xl text-[11px] font-bold shadow hover:bg-zinc-800 transition-all cursor-pointer text-center shrink-0"
              >
                Registrar Dispositivo
              </button>
            </div>
            
            {passkeys.length === 0 ? (
              <p className="text-[11px] text-zinc-400 italic text-center py-2">No hay dispositivos biométricos registrados.</p>
            ) : (
              <div className="space-y-2">
                {passkeys.map(pk => (
                  <div key={pk.id} className="flex items-center justify-between p-3 bg-white border border-zinc-200/60 rounded-xl">
                    <div className="flex flex-col">
                      <span className="text-[12px] font-semibold text-zinc-800">{pk.device_name}</span>
                      <span className="text-[9px] text-zinc-400 mt-0.5">Registrado el {new Date(pk.created_at).toLocaleDateString('es-MX')}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeletePasskey(pk.id)}
                      className="p-1.5 text-zinc-400 hover:text-red-650 transition-colors cursor-pointer"
                      title="Eliminar dispositivo"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* 2.5. MENSAJERÍA WHATSAPP */}
      <CollapsibleSection
        id="whatsapp"
        icon={<Sparkles size={15} strokeWidth={2.5} className="text-[#25D366]" />}
        title="Mensajería WhatsApp"
        isOpen={expandedSections.whatsapp}
        onToggle={() => toggleSection('whatsapp')}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div className="flex flex-col flex-1 pr-4">
              <span className="text-[14px] font-bold text-zinc-800">Pausar Envíos Automáticos</span>
              <span className="text-[11px] text-zinc-400 mt-1 font-sans leading-normal">
                Si activas esta opción, el sistema dejará de enviar de forma automatizada los mensajes de reserva, confirmación de pago, check-in, check-out, etc.
              </span>
            </div>
            <div className="flex items-center shrink-0">
              <button
                type="button"
                onClick={() => handleToggleAutoWA(!disableAutoWA)}
                disabled={savingAutoWA}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer focus:outline-none ${
                  disableAutoWA ? 'bg-rose-500' : 'bg-zinc-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    disableAutoWA ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 3. CONFIGURACIÓN CONTABLE */}
      <CollapsibleSection
        id="contable"
        icon={<Database size={15} strokeWidth={2.5} />}
        title="Configuración Contable"
        isOpen={expandedSections.contable}
        onToggle={() => toggleSection('contable')}
      >
        <div className="divide-y divide-zinc-100">
          <Row label="Acomodar Cuentas" onPress={() => setShowAccountOrderModal(true)} />
        </div>
      </CollapsibleSection>

      {/* 3.5. TARIFAS */}
      <CollapsibleSection
        id="tarifas"
        icon={<TrendingUp size={15} strokeWidth={2.5} />}
        title="Tarifas"
        isOpen={expandedSections.tarifas}
        onToggle={() => toggleSection('tarifas')}
      >
        <div className="divide-y divide-zinc-100">
          <Row label="Sincronizador Beds24" onPress={() => router.push('/precios')} />
        </div>
      </CollapsibleSection>

      {/* 4. CATÁLOGO DE EMPLEADOS */}
      <CollapsibleSection
        id="empleados"
        icon={<Users size={15} strokeWidth={2.5} />}
        title="Catálogo de Empleados"
        isOpen={expandedSections.empleados}
        onToggle={() => toggleSection('empleados')}
        headerAddon={
          <button 
            onClick={() => openEditEmployee()} 
            className="text-[10px] font-black bg-zinc-900 text-white px-2.5 py-1.5 rounded-lg active:scale-95 transition-all shadow flex items-center gap-1 cursor-pointer select-none shrink-0"
          >
            <Plus size={12} strokeWidth={3} /> Nuevo Empleado
          </button>
        }
      >
        <div className="divide-y divide-zinc-100 -mx-4 -my-4 overflow-hidden">
          {isLoadingEmployees ? (
            <div className="p-6 text-center text-zinc-400 text-xs font-medium flex items-center justify-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-zinc-200 border-t-zinc-650 rounded-full animate-spin" />
              Cargando plantilla de personal...
            </div>
          ) : employees.length === 0 ? (
            <div className="p-6 text-center text-zinc-400 text-xs font-medium">
              No hay empleados registrados. Crea uno nuevo.
            </div>
          ) : (
            employees.map((emp, index) => {
              const deptLabel = {
                recepcion: 'Recepción',
                limpieza: 'Limpieza',
                mantenimiento: 'Mantenimiento'
              }[emp.department as 'recepcion' | 'limpieza' | 'mantenimiento'] || emp.department;
              const deptBg = {
                recepcion: 'bg-indigo-50 text-indigo-650 border-indigo-100/50',
                limpieza: 'bg-amber-50 text-amber-650 border-amber-100/50',
                mantenimiento: 'bg-rose-50 text-rose-650 border-rose-100/50'
              }[emp.department as 'recepcion' | 'limpieza' | 'mantenimiento'] || 'bg-gray-50 text-gray-650';

              return (
                <div key={`${emp.employee_num}-${emp.full_name}-${emp.department}`} className="flex items-center justify-between p-4 hover:bg-zinc-50/40 transition-colors">
                  <div className="min-w-0">
                    <h4 className="text-[14px] font-bold text-zinc-900 leading-tight">{emp.full_name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-bold text-indigo-650 bg-indigo-50/50 px-1.5 py-0.5 rounded border border-indigo-100/50 font-mono">
                        PIN: {emp.employee_num}
                      </span>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${deptBg}`}>
                        {deptLabel}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button 
                      onClick={() => handleMoveEmployee(index, 'up')}
                      disabled={index === 0}
                      className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      title="Mover arriba"
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button 
                      onClick={() => handleMoveEmployee(index, 'down')}
                      disabled={index === employees.length - 1}
                      className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      title="Mover abajo"
                    >
                      <ChevronDown size={13} />
                    </button>

                    <div className="w-px h-5 bg-zinc-100 mx-1"></div>

                    <button 
                      onClick={() => openEditEmployee(emp)} 
                      className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors"
                      title="Editar Empleado"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      onClick={() => handleDeleteEmployee(emp)} 
                      className="p-2 rounded-lg hover:bg-rose-50 text-zinc-450 hover:text-rose-600 transition-colors"
                      title="Dar de Baja"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CollapsibleSection>

      {/* 5. DEPURACIÓN Y LIMPIEZA DE DATOS */}
      <CollapsibleSection
        id="depuracion"
        icon={<Sparkles size={15} className="text-zinc-700" />}
        title="Depuración de datos"
        isOpen={expandedSections.depuracion}
        onToggle={() => toggleSection('depuracion')}
      >
        <div className="space-y-4">
          <p className="text-[12px] text-zinc-450 font-semibold leading-normal">
            Administra y depura registros históricos del sistema de forma masiva para mantener un rendimiento óptimo.
          </p>

          {/* Selector de Tabs de Depuración */}
          <div className="flex bg-zinc-100 p-1 rounded-xl gap-1 select-none">
            <button 
              onClick={() => { setDepurarTab('logs'); setDepurarSelectedIds(new Set()); }}
              className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${depurarTab === 'logs' ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/20' : 'text-zinc-500 hover:text-zinc-800'}`}
            >
              <History size={12} />
              <span>Auditoría ({depurarLogs.length})</span>
            </button>
            <button 
              onClick={() => { setDepurarTab('tasks'); setDepurarSelectedIds(new Set()); }}
              className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${depurarTab === 'tasks' ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/20' : 'text-zinc-500 hover:text-zinc-800'}`}
            >
              <Wrench size={12} />
              <span>MTTO Resuelto ({depurarTasks.length})</span>
            </button>
          </div>

          {/* Acciones y Selección por lote */}
          <div className="bg-[#fafafa] border border-zinc-200/60 p-3 rounded-2xl space-y-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-black text-zinc-450 uppercase tracking-widest mr-1">Selección rápida:</span>
              <button 
                onClick={() => handleDepurarQuickSelect(30)}
                className="px-2.5 py-1.5 bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100 rounded-xl text-[10px] font-bold transition-all cursor-pointer"
              >
                &gt; 30 días
              </button>
              <button 
                onClick={() => handleDepurarQuickSelect(90)}
                className="px-2.5 py-1.5 bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100 rounded-xl text-[10px] font-bold transition-all cursor-pointer"
              >
                &gt; 90 días
              </button>
              <button 
                onClick={handleDepurarSelectAll}
                className="px-2.5 py-1.5 bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100 rounded-xl text-[10px] font-bold transition-all cursor-pointer"
              >
                Todos
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-zinc-200/50">
              <span className="text-[12px] font-bold text-zinc-700">
                Seleccionados: <span className="text-zinc-950 font-black">{depurarSelectedIds.size}</span>
              </span>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <button
                  onClick={handleDepurarExportJSON}
                  disabled={depurarSelectedIds.size === 0}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-3 py-2 bg-white border border-zinc-200 hover:border-zinc-350 text-zinc-700 disabled:opacity-50 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer"
                >
                  <Download size={13} />
                  <span>Descargar JSON</span>
                </button>
                <button
                  onClick={handleDepurarExportCSV}
                  disabled={depurarSelectedIds.size === 0}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-3 py-2 bg-white border border-zinc-200 hover:border-zinc-350 text-zinc-700 disabled:opacity-50 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer"
                >
                  <Download size={13} />
                  <span>Descargar CSV</span>
                </button>
                <button
                  onClick={() => setShowPurgeConfirmModal(true)}
                  disabled={depurarSelectedIds.size === 0}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-45 rounded-xl text-[11px] font-black tracking-wide shadow-sm active:scale-[0.97] transition-all cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>Purgar</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tabla de registros (Scrollable horizontal) */}
          <div className="border border-zinc-200 rounded-2xl overflow-hidden flex flex-col bg-white">
            {isLoadingDepurar ? (
              <div className="p-10 flex justify-center items-center gap-2 text-zinc-400 text-xs font-semibold">
                <div className="w-4 h-4 border-2 border-zinc-200 border-t-zinc-650 rounded-full animate-spin" />
                <span>Cargando historial...</span>
              </div>
            ) : activeDepurarData.length === 0 ? (
              <div className="p-10 text-center text-zinc-400 text-[12px] font-semibold">
                No hay registros resueltos/antiguos en esta sección.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[300px] scrollbar-thin">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold text-zinc-400 uppercase tracking-wider select-none">
                      <th className="p-3 w-10 text-center">
                        <input 
                          type="checkbox"
                          checked={depurarSelectedIds.size === activeDepurarData.length}
                          onChange={handleToggleDepurarAll}
                          className="w-3.5 h-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                        />
                      </th>
                      <th className="p-3">Fecha</th>
                      {depurarTab === 'logs' ? (
                        <>
                          <th className="p-3">Empleado</th>
                          <th className="p-3">Módulo</th>
                          <th className="p-3">Acción</th>
                          <th className="p-3">Detalles</th>
                        </>
                      ) : (
                        <>
                          <th className="p-3">Ubicación</th>
                          <th className="p-3">Reportado Por</th>
                          <th className="p-3">Descripción</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {activeDepurarData.map((item) => {
                      const isChecked = depurarSelectedIds.has(String(item.id));
                      const itemDateStr = format(new Date(item.created_at || item.resolved_at), 'dd/MM/yyyy HH:mm', { locale: es });
                      
                      return (
                        <tr 
                          key={item.id}
                          onClick={() => handleToggleDepurarRow(String(item.id))}
                          className={`hover:bg-zinc-50/50 transition-colors cursor-pointer text-[11.5px] ${isChecked ? 'bg-zinc-50' : ''}`}
                        >
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleDepurarRow(String(item.id))}
                              className="w-3.5 h-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                            />
                          </td>
                          <td className="p-3 font-semibold text-zinc-700 whitespace-nowrap">{itemDateStr}</td>
                          
                          {depurarTab === 'logs' ? (
                            <>
                              <td className="p-3 font-bold text-zinc-900 truncate max-w-[100px]">{item.employee_name || 'Sistema'}</td>
                              <td className="p-3 text-[10px] font-black uppercase text-zinc-500">
                                <span className="bg-zinc-150 px-1 py-0.5 border border-zinc-200 rounded">
                                  {item.module}
                                </span>
                              </td>
                              <td className="p-3 text-zinc-800 whitespace-nowrap">{item.action?.replace(/_/g, ' ')}</td>
                              <td className="p-3 text-zinc-500 truncate max-w-[160px] font-medium">{item.details}</td>
                            </>
                          ) : (
                            <>
                              <td className="p-3 font-extrabold text-zinc-650">{item.room || 'General'}</td>
                              <td className="p-3 font-bold text-zinc-950">{item.reported_by}</td>
                              <td className="p-3 text-zinc-500 truncate max-w-[200px] font-medium">{item.description}</td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>

      <div className="mt-8 mb-4">
        <button 
          onClick={handleLogout}
          className="w-full py-3.5 rounded-2xl border border-rose-200/80 bg-white text-rose-600 font-semibold text-[15px] text-center hover:bg-rose-50 transition-colors active:scale-[0.99] flex items-center justify-center gap-2"
        >
          <LogOut size={16}/>
          Cerrar Sesión
        </button>
      </div>

      <p className="text-center text-[11px] text-zinc-300 font-medium pb-4">
        Jaroje OS v1.2.0 · Ajustes Inteligentes ✓
      </p>

      {/* Modal cambio PIN */}
      {pinModal && (
        <>
          <div className="fixed inset-0 bg-zinc-900/40 z-[90] backdrop-blur-sm" onClick={() => setPinModal(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-[100] bg-white rounded-t-3xl shadow-2xl p-5 pb-16 pb-safe space-y-4 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key size={16} className="text-zinc-650"/>
                <h3 className="font-bold text-zinc-900 text-base">
                  PIN {pinModal === 'admin' ? 'Administrador' : pinModal === 'recepcion' ? 'Recepción' : pinModal === 'staff_limpieza' ? 'Limpieza' : 'Mantenimiento'}
                </h3>
              </div>
              <button onClick={() => setPinModal(null)} className="p-2 rounded-xl hover:bg-zinc-100 transition-colors">
                <X size={18} className="text-zinc-500"/>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">PIN Actual</label>
                <input
                  type={showPins ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={8}
                  value={currentPin}
                  onChange={e => setCurrentPin(e.target.value.replace(/\D/g,''))}
                  placeholder="Introduce el PIN actual"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-mono text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-800 placeholder:text-zinc-300"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">Nuevo PIN</label>
                <div className="relative">
                  <input
                    type={showPins ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={8}
                    value={newPin}
                    onChange={e => setNewPin(e.target.value.replace(/\D/g,''))}
                    placeholder="Mínimo 4 dígitos"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-mono text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-800 placeholder:text-zinc-300 pr-12"
                  />
                  <button onClick={() => setShowPins(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-650">
                    {showPins ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">Confirmar Nuevo PIN</label>
                <input
                  type={showPins ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={8}
                  value={confirmPin}
                  onChange={e => setConfirmPin(e.target.value.replace(/\D/g,''))}
                  placeholder="Repite el nuevo PIN"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-mono text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-800 placeholder:text-zinc-300"
                />
              </div>
              {pinError   && <p className="text-red-500 text-xs font-medium">{pinError}</p>}
              {pinSuccess && <p className="text-emerald-600 text-xs font-semibold">{pinSuccess}</p>}
            </div>

            <button
              onClick={savePinChange}
              className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white font-semibold py-3.5 rounded-xl hover:bg-zinc-800 transition-colors"
            >
              <Check size={16}/>
              Guardar Nuevo PIN
            </button>
          </div>
        </>
      )}

      {/* Modal CRUD Empleado */}
      {showEmployeeModal && (
        <>
          <div className="fixed inset-0 bg-zinc-900/40 z-[90] backdrop-blur-sm" onClick={() => setShowEmployeeModal(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[100] bg-white rounded-t-3xl shadow-2xl p-5 pb-16 pb-safe space-y-4 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-zinc-650"/>
                <h3 className="font-bold text-zinc-900 text-base">
                  {editingEmployee ? 'Editar Ficha de Empleado' : 'Registrar Nuevo Empleado'}
                </h3>
              </div>
              <button onClick={() => setShowEmployeeModal(false)} className="p-2 rounded-xl hover:bg-zinc-100 transition-colors">
                <X size={18} className="text-zinc-500"/>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-zinc-405 uppercase tracking-wide mb-1.5 block">Nombre Completo</label>
                <input
                  type="text"
                  value={formEmployeeName}
                  onChange={e => setFormEmployeeName(e.target.value)}
                  placeholder="Ej. Sofía Alarcón"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 placeholder:text-zinc-300 font-sans"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-405 uppercase tracking-wide mb-1.5 block">PIN (3 Dígitos)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={3}
                    value={formEmployeeNum}
                    onChange={e => setFormEmployeeNum(e.target.value.replace(/\D/g,''))}
                    placeholder="Ej. 101"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 placeholder:text-zinc-300 font-mono"
                    disabled={!!editingEmployee} // No permitir cambiar código para evitar colisiones
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-zinc-405 uppercase tracking-wide mb-1.5 block">Departamento</label>
                  <select
                    value={formEmployeeDept}
                    onChange={e => setFormEmployeeDept(e.target.value as 'recepcion' | 'limpieza' | 'mantenimiento')}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  >
                    <option value="recepcion">Recepción</option>
                    <option value="limpieza">Limpieza</option>
                    <option value="mantenimiento">Mantenimiento</option>
                  </select>
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveEmployee}
              disabled={isSavingEmployee}
              className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white font-bold py-3.5 rounded-xl hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer text-sm"
            >
              {isSavingEmployee ? 'Guardando...' : (
                <>
                  <Check size={16}/>
                  <span>Guardar Empleado</span>
                </>
              )}
            </button>
          </div>
        </>
      )}

      {/* Modal Acomodar Cuentas (Estilo Inventario) */}
      {showAccountOrderModal && (
        <>
          <div className="fixed inset-0 bg-zinc-900/40 z-[90] backdrop-blur-sm" onClick={() => setShowAccountOrderModal(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[100] bg-white rounded-t-3xl shadow-2xl p-5 pb-16 pb-safe space-y-4 animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-2 shrink-0">
              <div>
                <h3 className="font-bold text-zinc-900 text-base">Acomodar Cuentas</h3>
                <p className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mt-0.5">Organiza, Renombra o Elimina</p>
              </div>
              <button 
                onClick={() => setShowAccountOrderModal(false)}
                className="p-2 rounded-xl hover:bg-zinc-100 transition-colors"
              >
                <X size={18} className="text-zinc-500"/>
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
                className="w-full py-3 bg-zinc-900 text-white font-bold rounded-xl transition-all duration-300 text-[13px] active:scale-[0.96] cursor-pointer text-center"
              >
                Listo
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal Premium para Crear Cuentas */}
      {showAddAccountModal && (
        <>
          <div className="fixed inset-0 bg-zinc-900/40 z-[110] backdrop-blur-sm" onClick={() => setShowAddAccountModal(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[120] bg-white rounded-t-3xl shadow-2xl p-5 pb-16 pb-safe space-y-4 animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center mb-2 shrink-0">
              <div className="flex items-center gap-2">
                <Plus size={16} className="text-zinc-650" />
                <h3 className="font-bold text-zinc-900 text-base">Nueva Cuenta</h3>
              </div>
              <button 
                onClick={() => setShowAddAccountModal(false)}
                className="p-2 rounded-xl hover:bg-zinc-100 transition-colors"
              >
                <X size={18} className="text-zinc-500" />
              </button>
            </div>

            <form onSubmit={handleAddAccount} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">Nombre de la Cuenta</label>
                <input 
                  type="text" required
                  placeholder="Ej. Caja Recepción, Dólares..."
                  value={accName}
                  onChange={e => setAccName(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 placeholder:text-zinc-300 font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">Grupo Contable</label>
                <select 
                  value={accGroupType}
                  onChange={e => setAccGroupType(e.target.value as 'EFECTIVO' | 'BANCOS' | 'AHORROS' | 'EXTRANJERO' | 'CUENTAS X COBRAR' | 'CUENTAS X PAGAR' | 'COMISIONES')}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900"
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
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">Saldo Inicial</label>
                  <input 
                    type="number" step="0.01"
                    placeholder="0.00"
                    value={accBalance}
                    onChange={e => setAccBalance(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 placeholder:text-zinc-300 font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">Moneda (Divisa)</label>
                  <select 
                    value={accCurrency}
                    onChange={e => setAccCurrency(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900"
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
                  className="flex-1 py-3.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition-all duration-300 text-[13px] active:scale-[0.96] cursor-pointer text-center"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isSavingAcc}
                  className="flex-1 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl transition-all duration-300 text-[13px] active:scale-[0.96] disabled:opacity-45 shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isSavingAcc ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Plus size={14} />
                      <span>Crear Cuenta</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Modal de Advertencia Seguro (Doble Confirmación) de Purga */}
      {showPurgeConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 border border-rose-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                <AlertTriangle className="text-rose-600 animate-bounce" size={24} />
                Confirmación de Purga Permanente
              </h3>
              <button onClick={() => setShowPurgeConfirmModal(false)} className="w-8 h-8 flex items-center justify-center bg-zinc-100 rounded-full text-zinc-500 hover:bg-zinc-200 transition-colors">
                <X size={16} strokeWidth={3} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-rose-50 border border-rose-150 p-4.5 rounded-2xl">
                <p className="text-[13px] font-semibold text-rose-800 leading-relaxed">
                  ⚠️ <strong>¡CUIDADO!</strong> Estás a punto de eliminar de forma permanente <span className="font-black text-rose-900 underline">{depurarSelectedIds.size} registros</span> de la sección <strong>{depurarTab === 'logs' ? 'Historial de Auditoría' : 'Mantenimiento Resuelto'}</strong> de la base de datos de Supabase.
                </p>
                <p className="text-[11.5px] text-rose-700 mt-2 font-medium">
                  Esta acción es física, inmediata e irreversible. Los datos no podrán recuperarse.
                </p>
              </div>

              {/* Checkbox de Confirmación */}
              <label className="flex items-start gap-3 p-3.5 border border-zinc-200 hover:border-zinc-300 rounded-2xl cursor-pointer select-none transition-colors">
                <input 
                  type="checkbox"
                  checked={purgeBackedUpConfirmed}
                  onChange={(e) => setPurgeBackedUpConfirmed(e.target.checked)}
                  className="w-5 h-5 rounded border-zinc-300 text-rose-650 focus:ring-rose-600 mt-0.5 shrink-0"
                />
                <div className="text-[12px] font-bold text-zinc-800 leading-tight">
                  <span>Confirmo que he descargado una copia de seguridad en JSON o CSV y la he guardado en mi equipo local para futuras referencias.</span>
                </div>
              </label>

              {/* Botones de acción final */}
              <div className="flex gap-2.5 pt-2">
                <button
                  onClick={() => setShowPurgeConfirmModal(false)}
                  disabled={isPurging}
                  className="flex-1 py-3.5 bg-zinc-100 border border-zinc-200 text-zinc-700 font-bold rounded-2xl hover:bg-zinc-200 transition-all text-center text-[13px] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handlePurgeSubmit}
                  disabled={!purgeBackedUpConfirmed || isPurging}
                  className="flex-1 py-3.5 bg-rose-600 disabled:opacity-40 hover:bg-rose-700 text-white font-extrabold rounded-2xl transition-all text-center text-[13px] flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  {isPurging ? 'Borrando...' : `Purgar permanentemente ✓`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-4 right-4 z-[9999] animate-in fade-in slide-in-from-bottom-5">
          <div className="bg-zinc-900 text-white text-[13.5px] font-bold px-5 py-4 rounded-2xl text-center shadow-2xl flex items-center justify-center gap-2.5 max-w-md mx-auto border border-zinc-800">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

    </div>
  );
}
