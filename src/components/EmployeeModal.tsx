'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Employee, OFFICIAL_EMPLOYEES, validateEmployeeNum, setActiveEmployee, getActiveEmployee } from '@/lib/auth';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  module: 'recepcion' | 'limpieza' | 'mantenimiento';
  onSuccess?: (employee: Employee) => void;
  title?: string;
  description?: string;
}

export default function EmployeeModal({
  isOpen,
  onClose,
  module,
  onSuccess,
  title,
  description
}: EmployeeModalProps) {
  const router = useRouter();
  const [pin, setPin] = useState<string>('');
  const [isWiggling, setIsWiggling] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successEmployee, setSuccessEmployee] = useState<Employee | null>(null);
  const [hasActiveSession, setHasActiveSession] = useState<boolean>(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Redirigir al inicio o cerrar el modal localmente, o cerrar sesión del rol para cambiar a admin
  const handleClose = () => {
    if (hasActiveSession) {
      onClose();
    } else {
      if (userRole === 'admin') {
        router.push('/');
      } else {
        localStorage.removeItem('jaroje_role'); // logout del rol PWA actual
        router.push('/login');
      }
    }
  };

  // Filtrar los empleados oficiales permitidos en este departamento para mostrar como sugerencia sutil
  const departmentEmployees = OFFICIAL_EMPLOYEES.filter(emp => emp.department === module);

  // Módulo en lenguaje natural elegante
  const moduleLabel = {
    recepcion: 'Recepción',
    limpieza: 'Limpieza (Camaristas)',
    mantenimiento: 'Mantenimiento Técnico'
  }[module];

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUserRole(localStorage.getItem('jaroje_role'));
    }
    if (isOpen) {
      setPin('');
      setErrorMessage('');
      setIsWiggling(false);
      setSuccessEmployee(null);
      
      // Comprobar si ya existe una sesión activa para este módulo
      const currentActive = getActiveEmployee(module);
      setHasActiveSession(!!currentActive);
    }
  }, [isOpen, module]);

  const handleKeyPress = (num: string) => {
    if (successEmployee || isWiggling) return;
    if (pin.length < 3) {
      setErrorMessage('');
      const newPin = pin + num;
      setPin(newPin);

      // Si completó los 3 dígitos, validar inmediatamente
      if (newPin.length === 3) {
        handleValidate(newPin);
      }
    }
  };

  const handleBackspace = () => {
    if (successEmployee || isWiggling) return;
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
      setErrorMessage('');
    }
  };

  const handleClear = () => {
    if (successEmployee || isWiggling) return;
    setPin('');
    setErrorMessage('');
  };

  const handleValidate = async (enteredPin: string) => {
    // Validar de forma local instantánea (Zero Latency UX)
    const employee = validateEmployeeNum(enteredPin, module);

    if (employee) {
      // Éxito: Establecer empleado activo en la sesión local
      setActiveEmployee(employee, module);
      setSuccessEmployee(employee);

      // Registrar en la base de datos de manera asíncrona (trazabilidad en backend)
      try {
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: employee.employee_num,
            employee_name: employee.full_name,
            department: employee.department,
            module: module,
            action: 'inicio_sesion_turno',
            details: `Inicio de turno/sesión para el módulo ${moduleLabel}`
          })
        });
      } catch (e) {
        console.error('Error registrando log de sesión:', e);
      }

      // Cerrar tras una breve pausa para la micro-animación de éxito
      setTimeout(() => {
        onSuccess?.(employee);
        onClose();
      }, 800);

    } else {
      // Error: Activar animación de sacudida (wiggle/shake)
      setIsWiggling(true);
      setErrorMessage('Código no registrado para este departamento');

      // Animación de sacudida y resetear display
      setTimeout(() => {
        setIsWiggling(false);
        setPin('');
      }, 500);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md transition-all duration-300">
      <style>{`
        .animate-wiggle {
          animation: shake 0.4s ease-in-out;
        }
        @keyframes success-pop {
          0% { transform: scale(0.8); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-success {
          animation: success-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
      `}</style>

      <div className="w-full max-w-md bg-white border border-gray-100 rounded-3xl shadow-2xl p-6 relative mx-4 overflow-hidden">
        {/* Botón de cerrar */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-full hover:bg-gray-50 flex items-center gap-1"
          title={hasActiveSession ? "Cerrar" : (userRole === 'admin' ? "Volver al Inicio" : "Salir / Cambiar Rol")}
        >
          {!hasActiveSession && (
            <span className="text-[11px] font-bold text-gray-400 mr-1">
              {userRole === 'admin' ? 'Volver al Inicio' : 'Salir / Cambiar Rol'}
            </span>
          )}
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Encabezado */}
        <div className="text-center mt-2 mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 009 11.5v-2m10.802 8.854a13.93 13.93 0 00-2.083-6.765M15 11.5v-2a3 3 0 116 0v1c0 .5-.2 1-.6 1.4l-1.6 1.6m-12.2.2a13.93 13.93 0 002.083 6.765M11 1.5v2m3.802 8.854a13.93 13.93 0 00-2.083-6.765M8 11.5v-2a3 3 0 116 0v1c0 .5-.2 1-.6 1.4L11.8 13" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {title || `Firma de ${moduleLabel}`}
          </h2>
          <p className="text-sm text-gray-500 mt-1 max-w-xs mx-auto">
            {description || `Introduce tus 3 dígitos de empleado para firmar y registrar este movimiento.`}
          </p>
        </div>

        {/* Display del PIN */}
        <div className="flex flex-col items-center justify-center mb-6">
          <div
            className={`flex items-center justify-center gap-4 px-6 py-4 bg-gray-50 border rounded-2xl w-full max-w-[280px] transition-all duration-200 h-[64px] ${
              isWiggling ? 'border-red-400 bg-red-50/50 text-red-500 animate-wiggle' : 
              successEmployee ? 'border-emerald-400 bg-emerald-50/50 text-emerald-600' : 
              'border-gray-200 text-gray-900'
            }`}
          >
            {successEmployee ? (
              <div className="flex items-center gap-2 animate-success text-emerald-600 font-semibold text-lg">
                <svg className="w-6 h-6 stroke-emerald-600" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span>¡Hola, {successEmployee.full_name.split(' ')[0]}!</span>
              </div>
            ) : (
              <div className="flex gap-4">
                {[0, 1, 2].map((idx) => {
                  const digit = pin[idx];
                  return (
                    <span
                      key={idx}
                      className={`w-4 h-4 rounded-full transition-all duration-150 ${
                        digit ? 'bg-indigo-600 scale-110 shadow-sm shadow-indigo-200' : 'bg-gray-300'
                      }`}
                    />
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Mensaje de Error */}
          <div className="h-6 mt-2">
            {errorMessage && (
              <p className="text-xs text-red-500 font-medium transition-all duration-150">
                ⚠️ {errorMessage}
              </p>
            )}
          </div>
        </div>

        {/* Teclado Numérico (Pinpad) */}
        <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto mb-6">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              onClick={() => handleKeyPress(num)}
              className="w-16 h-16 rounded-full border border-gray-100 bg-gray-50 flex items-center justify-center text-xl font-semibold text-gray-800 active:bg-indigo-600 active:text-white active:scale-95 hover:bg-gray-100 hover:border-gray-200 transition-all shadow-sm"
            >
              {num}
            </button>
          ))}
          <button
            onClick={handleClear}
            className="w-16 h-16 rounded-full flex items-center justify-center text-sm font-semibold text-gray-500 hover:bg-red-50 hover:text-red-600 active:scale-95 transition-all"
          >
            Limpiar
          </button>
          <button
            onClick={() => handleKeyPress('0')}
            className="w-16 h-16 rounded-full border border-gray-100 bg-gray-50 flex items-center justify-center text-xl font-semibold text-gray-800 active:bg-indigo-600 active:text-white active:scale-95 hover:bg-gray-100 hover:border-gray-200 transition-all shadow-sm"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            className="w-16 h-16 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 active:scale-95 transition-all"
            aria-label="Borrar"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
            </svg>
          </button>
        </div>

        {/* Guía Rápida Elegante de Códigos (Para que el personal recuerde sus códigos en la tablet) */}
        <div className="border-t border-gray-100 pt-4 mt-2">
          <p className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase text-center mb-2">
            Códigos de {moduleLabel}
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-left px-2 max-h-24 overflow-y-auto">
            {departmentEmployees.map((emp) => (
              <div key={`${emp.employee_num}-${emp.full_name}`} className="flex justify-between items-center text-[11px] text-gray-500 border-b border-gray-50 py-0.5">
                <span className="font-semibold text-gray-700">{emp.employee_num}</span>
                <span className="truncate max-w-[100px]">{emp.full_name.split(' ')[0]} {emp.full_name.split(' ')[1] || ''}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
