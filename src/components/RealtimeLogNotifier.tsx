"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Bell, X, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface ActiveNotification {
  id: string;
  title: string;
  desc: string;
  module: string;
}

export default function RealtimeLogNotifier() {
  const [notification, setNotification] = useState<ActiveNotification | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Desbloquear Web Audio API ante la primera interacción del usuario en la pantalla
    const unlockAudio = () => {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          if (ctx.state === 'suspended') {
            ctx.resume();
          }
        }
      } catch (e) {
        console.warn("Audio unlock failed", e);
      }
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  useEffect(() => {
    // 1. Suscribirse a inserciones en la tabla employee_logs en tiempo real
    const channel = supabase
      .channel('realtime-logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'employee_logs' },
        (payload) => {
          console.log('Nuevo log de empleado detectado en tiempo real:', payload.new);
          
          const newLog = payload.new;
          const employeeName = newLog.employee_name || 'Alguien';
          const actionText = newLog.action || 'realizó una acción';
          const moduleName = newLog.module || 'Sistema';

          // Títulos de acciones amigables
          const friendlyActions: Record<string, string> = {
            'inicio_sesion_turno': 'Inicio de Turno',
            'check_in': 'Check-In Procesado',
            'check_out': 'Check-Out Procesado',
            'movimiento_financiero': 'Movimiento Financiero',
            'incidencia_mantenimiento': 'Incidencia Reportada',
            'report_maintenance': 'Daño Técnico Reportado 🛠',
            'human_mode_activated': 'Ayuda Requerida ⚠️',
            'cambio_estado_incidencia': 'Tarea Actualizada',
            'ajuste_stock': 'Ajuste de Stock',
            'nuevo_articulo': 'Artículo Creado',
            'actualizacion_articulo': 'Inventario Actualizado',
            'eliminar_articulo': 'Artículo Eliminado',
          };
          const friendlyTitle = friendlyActions[actionText] || actionText.replace(/_/g, ' ');

          // Reproducir el sonido sintético premium
          playPremiumChime();

          // Activar notificación toast
          setNotification({
            id: String(newLog.id),
            title: friendlyTitle,
            desc: `${employeeName} en ${moduleName.toUpperCase()}`,
            module: moduleName
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Cerrar notificación después de 6 segundos
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const playPremiumChime = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const now = ctx.currentTime;

      // Nota 1: G5 (783.99 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(783.99, now);
      gain1.gain.setValueAtTime(0.08, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Nota 2: C6 (1046.50 Hz) con un leve retraso
      setTimeout(() => {
        try {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(1046.50, now + 0.08);
          gain2.gain.setValueAtTime(0.08, now + 0.08);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start(now + 0.08);
          osc2.stop(now + 0.45);
        } catch (e) {}
      }, 80);
    } catch (err) {
      console.warn("Web Audio API failed", err);
    }
  };

  if (!notification) return null;

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[999] w-[90%] max-w-sm bg-zinc-950/95 text-white border border-zinc-800 rounded-3xl p-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)] backdrop-blur-md flex items-center justify-between gap-3 animate-in slide-in-from-top-10 duration-300">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl flex items-center justify-center shrink-0 text-emerald-400">
          <Bell size={18} className="animate-bounce" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-black tracking-tight leading-tight truncate">{notification.title}</p>
          <p className="text-[11px] text-zinc-400 font-bold block mt-0.5 truncate capitalize">{notification.desc}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 select-none">
        <button
          onClick={() => {
            setNotification(null);
            router.push('/historial');
          }}
          className="h-8 px-3 bg-white text-zinc-950 hover:bg-zinc-100 rounded-xl text-[10px] font-extrabold flex items-center gap-1 transition-all active:scale-[0.96] cursor-pointer"
        >
          <span>Auditar</span>
          <ArrowRight size={10} strokeWidth={2.5} />
        </button>
        <button
          onClick={() => setNotification(null)}
          className="p-1.5 hover:bg-white/10 rounded-full text-zinc-500 hover:text-white transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
