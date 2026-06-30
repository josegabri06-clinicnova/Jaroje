"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "ai/react";
import { Bot, X, Send, Sparkles, Loader2, User, ShieldAlert, KeyRound, CheckCircle2, Lock, ArrowRight } from "lucide-react";
import { validatePinAsync } from "@/lib/auth";

import { usePathname } from "next/navigation";

export default function CopilotWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  if (pathname?.startsWith('/public')) return null;
  const [panelOpen, setPanelOpen] = useState(false);
  
  // PIN de sesión en memoria reactiva
  const [sessionPin, setSessionPin] = useState<string>('');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [validatingPin, setValidatingPin] = useState(false);
  const [bypassPin, setBypassPin] = useState(false);

  // Función para forzar la sincronización del rol y el PIN desde el almacenamiento del navegador
  const syncCredentials = () => {
    if (typeof window !== 'undefined') {
      const activeRole = localStorage.getItem('jaroje_role');
      const activePin = sessionStorage.getItem('jaroje_session_pin') || '';
      setRole(activeRole);
      setSessionPin(activePin);
      if (activePin) {
        setBypassPin(false);
      }
    }
  };

  useEffect(() => {
    syncCredentials();
  }, []);

  // Sincronizar credenciales cada vez que el widget se abra
  useEffect(() => {
    if (isOpen) {
      syncCredentials();
    }
  }, [isOpen]);

  // Watch for panel-open class on body (set by calendar sheet and other modals)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setPanelOpen(document.body.classList.contains('panel-open'));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Determinar rol efectivo enviado a la IA
  const effectiveRole = role === 'admin' && !sessionPin && bypassPin ? 'recepcion' : (role || 'recepcion');

  // useChat con inyección reactiva del PIN y Rol en el cuerpo del JSON POST
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: "/api/copilot",
    body: { 
      role: effectiveRole,
      pin: sessionPin
    }
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Listen for custom event to open (forces fresh credential sync)
  useEffect(() => {
    const handleOpen = () => {
      syncCredentials();
      setIsOpen(true);
    };
    const handleSync = () => {
      syncCredentials();
    };
    window.addEventListener('open-copilot', handleOpen);
    window.addEventListener('sync-copilot', handleSync);
    return () => {
      window.removeEventListener('open-copilot', handleOpen);
      window.removeEventListener('sync-copilot', handleSync);
    };
  }, []);

  // Auto-close when a panel opens
  useEffect(() => { if (panelOpen) setIsOpen(false); }, [panelOpen]);

  // Auto-activar cuando el PIN tenga 4 dígitos
  useEffect(() => {
    if (pinInput.length === 4) {
      handleActivateAdmin();
    }
  }, [pinInput]);

  // Lógica para validar y sincronizar PIN de Admin en vivo
  const handleActivateAdmin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pinInput.length !== 4 || validatingPin) return;
    
    setValidatingPin(true);
    setPinError(false);
    
    try {
      const isValid = await validatePinAsync(pinInput, 'admin');
      if (isValid) {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('jaroje_session_pin', pinInput);
        }
        setSessionPin(pinInput);
        setBypassPin(false);
        setPinInput('');
      } else {
        setPinError(true);
        setPinInput('');
      }
    } catch (err) {
      setPinError(true);
      setPinInput('');
    } finally {
      setValidatingPin(false);
    }
  };

  // Mensajes contextuales por rol para evitar falsas expectativas
  const isUserAdmin = role === 'admin';
  const showAdminWelcome = isUserAdmin && (sessionPin || !bypassPin);
  
  const welcomeTitle = showAdminWelcome && sessionPin
    ? "¿Qué analizamos hoy?"
    : "¿En qué te ayudo en Recepción?";

  const welcomeText = showAdminWelcome && sessionPin
    ? "Pregúntame sobre nóminas, transacciones de sobres, saldos de cuentas o el estado de reservas en tiempo real."
    : "Pregúntame sobre huéspedes hospedados, check-ins y check-outs de hoy. Leo Beds24 en vivo.";

  const welcomePlaceholder = showAdminWelcome && sessionPin
    ? "Pregunta sobre el hotel o balances de caja..."
    : "Pregunta sobre reservas o huéspedes...";

  const handleBypass = () => {
    setBypassPin(true);
  };

  const pinpadDigits = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  if (role === 'staff_limpieza' || role === 'staff_mantenimiento') return null;

  return (
    <>
      {/* Chat Window */}
      <div
        className={`fixed bottom-6 right-6 w-[380px] max-w-[calc(100vw-48px)] h-[600px] max-h-[calc(100vh-48px)] bg-white rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] border border-zinc-200/80 flex flex-col overflow-hidden transition-all duration-300 origin-bottom-right z-50 ${
          isOpen
            ? "scale-100 opacity-100 pointer-events-auto"
            : "scale-90 opacity-0 pointer-events-none"
        }`}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-zinc-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
              <Bot size={18} />
            </div>
            <div>
              <h3 className="text-[15px] font-bold leading-tight">Jaroje AI Copilot</h3>
              <p className="text-[11px] text-zinc-400 font-medium">
                {effectiveRole === 'admin' ? "Asistente Financiero & Operativo" : "Asistente de Recepción"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Viewport: Bloqueo Financiero para Admin sin PIN y sin bypass */}
        {isUserAdmin && !sessionPin && !bypassPin ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 bg-zinc-950 text-white text-center relative overflow-hidden select-none">
            {/* Ambient Background Glow */}
            <div className="absolute top-[-50px] w-64 h-64 bg-zinc-900 rounded-full blur-[100px] opacity-60 pointer-events-none" />

            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-3 border border-white/10 relative z-10">
              <Lock size={20} className="text-white animate-pulse" />
            </div>
            <h4 className="text-[15px] font-bold text-white mb-1.5 relative z-10">Copiloto Financiero Cerrado</h4>
            <p className="text-[11px] text-zinc-400 leading-relaxed max-w-[280px] mb-5 relative z-10">
              Esta sección contiene saldos, Libro de Caja y nóminas del personal. Digita tu PIN de administrador para desbloquear.
            </p>

            {/* PIN indicators */}
            <div className="flex gap-4 mb-6 relative z-10">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${
                    i < pinInput.length
                      ? pinError
                        ? "bg-red-500 border-red-500"
                        : "bg-white border-white scale-110"
                      : "border-zinc-700 bg-transparent"
                  }`}
                />
              ))}
            </div>

            {/* Tactile Pinpad Grid */}
            <div className="grid grid-cols-3 gap-2 w-full max-w-[260px] mb-4 relative z-10">
              {pinpadDigits.map((d, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (d === '⌫') setPinInput(p => p.slice(0, -1));
                    else if (d !== '') {
                      if (pinInput.length < 4) setPinInput(p => p + d);
                    }
                  }}
                  disabled={validatingPin}
                  className={`h-11 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center ${
                    d === ''
                      ? 'pointer-events-none opacity-0'
                      : d === '⌫'
                      ? 'bg-transparent text-zinc-500 hover:text-zinc-300'
                      : 'bg-white/5 border border-white/10 text-white hover:bg-white/10 shadow-sm'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            {pinError && (
              <p className="text-[10px] text-red-400 font-semibold mb-3 flex items-center gap-1">
                <ShieldAlert size={12} /> PIN incorrecto. Inténtalo de nuevo.
              </p>
            )}

            {/* Bypass Button */}
            <button
              onClick={handleBypass}
              className="text-[11px] font-bold text-zinc-400 hover:text-white transition-colors flex items-center gap-1 py-2 relative z-10"
            >
              Continuar como Recepción <ArrowRight size={12} />
            </button>
          </div>
        ) : (
          <>
            {/* Messages / View Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/50 flex flex-col">
              {messages.length === 0 ? (
                <div className="my-auto flex flex-col items-center justify-center text-center px-4">
                  <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mb-3">
                    <Sparkles size={24} className="text-zinc-500 animate-pulse" />
                  </div>
                  <h4 className="text-[15px] font-bold text-zinc-900 mb-1">{welcomeTitle}</h4>
                  <p className="text-[12px] text-zinc-500 leading-relaxed max-w-[280px] mb-5">
                    {welcomeText}
                  </p>

                  {/* Badge de estado financiero desbloqueado */}
                  {isUserAdmin && sessionPin && (
                    <div className="w-full bg-emerald-50/50 border border-emerald-200/80 rounded-2xl p-3 flex items-center justify-center gap-2.5 max-w-[260px] mx-auto animate-fade-in">
                      <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                      <span className="text-[11px] text-emerald-800 font-bold leading-none">
                        Acceso Financiero Sincronizado
                      </span>
                    </div>
                  )}

                  {/* Badge de bypass de recepción */}
                  {isUserAdmin && !sessionPin && bypassPin && (
                    <div className="flex flex-col items-center gap-2 max-w-[260px] mx-auto">
                      <div className="bg-zinc-100 border border-zinc-200 rounded-2xl p-2.5 flex items-center gap-2">
                        <ShieldAlert size={14} className="text-zinc-500 shrink-0" />
                        <span className="text-[11px] text-zinc-600 font-bold leading-none">
                          Modo Consulta de Recepción
                        </span>
                      </div>
                      <button 
                        onClick={() => setBypassPin(false)}
                        className="text-[10px] text-blue-600 font-bold hover:underline"
                      >
                        Desbloquear con PIN Admin
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex gap-3 max-w-[85%] ${
                        m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1 ${
                          m.role === "user" ? "bg-blue-600 text-white" : "bg-zinc-900 text-white"
                        }`}
                      >
                        {m.role === "user" ? <User size={12} /> : <Bot size={12} />}
                      </div>
                      <div
                        className={`px-4 py-3 rounded-2xl shadow-sm text-[13px] leading-relaxed whitespace-pre-wrap ${
                          m.role === "user"
                            ? "bg-blue-600 text-white rounded-tr-sm"
                            : "bg-white border border-zinc-200 text-zinc-800 rounded-tl-sm"
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {isLoading && (
                <div className="flex gap-3 max-w-[85%] mr-auto mt-2">
                  <div className="w-7 h-7 rounded-full bg-zinc-900 text-white flex items-center justify-center shrink-0 mt-1">
                    <Bot size={12} />
                  </div>
                  <div className="px-4 py-3 bg-white border border-zinc-200 rounded-2xl rounded-tl-sm shadow-sm flex items-center">
                    <Loader2 size={16} className="text-zinc-400 animate-spin" />
                  </div>
                </div>
              )}
              
              {error && (
                <div className="mx-auto mb-4 bg-red-100 text-red-700 text-[12px] p-3 rounded-xl border border-red-200 max-w-[90%]">
                  <span className="font-bold">Error del servidor:</span> {error.message}
                  <br/><br/>
                  Si el error persiste, verifica la clave de OpenAI configurada.
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 bg-white border-t border-zinc-100 shrink-0">
              <form
                onSubmit={handleSubmit}
                className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-2xl px-2 py-2 focus-within:ring-2 focus-within:ring-zinc-900/10 focus-within:border-zinc-400 transition-all"
              >
                <input
                  type="text"
                  value={input}
                  onChange={handleInputChange}
                  placeholder={welcomePlaceholder}
                  className="flex-1 bg-transparent px-3 py-1.5 text-[13px] outline-none text-zinc-900 placeholder:text-zinc-400 font-semibold"
                />
                <button
                  type="submit"
                  disabled={isLoading || !(input || '').trim()}
                  className="w-9 h-9 bg-zinc-900 hover:bg-black text-white rounded-xl flex items-center justify-center shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </>
  );
}
