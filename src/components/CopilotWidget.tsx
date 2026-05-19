
"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "ai/react";
import { Bot, X, Send, Sparkles, Loader2, User } from "lucide-react";

export default function CopilotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    setRole(localStorage.getItem('jaroje_role'));
  }, []);

  // Watch for panel-open class on body (set by calendar sheet and other modals)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setPanelOpen(document.body.classList.contains('panel-open'));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: "/api/copilot",
    body: { role: role || 'recepcion' }
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
              <p className="text-[11px] text-zinc-400 font-medium">Asistente Operativo</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/50">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mb-3">
                <Sparkles size={24} className="text-zinc-400" />
              </div>
              <h4 className="text-[15px] font-bold text-zinc-900 mb-1">¿En qué te ayudo hoy?</h4>
              <p className="text-[12px] text-zinc-500 leading-relaxed max-w-[250px]">
                Pregúntame sobre nóminas, gastos en sobres, o llegadas de huéspedes. Leo la base de datos en tiempo real.
              </p>
            </div>
          ) : (
            messages.map((m) => (
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
            ))
          )}
          {isLoading && (
            <div className="flex gap-3 max-w-[85%] mr-auto">
              <div className="w-7 h-7 rounded-full bg-zinc-900 text-white flex items-center justify-center shrink-0 mt-1">
                <Bot size={12} />
              </div>
              <div className="px-4 py-3 bg-white border border-zinc-200 rounded-2xl rounded-tl-sm shadow-sm flex items-center">
                <Loader2 size={16} className="text-zinc-400 animate-spin" />
              </div>
            </div>
          )}
          
          {error && (
            <div className="mx-auto mb-4 bg-red-100 text-red-700 text-[12px] p-3 rounded-xl border border-red-200">
              <span className="font-bold">Error del servidor:</span> {error.message}
              <br/><br/>
              Si el error menciona "OPENAI_API_KEY", necesitas agregar tu clave de OpenAI en Vercel (y en .env.local).
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
              placeholder="Pregunta algo sobre el hotel..."
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
