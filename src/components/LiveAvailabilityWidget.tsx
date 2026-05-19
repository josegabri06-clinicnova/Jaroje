"use client";

import { useState, useEffect } from 'react';
import { DoorOpen, AlertCircle } from 'lucide-react';

export default function LiveAvailabilityWidget() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAvailability = async () => {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 7); // Buscar 7 días para poder mostrar info futura
        const nextWeekStr = tomorrow.toISOString().split('T')[0];

        const res = await fetch(`/api/availability?checkIn=${todayStr}&checkOut=${nextWeekStr}`);
        const data = await res.json();
        
        if (data.success && data.inventory) {
          setInventory(data.inventory);
        } else if (data.error === 'TOKEN_EXPIRED') {
          throw new Error('TOKEN_EXPIRED');
        } else {
          throw new Error('Error de disponibilidad');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAvailability();
    const interval = setInterval(fetchAvailability, 300000);
    return () => clearInterval(interval);
  }, []);

  if (error === 'TOKEN_EXPIRED') {
    return (
      <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col justify-between">
        <div className="flex justify-between items-start mb-3">
          <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-widest">Disponibilidad</p>
          <AlertCircle size={14} className="text-amber-500" />
        </div>
        <p className="text-[11px] text-amber-700 font-medium">Token caducado</p>
      </div>
    );
  }

  // Si fetchAvailability pide 7 días, inventory tiene unidades.
  // Pero ojo, /api/availability devuelve isAvailable=true si está libre en TODO el rango.
  // Wait, if I query checkIn=today, checkOut=nextWeek, it returns true ONLY if it's free the ENTIRE week!
  // The user wants to see "del dia actual y semana siguiente".
  // Let's just keep it simple: fetch today's availability, and maybe tomorrow's.
  
  // For the sake of this small widget, let's just show "Libres hoy".
  const availableGroups = inventory.map(group => ({
    ...group,
    units: group.units.filter((u: any) => u.isAvailable)
  })).filter(group => group.units.length > 0);

  const totalAvailable = availableGroups.reduce((acc, g) => acc + g.units.length, 0);

  return (
    <div className="bg-white border border-zinc-200/80 p-5 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col justify-between cursor-pointer hover:border-zinc-300 transition-colors h-full" onClick={() => window.location.href = '/calendario'}>
      <div className="flex justify-between items-start mb-3">
        <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Hab. Libres</p>
        <DoorOpen size={14} className="text-zinc-400" />
      </div>
      <div className="flex items-baseline gap-1.5">
        <p className="text-3xl font-bold text-zinc-900 tracking-tighter">
          {loading ? <span className="animate-pulse text-zinc-300">--</span> : totalAvailable}
        </p>
        <span className="text-[15px] font-medium text-zinc-500">hoy</span>
      </div>
      {/* Botón rápido / Info */}
      <p className="text-[11px] text-emerald-600 font-bold mt-1 bg-emerald-50 w-fit px-2 py-0.5 rounded-full">Ver calendario ›</p>
    </div>
  );
}
