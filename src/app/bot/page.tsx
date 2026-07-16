"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, CheckCheck, Bot, Clock, RefreshCw, Trash2, Phone, Wifi, WifiOff, User, Send, ChevronLeft, ToggleLeft, ToggleRight, Plus, X, Archive, BedDouble, Calendar, ExternalLink, Wallet, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';

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
  archived?:       boolean;
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
  const router = useRouter();
  const [conversations, setConversations]   = useState<Conversation[]>([]);
  const [reservas, setReservas]             = useState<any[]>([]);
  const [showResDetailModal, setShowResDetailModal] = useState(false);
  const [showGuestPortalIframe, setShowGuestPortalIframe] = useState<string | null>(null);
  const [isLoading, setIsLoading]           = useState(true);
  const [hasRealData, setHasRealData]       = useState(false);
  // Solo guardamos el ID — la conversación activa se DERIVA del estado principal
  // Así cuando el polling actualiza conversations, el chat se actualiza solo
  const [activeConvId, setActiveConvId]     = useState<string | null>(null);
  const activeConv = conversations.find(c => c.id === activeConvId) ?? null;
  const [replyText, setReplyText]           = useState('');
  const [sending, setSending]               = useState(false);
  const [sendError, setSendError]           = useState<string | null>(null);
  const [activeTab, setActiveTab]           = useState<'active' | 'archived'>('active');
  
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
  // Altura del viewport adaptada al teclado en dispositivos móviles
  const [viewportHeight, setViewportHeight] = useState('100vh');
  const [isMobile, setIsMobile] = useState(false);

  const fetchConversations = async () => {
    setIsLoading(true);
    try {
      const [res, resReservas] = await Promise.all([
        fetch('/api/conversations'),
        fetch('/api/reservas').catch(() => null)
      ]);
      const json = await res.json();
      if (json.success && json.data) {
        setConversations(json.data);
        setHasRealData(json.data.length > 0);
      }
      if (resReservas) {
        const jsonRes = await resReservas.json();
        if (jsonRes.success) {
          setReservas(jsonRes.data || []);
        }
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

  const toggleArchive = async (conv: Conversation) => {
    const newArchived = !conv.archived;
    try {
      const res = await fetch('/api/conversations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'toggle_archive', conversationId: conv.id, archived: newArchived }),
      });
      const json = await res.json();
      if (json.success) {
        if (newArchived && activeConvId === conv.id) {
          setActiveConvId(null);
        }
        fetchConversations();
      } else {
        alert("Error al archivar: " + (json.error || "Error desconocido"));
      }
    } catch (e) {
      console.error("Error toggling archive", e);
      alert("Error de conexión al intentar archivar.");
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
    const textToSend = replyText.trim();
    if (!textToSend || !activeConv) return;
    setSending(true);
    setSendError(null);
    setReplyText('');

    // Crear mensaje optimista
    const optimisticMessage: Message = {
      role_guest: null,
      role_bot: null,
      role_manager: textToSend,
      timestamp: new Date().toISOString()
    };

    const previousConversations = [...conversations];

    // Actualizar estado local de inmediato
    setConversations(prev => {
      return prev.map(c => {
        if (c.id === activeConv.id) {
          return {
            ...c,
            messages: [...(c.messages || []), optimisticMessage],
            timestamp: optimisticMessage.timestamp
          };
        }
        return c;
      });
    });

    // Auto-scroll al fondo
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    try {
      const res  = await fetch('/api/conversations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          action:         'send_manual_reply',
          conversationId: activeConv.id,
          message:        textToSend,
          guestPhone:     activeConv.guest_phone,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.error?.message || 'Error al enviar');
    } catch (err: any) {
      setSendError(err.message);
      // Revertir estado si falla
      setConversations(previousConversations);
      setReplyText(textToSend);
    } finally {
      setSending(false);
    }
  };


  // visualViewport: adapta el tamaño del contenedor en dispositivos móviles cuando el teclado se abre
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateHeight = () => {
      const vv = window.visualViewport;
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (vv && mobile) {
        setViewportHeight(`${vv.height}px`);
        window.scrollTo(0, 0); // Prevenir el desplazamiento automático indeseado del layout
      } else {
        setViewportHeight('100vh');
      }
    };

    updateHeight();

    window.visualViewport?.addEventListener('resize', updateHeight);
    window.visualViewport?.addEventListener('scroll', updateHeight);
    window.addEventListener('resize', updateHeight);

    return () => {
      window.visualViewport?.removeEventListener('resize', updateHeight);
      window.visualViewport?.removeEventListener('scroll', updateHeight);
      window.removeEventListener('resize', updateHeight);
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

    // Suscribirse a cambios en tiempo real en Supabase (instantáneo)
    const channel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        (payload) => {
          console.log('[Realtime] Cambio detectado en conversaciones:', payload);
          if (payload.eventType === 'INSERT') {
            const newConv = payload.new as Conversation;
            setConversations(prev => {
              if (prev.some(c => c.id === newConv.id)) return prev;
              return [newConv, ...prev];
            });
            setHasRealData(true);
          } else if (payload.eventType === 'UPDATE') {
            const updatedConv = payload.new as Conversation;
            setConversations(prev => {
              const idx = prev.findIndex(c => c.id === updatedConv.id);
              if (idx === -1) return [updatedConv, ...prev];
              const next = [...prev];
              next[idx] = { ...next[idx], ...updatedConv };
              next.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
              return next;
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            setConversations(prev => prev.filter(c => c.id !== deletedId));
          }
        }
      )
      .subscribe();

    // Fallback lento en caso de desconexión del WebSocket
    const interval = setInterval(fetchConversations, 10000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
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

  // Limpiar y formatear número de habitación para mostrar en badges
  const getUnitDisplay = (roomStr: string) => {
    if (!roomStr) return '';
    const parenMatch = roomStr.match(/\(([^)]+)\)/);
    if (parenMatch) return parenMatch[1];
    const numMatch = roomStr.match(/(\d+)\s*$/);
    if (numMatch) return numMatch[1];
    return roomStr;
  };

  // Buscar todas las reservaciones activas o futuras correspondientes al número de teléfono o nombre del contacto
  const findAllReservationsForContact = (guestPhone: string | undefined, guestName: string | undefined) => {
    if (!guestPhone) return [];
    
    // Filtrar solo las reservaciones activas o futuras (check-out hoy o después)
    const activeFuture = reservas.filter(r => r.check_out >= todayStr);
    
    // Normalizar y comparar de forma flexible números de teléfono de cualquier país
    const clean = (p: string) => p.replace(/\D/g, '');
    const pClean = clean(guestPhone);
    
    const matched = activeFuture.filter(r => {
      const rPhone = clean(r.phone || r.mobile || r.guest_phone || '');
      if (pClean.length < 7 || rPhone.length < 7) return false;
      // Comparación flexible de los últimos dígitos según el tamaño del número más corto (máximo 10 dígitos)
      const minLen = Math.min(pClean.length, rPhone.length, 10);
      const lastP = pClean.slice(-minLen);
      const lastR = rPhone.slice(-minLen);
      return lastP === lastR;
    });


    // Ordenar de más reciente check-in a más lejano futuro
    return matched.sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime());
  };

  // Helper de DoubleCheck de WhatsApp
  function DoubleCheckSVG({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 16 15" width="16" height="15" className={className} fill="none">
        <path d="M15 3L8.5 9.5L6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11 3L5 9L2.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <div 
      className="flex w-full bg-[#f0f2f5] overflow-hidden"
      style={{ height: viewportHeight }}
    >
      {/* Columna Izquierda: Lista de Conversaciones */}
      <div className={`w-full md:w-[350px] lg:w-[400px] border-r border-zinc-200 bg-white flex flex-col h-full shrink-0 ${activeConvId ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex-1 flex flex-col h-full overflow-y-auto px-5 pt-5 pb-24 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight font-sans">Conversaciones</h2>
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
                <span>Nuevo</span>
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
          <div className="grid grid-cols-3 gap-2 shrink-0">
            {[
              { label: 'Hoy',      value: isLoading ? '…' : String(todayConvs) },
              { label: 'Resueltas', value: isLoading ? '…' : `${resolved}/${conversations.length}` },
              { label: 'Reservas', value: isLoading ? '…' : String(withBooking) },
            ].map(s => (
              <div key={s.label} className="bg-white border border-zinc-200/85 rounded-2xl p-2.5 text-center shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                <p className="text-md font-bold text-zinc-900 leading-none">{s.value}</p>
                <p className="text-[9px] font-semibold text-zinc-400 uppercase tracking-widest mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Selector de Pestañas: Activas / Archivadas */}
          <div className="flex bg-zinc-100 p-1 rounded-2xl border border-zinc-200/50 shadow-inner shrink-0">
            <button
              onClick={() => setActiveTab('active')}
              className={`flex-1 py-2 text-center text-[12px] font-black rounded-xl transition-all ${
                activeTab === 'active'
                  ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/30'
                  : 'text-zinc-450 hover:text-zinc-700'
              }`}
            >
              Activas ({conversations.filter(c => !c.archived).length})
            </button>
            <button
              onClick={() => setActiveTab('archived')}
              className={`flex-1 py-2 text-center text-[12px] font-black rounded-xl transition-all ${
                activeTab === 'archived'
                  ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/30'
                  : 'text-zinc-450 hover:text-zinc-700'
              }`}
            >
              Archivadas ({conversations.filter(c => c.archived).length})
            </button>
          </div>

          {/* Estado vacío */}
          {!isLoading && conversations.filter(conv => activeTab === 'archived' ? !!conv.archived : !conv.archived).length === 0 && (
            <div className="bg-white border border-zinc-200/60 rounded-2xl p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-zinc-900 rounded-xl flex items-center justify-center shrink-0">
                  {activeTab === 'archived' ? <Archive size={16} className="text-white" /> : <MessageCircle size={16} className="text-white" />}
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-zinc-900">
                    {activeTab === 'archived' ? 'No hay archivadas' : 'Bandeja vacía'}
                  </p>
                  <p className="text-[12px] text-zinc-500 mt-0.5 leading-relaxed font-medium">
                    {activeTab === 'archived'
                      ? 'Aquí aparecerán los chats que hayas decidido guardar y archivar para mantener tu bandeja limpia.'
                      : 'Las conversaciones aparecerán aquí en tiempo real en cuanto un huésped escriba.'}
                  </p>
                </div>
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
            <div className="space-y-2 flex-1">
              {conversations
                .filter(conv => activeTab === 'archived' ? !!conv.archived : !conv.archived)
                .map(conv => {
                  const lastMsg = conv.messages[conv.messages.length - 1];
                  const preview = lastMsg?.role_guest || lastMsg?.role_bot || lastMsg?.role_manager || '—';
                  const isActive = conv.id === activeConvId;
                  return (
                    <div
                      key={conv.id}
                      onClick={() => setActiveConvId(conv.id)}
                      className={`border rounded-2xl px-4 py-3 cursor-pointer hover:border-zinc-300 active:scale-[0.99] transition-all flex items-center gap-3 ${
                        isActive 
                          ? 'bg-[#25D366]/5 border-[#25D366]/25 shadow-xs' 
                          : 'bg-white border-zinc-200/80'
                      }`}
                    >
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-center">
                          <BubbleWA size={18} />
                        </div>
                        {conv.human_mode && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white flex items-center justify-center">
                            <User size={7} className="text-white" />
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      {(() => {
                        const convRes = findAllReservationsForContact(conv.guest_phone, conv.guest_name);
                        const primaryRes = convRes[0] || null;
                        const displayName = primaryRes ? primaryRes.guest_name : conv.guest_name;
                        const hasDifferentWaName = primaryRes && conv.guest_name && primaryRes.guest_name.toLowerCase() !== conv.guest_name.toLowerCase();

                        return (
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <p className="text-[13px] font-bold text-zinc-900 truncate leading-tight flex items-center gap-1.5">
                                <span className="truncate">{displayName}</span>
                                {hasDifferentWaName && (
                                  <span className="text-[10px] text-zinc-400 font-normal truncate max-w-[80px] shrink-0">
                                    ({conv.guest_name})
                                  </span>
                                )}
                              </p>
                              <span className="text-[10px] font-medium text-zinc-400 shrink-0 ml-2">{formatTime(conv.timestamp)}</span>
                            </div>
                            <p className="text-[12px] font-semibold text-zinc-400 truncate leading-normal">{preview}</p>
                          </div>
                        );
                      })()}

                      {/* Badges & Acciones */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex flex-col items-end gap-1">
                          {conv.booking_created && (
                            <span className="text-[8px] font-black bg-zinc-900 text-white px-1.5 py-0.5 rounded tracking-wider">RESERVA</span>
                          )}
                          <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            conv.resolved ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                          }`}>
                            {conv.resolved ? '✓ OK' : 'Activa'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Columna Derecha: Chat o Vista de Bienvenida */}
      <div className={`flex-1 flex flex-col h-full bg-[#efeae2] relative ${activeConvId ? 'flex' : 'hidden md:flex'}`}>
        {activeConv ? (
          <div 
            className={`${isMobile ? 'fixed top-0 left-0 right-0 z-40 pb-[calc(64px+env(safe-area-inset-bottom,0px))] focus-within:pb-0' : 'relative w-full h-full'} flex flex-col bg-[#efeae2]`}
            style={{ 
              height: isMobile ? viewportHeight : '100%',
              backgroundImage: 'radial-gradient(#dfdcd6 0.8px, transparent 0.8px), radial-gradient(#dfdcd6 0.8px, #efeae2 0.8px)',
              backgroundSize: '12px 12px',
              backgroundPosition: '0 0, 6px 6px'
            }}
          >
            {/* Header del Chat */}
            <div className="bg-white border-b border-zinc-150 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => { setActiveConvId(null); setSendError(null); setReplyText(''); }}
                  className="w-8 h-8 flex items-center justify-center hover:bg-zinc-100 rounded-full transition-colors md:hidden"
                >
                  <ChevronLeft size={20} strokeWidth={2.5} className="text-zinc-650" />
                </button>
                <div className="w-9 h-9 rounded-full bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-center shrink-0">
                  <BubbleWA size={18} />
                </div>
                {(() => {
                  const activeReservations = findAllReservationsForContact(activeConv.guest_phone, activeConv.guest_name);
                  const primaryRes = activeReservations[0] || null;
                  const displayName = primaryRes ? primaryRes.guest_name : activeConv.guest_name;
                  const hasDifferentWaName = primaryRes && activeConv.guest_name && primaryRes.guest_name.toLowerCase() !== activeConv.guest_name.toLowerCase();

                  return (
                    <div 
                      className="min-w-0 cursor-pointer hover:bg-zinc-50 rounded-xl px-2 py-1 transition-colors select-none"
                      onClick={() => {
                        if (activeReservations.length > 0) {
                          setShowResDetailModal(true);
                        }
                      }}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-[14px] font-bold text-zinc-900 truncate leading-tight">
                          {displayName}
                          {hasDifferentWaName && (
                            <span className="text-[10.5px] text-zinc-400 font-normal ml-1 shrink-0">
                              ({activeConv.guest_name})
                            </span>
                          )}
                        </p>
                        {primaryRes && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-150 shrink-0">
                            Hab {getUnitDisplay(primaryRes.room_name)}
                            {activeReservations.length > 1 ? ` (+${activeReservations.length - 1})` : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-semibold text-zinc-400 mt-0.5 flex items-center gap-1.5 truncate">
                        <span>{activeConv.guest_phone}</span>
                        {primaryRes && (
                          <>
                            <span>·</span>
                            <span className="text-zinc-500 font-bold">{primaryRes.channel}</span>
                            <span>·</span>
                            <span className="text-zinc-500 font-bold">Llega: {format(new Date(primaryRes.check_in + 'T12:00:00'), 'd MMM', { locale: es })}</span>
                          </>
                        )}
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Botones de acción */}
              <div className="flex items-center gap-2">
                {/* Toggle Bot/Tú */}
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

                {/* Archivar */}
                <button
                  onClick={() => toggleArchive(activeConv)}
                  className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                    activeConv.archived
                      ? 'text-indigo-650 bg-indigo-50 hover:bg-indigo-100'
                      : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'
                  }`}
                  title={activeConv.archived ? "Desarchivar" : "Archivar"}
                >
                  <Archive size={16} strokeWidth={2.5} />
                </button>

                {/* Eliminar */}
                <button
                  onClick={() => deleteConversation(activeConv.id, activeConv.guest_name)}
                  className="w-8 h-8 flex items-center justify-center text-zinc-450 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                  title="Eliminar chat"
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
            </div>

            {/* Aviso Bot Activo/Pausado */}
            <div className="shrink-0 px-4 pt-3">
              {!activeConv.human_mode ? (
                <div className="flex items-center gap-2 bg-emerald-50/90 backdrop-blur-sm border border-emerald-100/60 rounded-xl px-3 py-2 shadow-xs">
                  <Bot size={13} className="text-emerald-700 shrink-0" />
                  <p className="text-[11px] font-semibold text-emerald-800 leading-normal">El Bot de IA está gestionando esta conversación. Pulsa <strong>"Tú"</strong> para tomar el control.</p>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-amber-50/90 backdrop-blur-sm border border-amber-100/60 rounded-xl px-3 py-2 shadow-xs">
                  <User size={13} className="text-amber-700 shrink-0" />
                  <p className="text-[11px] font-semibold text-amber-800 leading-normal">Modo <strong>Gerente Activo</strong>. El bot está pausado. Puedes responder directamente.</p>
                </div>
              )}
            </div>

            {/* Área de Mensajes */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {activeConv.messages.map((msg, idx) => (
                <div key={idx}>
                  {/* Huésped (Recibido - Izquierda) */}
                  {msg.role_guest && (
                    <div className="flex justify-start items-end mb-1">
                      <div className="max-w-[75%] bg-white text-zinc-900 px-4 py-2.5 rounded-[16px] rounded-tl-none shadow-[0_1px_0.5px_rgba(0,0,0,0.12)] relative border border-zinc-200/20">
                        <p className="text-[13px] font-medium leading-snug whitespace-pre-wrap">{msg.role_guest}</p>
                        <div className="text-[9px] mt-1 text-zinc-400 flex items-center justify-end gap-1 select-none font-semibold">
                          {format(new Date(msg.timestamp), 'HH:mm')}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bot (Enviado - Derecha) */}
                  {msg.role_bot && (
                    <div className="flex justify-end items-end mb-1">
                      <div className="max-w-[75%] bg-[#d9fdd3] text-zinc-900 px-4 py-2.5 rounded-[16px] rounded-tr-none shadow-[0_1px_0.5px_rgba(0,0,0,0.12)] relative border border-[#c4ebd1]/40">
                        <div className="flex items-center gap-1 mb-1.5 select-none">
                          <span className="text-[9px] font-extrabold text-emerald-700 bg-emerald-100/60 px-1.5 py-0.5 rounded border border-emerald-250/20">🤖 Bot</span>
                        </div>
                        <p className="text-[13px] font-medium leading-snug whitespace-pre-wrap">{msg.role_bot}</p>
                        <div className="text-[9px] mt-1 text-zinc-500 flex items-center justify-end gap-0.5 select-none font-semibold">
                          {format(new Date(msg.timestamp), 'HH:mm')}
                          <DoubleCheckSVG className="text-[#53bdeb] ml-1 shrink-0" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Gerente (Enviado - Derecha) */}
                  {msg.role_manager && (
                    <div className="flex justify-end items-end mb-1">
                      <div className="max-w-[75%] bg-[#d9fdd3] text-zinc-900 px-4 py-2.5 rounded-[16px] rounded-tr-none shadow-[0_1px_0.5px_rgba(0,0,0,0.12)] relative border border-[#c4ebd1]/40">
                        <div className="flex items-center gap-1 mb-1.5 select-none">
                          <span className="text-[9px] font-extrabold text-indigo-700 bg-indigo-50/60 px-1.5 py-0.5 rounded border border-indigo-250/20">👤 Tú</span>
                        </div>
                        <p className="text-[13px] font-medium leading-snug whitespace-pre-wrap">{msg.role_manager}</p>
                        <div className="text-[9px] mt-1 text-zinc-500 flex items-center justify-end gap-0.5 select-none font-semibold">
                          {format(new Date(msg.timestamp), 'HH:mm')}
                          <DoubleCheckSVG className="text-[#53bdeb] ml-1 shrink-0" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="bg-[#f0f2f5] px-4 py-3 flex items-center gap-2 border-t border-zinc-150 shrink-0">
              <input
                type="text"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendReply()}
                placeholder={activeConv.human_mode ? "Escribe un mensaje..." : "Activa el modo Gerente para responder"}
                disabled={!activeConv.human_mode || sending}
                className="flex-1 bg-white border border-transparent rounded-2xl px-4 py-2.5 text-[15px] font-medium placeholder:text-zinc-400 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm text-zinc-900"
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
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#f8f9fa] border-l border-zinc-200/80">
            <div className="max-w-sm space-y-4">
              <div className="w-16 h-16 bg-[#25D366]/10 border border-[#25D366]/20 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <MessageCircle size={32} className="text-[#25D366]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-[16px] font-black text-zinc-950">Jaroje WhatsApp Inbox</h3>
                <p className="text-[12px] text-zinc-500 leading-relaxed font-medium">
                  Selecciona una conversación de la lista para empezar a chatear. Puedes alternar el control manual y automático de tu bot de IA en tiempo real.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

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
                  placeholder="Ej. +52 1 81 8283 8485"
                  value={newChatPhone}
                  onChange={e => setNewChatPhone(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 outline-none text-[14px] font-medium focus:ring-2 focus:ring-zinc-900/10 placeholder-zinc-400 transition-all text-zinc-900 font-mono"
                />
                <p className="text-[10px] text-zinc-400 mt-1.5 leading-relaxed">
                  💡 Puedes escribirlo con o sin el signo <strong>+</strong>, espacios o guiones. El sistema lo limpiará automáticamente.<br />
                  • Si tiene <strong>10 dígitos</strong> se le añadirá <strong>52</strong> (México).<br />
                  • Si tiene <strong>9 dígitos</strong> se le añadirá <strong>34</strong> (España).<br />
                  • Para otros países, escribe el prefijo manualmente (ej. <strong>1</strong> para EE.UU., <strong>54</strong> para Argentina, etc.).
                </p>
              </div>

              {/* Vista previa de la Plantilla de Meta */}
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 space-y-2">
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block">Vista Previa (Plantilla Oficial Meta)</span>
                <p className="text-[12px] text-zinc-650 leading-relaxed font-medium">
                  ¡Hola, <strong className="text-emerald-700 font-black">{newChatName || '{{cliente}}'}</strong>! 🌴<br /><br />
                  Te damos la más cálida bienvenida a <strong>Jaroje Condominios</strong>. Es un placer tenerte con nosotros y ser parte de tu estancia.<br /><br />
                  Aquí tienes información útil para iniciar tu estancia:<br />
                  • Wi-Fi: Red "Jaroje_Guest" (Sin contraseña).<br />
                  • Servicios: Piscina, terraza y estacionamiento incluidos.<br /><br />
                  Cualquier duda o solicitud especial, escríbenos directamente aquí. ¡Disfruta tu estancia!
                </p>
                <span className="text-[9px] text-zinc-400 block italic">Se enviará la plantilla multimedia "presentacion_cliente_jaroje_2" con foto y botones interactivos.</span>
              </div>

              {newChatError && (
                <div className="text-[11px] text-red-655 bg-red-50 border border-red-100 rounded-xl p-3 font-semibold">
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

      {/* Modal de Detalles de Reserva Superpuesta */}
      {showResDetailModal && activeConv && (() => {
        const activeReservations = findAllReservationsForContact(activeConv.guest_phone, activeConv.guest_name);
        if (activeReservations.length === 0) return null;
        const primaryRes = activeReservations[0] || null;

        return (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4" 
            onClick={() => setShowResDetailModal(false)}
          >
            <div 
              className="bg-white rounded-3xl w-full max-w-md p-6 relative shadow-2xl animate-in fade-in zoom-in-95 duration-200" 
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowResDetailModal(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center hover:bg-zinc-100 rounded-full text-zinc-400 transition-colors"
              >
                <X size={16} />
              </button>

              <div className="flex flex-col items-center text-center pb-4 border-b border-zinc-100">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-3">
                  <BedDouble size={24} />
                </div>
                <h4 className="text-[16px] font-black text-zinc-950 tracking-tight font-sans">Reservaciones del Cliente</h4>
                <p className="text-[12px] text-zinc-500 font-bold mt-0.5">
                  {primaryRes ? primaryRes.guest_name : activeConv.guest_name}
                  {primaryRes && activeConv.guest_name && primaryRes.guest_name.toLowerCase() !== activeConv.guest_name.toLowerCase() && (
                    <span className="text-[10px] text-zinc-400 font-normal ml-1">
                      ({activeConv.guest_name})
                    </span>
                  )}
                  {" · "}{activeReservations.length} {activeReservations.length === 1 ? 'reserva' : 'reservas'}
                </p>
              </div>

              <div className="py-4 max-h-[50vh] overflow-y-auto space-y-4 pr-1 scrollbar-thin">
                {activeReservations.map((res, index) => {
                  const nightsCount = res.nights || 1;
                  const totalRevenue = res.price || res.price_estimate || 0;
                  const deposit = res.deposit || 0;
                  const balance = Math.max(0, totalRevenue - deposit);

                  return (
                    <div key={res.id || index} className="bg-zinc-50 border border-zinc-150 rounded-2xl p-4 space-y-3.5 hover:border-zinc-200 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Unidad / Habitación</span>
                        <span className="text-[13px] font-black text-zinc-900 bg-white border border-zinc-200 px-2.5 py-0.5 rounded-xl font-mono">
                          Hab {getUnitDisplay(res.room_name)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Fechas de Estancia</span>
                        <span className="text-[12px] font-bold text-zinc-900 flex items-center gap-1 font-sans">
                          <Calendar size={12} className="text-zinc-400" />
                          {format(new Date(res.check_in + 'T12:00:00'), 'd MMM', { locale: es })} - {format(new Date(res.check_out + 'T12:00:00'), 'd MMM', { locale: es })}
                          <span className="text-[10px] text-zinc-400 font-medium">({nightsCount} {nightsCount === 1 ? 'noche' : 'noches'})</span>
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Canal / Origen</span>
                        <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-xl border font-sans ${
                          res.channel === 'Airbnb' ? 'bg-rose-50 border-rose-150 text-rose-700' :
                          res.channel === 'Booking.com' ? 'bg-blue-50 border-blue-150 text-blue-700' :
                          'bg-emerald-50 border-emerald-150 text-emerald-700'
                        }`}>
                          {res.channel}
                        </span>
                      </div>

                      <div className="border-t border-dashed border-zinc-200 pt-3 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-medium text-zinc-650">
                          <span>Tarifa Total</span>
                          <span>MX${totalRevenue.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-medium text-emerald-650">
                          <span>Anticipo</span>
                          <span>MX${deposit.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-[12px] font-black text-zinc-950 pt-0.5">
                          <span>Pendiente</span>
                          <span className="text-amber-600">MX${balance.toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="pt-1">
                        <button
                          onClick={() => {
                            setShowResDetailModal(false);
                            setShowGuestPortalIframe(String(res.id));
                          }}
                          className="w-full py-2.5 bg-zinc-900 hover:bg-black text-white font-bold text-[11.5px] rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                        >
                          <Eye size={12} />
                          <span>Ver Portal del Huésped (Vista Previa)</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL Iframe VISTA PREVIA DEL PORTAL */}
      {showGuestPortalIframe && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[300] flex flex-col p-4 md:p-6 animate-in fade-in duration-200"
          onClick={() => setShowGuestPortalIframe(null)}
        >
          <div 
            className="bg-[#F6F5F2] w-full max-w-lg mx-auto rounded-3xl overflow-hidden flex flex-col flex-1 shadow-2xl border border-zinc-150 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Header de la Vista previa */}
            <div className="bg-white px-5 py-4 border-b border-zinc-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[12px] font-black text-zinc-900 uppercase tracking-wider font-sans">
                  Vista Previa del Portal (Huésped)
                </span>
              </div>
              <button
                onClick={() => setShowGuestPortalIframe(null)}
                className="bg-zinc-900 hover:bg-black text-white px-4 py-1.5 rounded-xl text-[11px] font-extrabold transition-all active:scale-95 cursor-pointer uppercase tracking-wider shadow-sm flex items-center gap-1.5"
              >
                <X size={12} />
                <span>Cerrar Vista y Regresar</span>
              </button>
            </div>
            {/* Iframe */}
            <div className="flex-1 w-full bg-white relative">
              <iframe
                src={`/public/reserva/${showGuestPortalIframe}`}
                className="w-full h-full border-none"
                title="Vista previa del portal"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
