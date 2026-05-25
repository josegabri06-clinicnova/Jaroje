"use client";

import { useState, useEffect, useRef } from 'react';
import { MessageCircle, CheckCheck, Bot, Clock, RefreshCw, Trash2, Phone, Wifi, WifiOff, User, Send, ChevronLeft, ToggleLeft, ToggleRight, Plus, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type Message = {
  role_guest:   string | null;
  role_bot:     string | null;
  role_manager: string | null;
  timestamp:    string;
};

type Conversation = {
  id:              string;
  guest_name:      string;
  guest_phone:     string;
  timestamp:       string;
  booking_created: boolean;
  resolved:        boolean;
  human_mode:      boolean;
  messages:        Message[];
};

// ── Helper: icono y color para cada tipo de mensaje ──────────────────────────
function BubbleWA({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="#25D366" width={size} height={size}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.374 0 0 5.373 0 12c0 2.12.554 4.11 1.523 5.84L.073 23.927l6.244-1.48A11.946 11.946 0 0012 24c6.627 0 12-5.373 12-12S18.628 0 12 0zm0 21.882c-1.848 0-3.576-.5-5.065-1.37l-.363-.216-3.769.893.94-3.67-.237-.376A9.844 9.844 0 012.118 12C2.118 6.533 6.533 2.118 12 2.118s9.882 4.415 9.882 9.882S17.467 21.882 12 21.882z"/>
    </svg>
  );
}

export default function BotPage() {
  const [conversations, setConversations]   = useState<Conversation[]>([]);
  const [isLoading, setIsLoading]           = useState(true);
  const [hasRealData, setHasRealData]       = useState(false);
  // Solo guardamos el ID — la conversación activa se DERIVA del estado principal
  // Así cuando el polling actualiza conversations, el chat se actualiza solo
  const [activeConvId, setActiveConvId]     = useState<string | null>(null);
  const activeConv = conversations.find(c => c.id === activeConvId) ?? null;
  const [replyText, setReplyText]           = useState('');
  const [sending, setSending]               = useState(false);
  const [sendError, setSendError]           = useState<string | null>(null);
  
  // Estados para iniciar nuevo chat con plantilla Meta
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatName, setNewChatName]           = useState('');
  const [newChatPhone, setNewChatPhone]         = useState('');
  const [isStartingChat, setIsStartingChat]     = useState(false);
  const [newChatError, setNewChatError]         = useState<string | null>(null);

  const messagesEndRef                      = useRef<HTMLDivElement>(null);

  const startNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatPhone.trim() || !newChatName.trim()) return;
    setIsStartingChat(true);
    setNewChatError(null);
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start_new_chat',
          guestName: newChatName.trim(),
          guestPhone: newChatPhone.trim()
        })
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.error?.message || json.error?.message || 'Error al iniciar chat');
      }
      setNewChatName('');
      setNewChatPhone('');
      setShowNewChatModal(false);
      await fetchConversations();
      if (json.conversationId) {
        setActiveConvId(json.conversationId);
      }
    } catch (err: any) {
      setNewChatError(err.message);
    } finally {
      setIsStartingChat(false);
    }
  };
  // Offset del teclado virtual (visualViewport API — funciona en iOS Safari y Android)
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const fetchConversations = async () => {
    setIsLoading(true);
    try {
      const res  = await fetch('/api/conversations');
      const json = await res.json();
      if (json.success && json.data) {
        setConversations(json.data);
        setHasRealData(json.data.length > 0);
      }
    } catch (e) {
      console.error('Error al cargar conversaciones', e);
    } finally {
      setIsLoading(false);
    }
  };

  const clearAll = async () => {
    if (!confirm('¿Borrar todas las conversaciones?')) return;
    await fetch('/api/conversations', { method: 'DELETE' });
    setActiveConvId(null);
    fetchConversations();
  };

  const deleteConversation = async (convId: string, guestName: string) => {
    if (!confirm(`¿Seguro que deseas eliminar la conversación con ${guestName}?`)) return;
    try {
      const res = await fetch(`/api/conversations?id=${convId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        if (activeConvId === convId) {
          setActiveConvId(null);
        }
        fetchConversations();
      } else {
        alert("Error al eliminar: " + (json.error || "Error desconocido"));
      }
    } catch (e) {
      console.error("Error deleting conversation", e);
      alert("Error de conexión al intentar eliminar.");
    }
  };

  const toggleHumanMode = async (conv: Conversation) => {
    const newMode = !conv.human_mode;
    await fetch('/api/conversations', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'toggle_mode', conversationId: conv.id, human_mode: newMode }),
    });
    fetchConversations();
  };

  const sendReply = async () => {
    if (!replyText.trim() || !activeConv) return;
    setSending(true);
    setSendError(null);
    try {
      const res  = await fetch('/api/conversations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          action:         'send_manual_reply',
          conversationId: activeConv.id,
          message:        replyText.trim(),
          guestPhone:     activeConv.guest_phone,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.error?.message || 'Error al enviar');
      setReplyText('');
      await fetchConversations();
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err: any) {
      setSendError(err.message);
    } finally {
      setSending(false);
    }
  };


  // visualViewport: detecta el teclado en iOS Safari y Android
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport!;
    const update = () => {
      // Espacio que el teclado ocupa = altura total - altura visible del viewport
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardOffset(Math.max(0, offset));
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const chatId = params.get('chatId');
      if (chatId) {
        setActiveConvId(chatId);
      }
    }
  }, []);

  useEffect(() => {
    fetchConversations();
    // 4 segundos: suficientemente rápido para parecer tiempo real
    const interval = setInterval(fetchConversations, 4000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [activeConv?.messages?.length]);

  const todayStr    = new Date().toISOString().split('T')[0];
  const todayConvs  = conversations.filter(c => c.timestamp.startsWith(todayStr)).length;
  const resolved    = conversations.filter(c => c.resolved).length;
  const withBooking = conversations.filter(c => c.booking_created).length;

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toDateString() === new Date().toDateString()
        ? format(d, 'HH:mm', { locale: es })
        : format(d, 'd MMM', { locale: es });
    } catch { return ts; }
  };

  // ── VISTA DE CHAT INDIVIDUAL ─────────────────────────────────────────────────
  if (activeConv) {
    return (
      // position:fixed + inset:0 + z-[100] cubre el BottomNav (z-50) completamente
      // keyboardOffset empuja el contenido hacia arriba cuando sale el teclado
      <div
        className="fixed inset-0 flex flex-col bg-[#fafafa] z-[100]"
        style={{ paddingBottom: keyboardOffset }}
      >
        
        {/* Header del Chat */}
        <div className="bg-white border-b border-zinc-100 px-4 py-3.5 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
          <button
            onClick={() => { setActiveConvId(null); setSendError(null); setReplyText(''); }}
            className="w-8 h-8 flex items-center justify-center hover:bg-zinc-100 rounded-full transition-colors"
          >
            <ChevronLeft size={20} strokeWidth={2.5} className="text-zinc-600" />
          </button>
          <div className="w-9 h-9 rounded-full bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-center shrink-0">
            <BubbleWA size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-zinc-900 truncate leading-tight">{activeConv.guest_name}</p>
            <p className="text-[11px] font-medium text-zinc-400">{activeConv.guest_phone}</p>
          </div>

          {/* Toggle Bot / Gerente */}
          <button
            onClick={() => toggleHumanMode(activeConv)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
              activeConv.human_mode
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}
          >
            {activeConv.human_mode
              ? <><ToggleRight size={13} /> Tú</>
              : <><ToggleLeft  size={13} /> Bot</>
            }
          </button>

          <button
            onClick={() => deleteConversation(activeConv.id, activeConv.guest_name)}
            className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
            title="Eliminar conversación"
          >
            <Trash2 size={16} strokeWidth={2.5} />
          </button>

          <a
            href={`https://wa.me/${activeConv.guest_phone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 flex items-center justify-center text-[#25D366] hover:bg-[#25D366]/10 rounded-full transition-colors"
          >
            <Phone size={16} strokeWidth={2.5} />
          </a>
        </div>

        {/* Aviso de modo Bot Activo */}
        {!activeConv.human_mode && (
          <div className="mx-4 mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
            <Bot size={13} className="text-emerald-600 shrink-0" />
            <p className="text-[11px] font-semibold text-emerald-700">El Bot de IA está gestionando esta conversación. Pulsa el botón <strong>"Tú"</strong> para tomar el control.</p>
          </div>
        )}
        {activeConv.human_mode && (
          <div className="mx-4 mt-3 flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            <User size={13} className="text-amber-600 shrink-0" />
            <p className="text-[11px] font-semibold text-amber-700">Modo <strong>Gerente Activo</strong>. El bot está pausado. Puedes responder directamente.</p>
          </div>
        )}

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {activeConv.messages.map((msg, idx) => (
            <div key={idx}>
              {/* Mensaje del Huésped */}
              {msg.role_guest && (
                <div className="flex justify-end items-end gap-2 mb-1">
                  <div className="max-w-[78%] bg-zinc-900 text-white px-4 py-2.5 rounded-2xl rounded-br-sm shadow-sm">
                    <p className="text-[13px] font-medium leading-snug">{msg.role_guest}</p>
                    <p className="text-[10px] mt-1.5 text-zinc-400 text-right flex items-center justify-end gap-1">
                      <Clock size={9} />{format(new Date(msg.timestamp), 'HH:mm')}
                    </p>
                  </div>
                </div>
              )}
              {/* Respuesta del Bot */}
              {msg.role_bot && (
                <div className="flex justify-start items-end gap-2 mb-1">
                  <div className="w-7 h-7 rounded-full bg-[#25D366]/15 border border-[#25D366]/25 flex items-center justify-center shrink-0 mb-1">
                    <Bot size={12} className="text-[#25D366]" />
                  </div>
                  <div className="max-w-[78%] bg-white border border-zinc-200 text-zinc-800 px-4 py-2.5 rounded-2xl rounded-bl-sm shadow-sm">
                    <p className="text-[13px] font-medium leading-snug">{msg.role_bot}</p>
                    <p className="text-[10px] mt-1.5 text-zinc-400 flex items-center gap-1">
                      <Clock size={9} />{format(new Date(msg.timestamp), 'HH:mm')}
                      <CheckCheck size={10} className="text-emerald-400 ml-1" />
                    </p>
                  </div>
                </div>
              )}
              {/* Respuesta Manual del Gerente */}
              {msg.role_manager && (
                <div className="flex justify-start items-end gap-2 mb-1">
                  <div className="w-7 h-7 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 mb-1">
                    <User size={12} className="text-amber-600" />
                  </div>
                  <div className="max-w-[78%] bg-amber-50 border border-amber-200 text-zinc-800 px-4 py-2.5 rounded-2xl rounded-bl-sm shadow-sm">
                    <p className="text-[10px] font-bold text-amber-600 mb-1 uppercase tracking-wider">Gerente</p>
                    <p className="text-[13px] font-medium leading-snug">{msg.role_manager}</p>
                    <p className="text-[10px] mt-1.5 text-zinc-400 flex items-center gap-1">
                      <Clock size={9} />{format(new Date(msg.timestamp), 'HH:mm')}
                      <CheckCheck size={10} className="text-amber-400 ml-1" />
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Error de envío */}
        {sendError && (
          <div className="mx-4 mb-2 text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 font-medium">
            ⚠️ {sendError}
          </div>
        )}

        {/* Input de respuesta */}
        <div className="bg-white border-t border-zinc-100 px-4 py-3 flex items-center gap-2">
          <input
            type="text"
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendReply()}
            placeholder={activeConv.human_mode ? "Escribe tu respuesta..." : "Activa el modo Gerente para responder"}
            disabled={!activeConv.human_mode || sending}
            className="flex-1 bg-zinc-100 border border-zinc-200 rounded-2xl px-4 py-2.5 text-[16px] font-medium placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          />
          <button
            onClick={sendReply}
            disabled={!replyText.trim() || !activeConv.human_mode || sending}
            className="w-10 h-10 flex items-center justify-center bg-zinc-900 hover:bg-black text-white rounded-full shrink-0 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
          >
            {sending
              ? <RefreshCw size={15} className="animate-spin" />
              : <Send size={15} />
            }
          </button>
        </div>
      </div>
    );
  }

  // ── LISTA DE CONVERSACIONES ───────────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-24 bg-[#fafafa]">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight">Conversaciones</h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            {hasRealData
              ? <><Wifi size={11} className="text-emerald-500" /><p className="text-[13px] font-medium text-emerald-600">En vivo</p></>
              : <><WifiOff size={11} className="text-zinc-400" /><p className="text-[13px] font-medium text-zinc-500">Esperando mensajes...</p></>
            }
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewChatModal(true)}
            className="h-9 px-3.5 flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-black text-white text-[12px] font-bold rounded-xl shadow-sm active:scale-95 transition-all"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>Nuevo Chat</span>
          </button>
          {conversations.length > 0 && (
            <button onClick={clearAll} className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-red-500 bg-white border border-zinc-200 rounded-xl shadow-sm transition-all active:scale-95">
              <Trash2 size={15} />
            </button>
          )}
          <button
            onClick={fetchConversations}
            disabled={isLoading}
            className={`w-9 h-9 flex items-center justify-center text-zinc-500 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl shadow-sm transition-all ${isLoading ? 'opacity-50' : 'active:scale-95'}`}
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Hoy',      value: isLoading ? '…' : String(todayConvs) },
          { label: 'Resueltas', value: isLoading ? '…' : `${resolved}/${conversations.length}` },
          { label: 'Reservas', value: isLoading ? '…' : String(withBooking) },
        ].map(s => (
          <div key={s.label} className="bg-white border border-zinc-200/80 rounded-xl p-3 text-center shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
            <p className="text-lg font-bold text-zinc-900 leading-none">{s.value}</p>
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mt-1.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Estado vacío */}
      {!isLoading && conversations.length === 0 && (
        <div className="bg-white border border-zinc-200/60 rounded-2xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-zinc-900 rounded-xl flex items-center justify-center shrink-0">
              <MessageCircle size={16} className="text-white" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-zinc-900">Bandeja vacía</p>
              <p className="text-[12px] text-zinc-500 mt-0.5 leading-relaxed">
                Las conversaciones de WhatsApp aparecerán aquí en tiempo real cuando alguien escriba al número del hotel.
              </p>
            </div>
          </div>
          <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-4 space-y-2">
            <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Endpoint de n8n</p>
            <code className="block text-[11px] text-zinc-700 font-mono bg-white border border-zinc-200 rounded-lg px-3 py-2 break-all">
              POST https://jaroje-app.vercel.app/api/conversations
            </code>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-zinc-200/80 rounded-2xl p-4 animate-pulse h-20" />
          ))}
        </div>
      )}

      {/* Lista de conversaciones */}
      {!isLoading && conversations.length > 0 && (
        <div className="space-y-2">
          {conversations.map(conv => {
            const lastMsg = conv.messages[conv.messages.length - 1];
            const preview = lastMsg?.role_guest || lastMsg?.role_bot || lastMsg?.role_manager || '—';
            return (
              <div
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                className="bg-white border border-zinc-200/80 rounded-2xl px-4 py-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] cursor-pointer hover:border-zinc-300 active:scale-[0.99] transition-all flex items-center gap-3"
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-center">
                    <BubbleWA size={20} />
                  </div>
                  {conv.human_mode && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-400 border-2 border-white flex items-center justify-center">
                      <User size={8} className="text-white" />
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-[14px] font-semibold text-zinc-900 truncate leading-tight">{conv.guest_name}</p>
                    <span className="text-[11px] font-medium text-zinc-400 shrink-0 ml-2">{formatTime(conv.timestamp)}</span>
                  </div>
                  <p className="text-[12px] font-medium text-zinc-400 truncate">{preview}</p>
                </div>

                {/* Badges & Delete */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="flex flex-col items-end gap-1.5">
                    {conv.booking_created && (
                      <span className="text-[9px] font-bold bg-zinc-900 text-white px-1.5 py-0.5 rounded tracking-wider">RESERVA</span>
                    )}
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      conv.resolved ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                    }`}>
                      {conv.resolved ? '✓ OK' : 'Activa'}
                    </span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id, conv.guest_name);
                    }}
                    className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl border border-transparent hover:border-red-100 transition-all active:scale-95"
                    title="Eliminar chat"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Nuevo Chat con Plantilla */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black text-zinc-900">Iniciar Nuevo Chat</h3>
              <button 
                onClick={() => { setShowNewChatModal(false); setNewChatError(null); }}
                className="w-8 h-8 flex items-center justify-center bg-zinc-100 rounded-full text-zinc-500 hover:bg-zinc-200 transition-colors"
              >
                <X size={16} strokeWidth={3} />
              </button>
            </div>

            <form onSubmit={startNewChat} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Nombre del Huésped</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Juan Pérez"
                  value={newChatName}
                  onChange={e => setNewChatName(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[14px] font-medium focus:ring-2 focus:ring-zinc-900/10 placeholder-zinc-400 transition-all text-zinc-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Número de WhatsApp (con lada)</label>
                <input
                  type="tel"
                  required
                  placeholder="Ej. +52181828384"
                  value={newChatPhone}
                  onChange={e => setNewChatPhone(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[14px] font-medium focus:ring-2 focus:ring-zinc-900/10 placeholder-zinc-400 transition-all text-zinc-900 font-mono"
                />
              </div>

              {/* Vista previa de la Plantilla de Meta */}
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 space-y-2">
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block">Vista Previa (Plantilla Oficial Meta)</span>
                <p className="text-[12px] text-zinc-650 leading-relaxed font-medium">
                  Hola <strong className="text-emerald-700 font-black">{newChatName || '{{cliente}}'}</strong>, gracias por elegir <strong className="font-bold">Jaroje Condominios</strong>. Es un placer para nosotros que se haya alojado en nuestros condominios, para cualquier consulta o duda no dude en escribirnos por este chat y será atendido lo antes posible. Esperamos que la estancia sea de su agrado. Un saludo.
                </p>
                <span className="text-[9px] text-zinc-400 block italic">Se enviará la plantilla aprobada "presentacion_cliente_jaroje".</span>
              </div>

              {newChatError && (
                <div className="text-[11px] text-red-650 bg-red-50 border border-red-100 rounded-xl p-3 font-semibold">
                  ⚠️ {newChatError}
                </div>
              )}

              <button
                type="submit"
                disabled={isStartingChat || !newChatName || !newChatPhone}
                className="w-full py-4 bg-zinc-900 hover:bg-black text-white font-bold text-[14px] rounded-xl transition-all active:scale-[0.98] disabled:opacity-40 shadow-lg flex items-center justify-center gap-1.5"
              >
                {isStartingChat ? 'Enviando plantilla...' : 'Enviar Plantilla e Iniciar Chat'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
