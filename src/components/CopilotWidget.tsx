"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "ai/react";
import { Bot, X, Send, Sparkles, Loader2, User, ShieldAlert, KeyRound, CheckCircle2 } from "lucide-react";
import { validatePinAsync } from "@/lib/auth";

export default function CopilotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  
  // PIN de sesión en memoria reactiva
  const [sessionPin, setSessionPin] = useState<string>('');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [validatingPin, setValidatingPin] = useState(false);

  useEffect(() => {
    const activeRole = localStorage.getItem('jaroje_role');
    setRole(activeRole);
    if (typeof window !== 'undefined') {
      setSessionPin(sessionStorage.getItem('jaroje_session_pin') || '');
    }
  }, []);

  // Watch for panel-open class on body (set by calendar sheet and other modals)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setPanelOpen(document.body.classList.contains('panel-open'));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // useChat con inyección reactiva del PIN y Rol en el cuerpo del JSON POST
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: "/api/copilot",
    body: { 
      role: role || 'recepcion',
      pin: sessionPin
    }
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Listen for custom event to open
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-copilot', handleOpen);
    return () => window.removeEventListener('open-copilot', handleOpen);
  }, []);

  // Auto-close when a panel opens
  useEffect(() => { if (panelOpen) setIsOpen(false); }, [panelOpen]);

  // Lógica para validar y sincronizar PIN de Admin en vivo
  const handleActivateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
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
  
  const welcomeTitle = isUserAdmin
    ? "¿Qué analizamos hoy?"
    : "¿En qué te ayudo en Recepción?";

  const welcomeText = isUserAdmin
    ? "Pregúntame sobre nóminas, transacciones de sobres, saldos de cuentas o el estado de reservas en tiempo real."
    : "Pregúntame sobre huéspedes hospedados, check-ins y check-outs de hoy. Leo Beds24 en vivo.";

  const welcomePlaceholder = isUserAdmin
    ? "Pregunta sobre el hotel o balances de caja..."
    : "Pregunta sobre reservas o huéspedes...";

  return (
    <>
      {/* Floating Button — hidden when any bottom sheet is open */}
      {!panelOpen && (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="fixed bottom-6 right-6 w-12 h-12 bg-zinc-900 hover:bg-black text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-40"
        >
          {isOpen ? <X size={20} /> : <Sparkles size={20} />}
        </button>
      )}

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
                {isUserAdmin ? "Asistente Financiero & Operativo" : "Asistente de Recepción"}
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

              {/* CARD DE ACTIVACIÓN FINANCIERA EN VIVO PARA ADMINS SIN PIN */}
              {isUserAdmin && !sessionPin && (
                <div className="w-full bg-white border border-zinc-200 shadow-sm rounded-2xl p-4 text-left">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0 mt-0.5 text-zinc-900">
                      <KeyRound size={18} />
                    </div>
                    <div>
                      <h5 className="text-[13px] font-bold text-zinc-900 leading-normal">
                        Desbloquear Datos Financieros
                      </h5>
                      <p className="text-[11px] text-zinc-500 leading-relaxed mt-0.5">
                        Ingresa tu PIN de 4 dígitos para sincronizar las nóminas, balances y Libro de Caja.
                      </p>
                    </div>
                  </div>
                  <form onSubmit={handleActivateAdmin} className="flex gap-2">
                    <input
                      type="password"
                      maxLength={4}
                      value={pinInput}
                      onChange={(e) => {
                        setPinInput(e.target.value.replace(/\D/g, ''));
                        setPinError(false);
                      }}
                      placeholder="PIN (4 dígitos)"
                      className={`flex-1 px-3 py-1.5 bg-zinc-50 border rounded-xl text-center font-bold text-sm tracking-widest outline-none transition-all ${
                        pinError ? "border-red-300 focus:border-red-400 bg-red-50/10 text-red-600" : "border-zinc-200 focus:border-zinc-400"
                      }`}
                    />
                    <button
                      type="submit"
                      disabled={pinInput.length !== 4 || validatingPin}
                      className="px-4 bg-zinc-900 hover:bg-black text-white text-[12px] font-bold rounded-xl flex items-center justify-center shrink-0 transition-colors disabled:opacity-50"
                    >
                      {validatingPin ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        "Activar"
                      )}
                    </button>
                  </form>
                  {pinError && (
                    <p className="text-[10px] text-red-500 font-semibold mt-1.5 flex items-center gap-1">
                      <ShieldAlert size={12} /> PIN incorrecto. Inténtalo de nuevo.
                    </p>
                  )}
                </div>
              )}

              {/* CARD DE ESTADO: FINANZAS ACTIVAS */}
              {isUserAdmin && sessionPin && (
                <div className="w-full bg-emerald-50/50 border border-emerald-200/80 rounded-2xl p-3 flex items-center gap-2.5 max-w-[280px]">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span className="text-[11px] text-emerald-800 font-bold leading-none">
                    Acceso Financiero Sincronizado
                  </span>
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
              className="flex-1 bg-transparent px-3 py-1.5 text-[14px] outline-none text-zinc-900 placeholder:text-zinc-400 font-medium"
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
      </div>
    </>
  );
}
