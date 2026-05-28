"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Hotel, Shield, ChevronRight, 
  Star, Key, X, Check, Eye, EyeOff, LogOut,
  Users, Plus, Trash2, Edit2
} from 'lucide-react';
import { 
  getAdminPin, getStaffLimpiezaPin, getStaffMantenimientoPin, getRecepcionPin, 
  saveAdminPin, saveStaffLimpiezaPin, saveStaffMantenimientoPin, saveRecepcionPin, 
  logout 
} from '@/lib/auth';

type PinTarget = 'admin' | 'staff_limpieza' | 'staff_mantenimiento' | 'recepcion' | null;

export default function AjustesPage() {
  const router = useRouter();

  // PIN states
  const [pinModal, setPinModal]     = useState<PinTarget>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin]         = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPins, setShowPins]     = useState(false);
  const [pinError, setPinError]     = useState('');
  const [pinSuccess, setPinSuccess] = useState('');

  // Employees CRUD states
  const [employees, setEmployees] = useState<any[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
  
  // Employees Form states
  const [formEmployeeNum, setFormEmployeeNum] = useState('');
  const [formEmployeeName, setFormEmployeeName] = useState('');
  const [formEmployeeDept, setFormEmployeeDept] = useState<'recepcion' | 'limpieza' | 'mantenimiento'>('recepcion');
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);

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

  useEffect(() => {
    fetchEmployees();
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
  const openEditEmployee = (emp?: any) => {
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

  const handleDeleteEmployee = async (emp: any) => {
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

  const handleLogout = () => { logout(); router.replace('/login'); };

  const SectionHeader = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
    <div className="flex items-center gap-2 mb-4 mt-6 first:mt-0">
      <div className="w-7 h-7 bg-zinc-100 rounded-lg flex items-center justify-center text-zinc-600 shrink-0">{icon}</div>
      <h2 className="text-[12px] font-bold text-zinc-500 uppercase tracking-widest">{title}</h2>
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

  const Card = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-white border border-zinc-200/80 rounded-2xl px-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)] divide-y divide-zinc-100">
      {children}
    </div>
  );

  return (
    <div className="space-y-1 pb-24 bg-[#fafafa]">
      
      <div className="mb-6">
        <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight leading-tight">Ajustes</h2>
        <p className="text-[13px] font-medium text-zinc-500 mt-1">Jaroje Hotel · Versión 1.2.0</p>
      </div>

      <SectionHeader icon={<Hotel size={15} strokeWidth={2.5} />} title="Perfil del Hotel" />
      <Card>
        <div className="py-4 flex items-center gap-4">
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
        <Row label="Nombre del hotel" value="Condominios Jaroje" />
        <Row label="Habitaciones" value="21 unidades" />
      </Card>

      {/* Seguridad con PINs reales */}
      <SectionHeader icon={<Shield size={15} strokeWidth={2.5} />} title="Seguridad y Acceso" />
      <Card>
        <Row label="Cambiar PIN Administrador" value="••••" onPress={() => openPinModal('admin')} />
        <Row label="Cambiar PIN Recepción" value="••••" onPress={() => openPinModal('recepcion')} />
        <Row label="Cambiar PIN Limpieza" value="••••" onPress={() => openPinModal('staff_limpieza')} />
        <Row label="Cambiar PIN Mantenimiento" value="••••" onPress={() => openPinModal('staff_mantenimiento')} />
      </Card>

      {/* Catálogo de Empleados (CRUD Manual) */}
      <div className="flex items-center justify-between mb-4 mt-6">
        <SectionHeader icon={<Users size={15} strokeWidth={2.5} />} title="Catálogo de Empleados" />
        <button 
          onClick={() => openEditEmployee()} 
          className="text-xs font-black bg-zinc-900 text-white px-3 py-1.5 rounded-lg active:scale-95 transition-all shadow flex items-center gap-1 cursor-pointer"
        >
          <Plus size={13} strokeWidth={3} /> Nuevo Empleado
        </button>
      </div>
      
      <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] divide-y divide-zinc-100 overflow-hidden mb-6">
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
          employees.map((emp) => {
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
                <div className="flex items-center gap-1 shrink-0">
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
        Jaroje OS v1.2.0 · Catálogo Manual de Personal ✓
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
                    onChange={e => setFormEmployeeDept(e.target.value as any)}
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

    </div>
  );
}
