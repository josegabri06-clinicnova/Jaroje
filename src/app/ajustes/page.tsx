"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Hotel, Shield, ChevronRight, 
  Star, Key, X, Check, Eye, EyeOff, LogOut
} from 'lucide-react';
import { getAdminPin, getStaffLimpiezaPin, getStaffMantenimientoPin, saveAdminPin, saveStaffLimpiezaPin, saveStaffMantenimientoPin, logout } from '@/lib/auth';

type PinTarget = 'admin' | 'staff_limpieza' | 'staff_mantenimiento' | null;

export default function AjustesPage() {
  const router = useRouter();



  const [pinModal, setPinModal]     = useState<PinTarget>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin]         = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPins, setShowPins]     = useState(false);
  const [pinError, setPinError]     = useState('');
  const [pinSuccess, setPinSuccess] = useState('');



  const openPinModal = (target: PinTarget) => {
    setPinModal(target);
    setCurrentPin(''); setNewPin(''); setConfirmPin('');
    setPinError(''); setPinSuccess('');
  };

  const savePinChange = () => {
    const currentCorrect = pinModal === 'admin' ? getAdminPin() : pinModal === 'staff_limpieza' ? getStaffLimpiezaPin() : getStaffMantenimientoPin();
    if (currentPin !== currentCorrect) { setPinError('El PIN actual no es correcto.'); return; }
    if (newPin.length < 4)             { setPinError('El PIN nuevo debe tener al menos 4 dígitos.'); return; }
    if (!/^\d+$/.test(newPin))         { setPinError('El PIN solo puede contener números.'); return; }
    if (newPin !== confirmPin)         { setPinError('Los PINs nuevos no coinciden.'); return; }
    
    if (pinModal === 'admin') saveAdminPin(newPin);
    else if (pinModal === 'staff_limpieza') saveStaffLimpiezaPin(newPin);
    else saveStaffMantenimientoPin(newPin);
    setPinSuccess('✅ PIN actualizado correctamente.');
    setPinError('');
    setTimeout(() => { setPinModal(null); setPinSuccess(''); }, 1500);
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
        <p className="text-[13px] font-medium text-zinc-500 mt-1">Jaroje Hotel · Versión 1.1.0</p>
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
        <Row label="Cambiar PIN Limpieza" value="••••" onPress={() => openPinModal('staff_limpieza')} />
        <Row label="Cambiar PIN Mantenimiento" value="••••" onPress={() => openPinModal('staff_mantenimiento')} />
      </Card>

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
        Jaroje OS v1.1.0 · Sistema de Roles Activado ✓
      </p>

      {/* Modal cambio PIN */}
      {pinModal && (
        <>
          <div className="fixed inset-0 bg-zinc-900/30 z-40 backdrop-blur-sm" onClick={() => setPinModal(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl p-5 pb-10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key size={16} className="text-zinc-600"/>
                <h3 className="font-bold text-zinc-900 text-base">
                  PIN {pinModal === 'admin' ? 'Administrador' : pinModal === 'staff_limpieza' ? 'Limpieza' : 'Mantenimiento'}
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
                  <button onClick={() => setShowPins(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
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
    </div>
  );
}
