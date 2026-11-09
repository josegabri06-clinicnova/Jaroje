"use client";

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { getRoomPhotoUrl } from '@/lib/room-photos';
import { getRoomTypeKey } from '@/lib/room-type';

/** Estancia confirmada de este dispositivo (la entrega /api/public/mi-estancia) */
export interface MyStay {
  id: string;
  room_name: string;
  check_in: string;
  check_out: string;
  phase: 'in_house' | 'upcoming';
}

interface Props {
  stay: MyStay;
  /** Fechas ya formateadas para mostrar */
  dates: string;
  href: string;
  labels: { inHouse: string; upcoming: string; viewPortal: string };
}

/**
 * Tarjeta de una estancia en "Mi Estancia", con la foto de su tipo de habitación (la misma que ve en su portal).
 * La foto es la primera de la carpeta de ese tipo en Storage; tiene altura fija (no mueve la página al cargar), se carga solo al
 * acercarse a la pantalla y, si no se pudiera cargar, desaparece y la tarjeta queda como antes (sin icono de imagen rota).
 */
export function MyStayCard({ stay, dates, href, labels }: Props) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = getRoomPhotoUrl(getRoomTypeKey(stay.room_name), 1);
  const inHouse = stay.phase === 'in_house';
  const chipText = inHouse ? labels.inHouse : labels.upcoming;

  return (
    <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
      {!photoFailed && (
        <div className="relative h-36 bg-zinc-100">
          <img
            src={photo}
            alt={stay.room_name}
            loading="lazy"
            decoding="async"
            onError={() => setPhotoFailed(true)}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/30 to-transparent" />
          <span className={`absolute top-3 left-3 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md ${
            inHouse ? 'text-emerald-700 bg-emerald-50/95' : 'text-indigo-600 bg-white/95'
          }`}>
            {chipText}
          </span>
        </div>
      )}

      <div className="p-5 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            {photoFailed && (
              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                inHouse ? 'text-emerald-700 bg-emerald-50' : 'text-indigo-600 bg-indigo-50'
              }`}>
                {chipText}
              </span>
            )}
            <h3 className={`text-sm font-black text-zinc-900 ${photoFailed ? 'mt-1.5' : ''}`}>{stay.room_name}</h3>
          </div>
          <span className="text-xs font-mono font-bold text-zinc-400">#{stay.id}</span>
        </div>

        <div className="text-xs text-zinc-600 border-t border-zinc-100 pt-2">
          📅 {dates}
        </div>

        <a
          href={href}
          className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <span>{labels.viewPortal}</span>
          <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
}
