"use client";

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface Status { syncedAt: string | null; rows: number }

/** Copia de las tarifas de Beds24 que usa el portal de venta: cuándo se actualizó y botón para actualizarla ya */
export default function RatesSyncCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/admin/rates-sync', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.success) setStatus({ syncedAt: json.syncedAt, rows: json.rows });
    } catch { /* el estado es informativo: si falla, el botón sigue funcionando */ }
  };

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/rates-sync', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => { if (!cancelled && json.success) setStatus({ syncedAt: json.syncedAt, rows: json.rows }); })
      .catch(() => { /* informativo: si falla, el botón sigue funcionando */ });
    return () => { cancelled = true; };
  }, []);

  const handleSync = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/rates-sync', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        setMessage({ ok: true, text: `✅ Tarifas actualizadas: ${json.rows} noches copiadas desde Beds24.` });
      } else if (res.status === 429) {
        setMessage({ ok: false, text: 'Demasiados intentos seguidos. Espera unos minutos.' });
      } else {
        setMessage({ ok: false, text: json.failedChunks ? `No se pudieron copiar ${json.failedChunks} tramo(s) de fechas. Inténtalo de nuevo en unos minutos.` : (json.error || 'No se pudo actualizar. Inténtalo de nuevo.') });
      }
    } catch {
      setMessage({ ok: false, text: 'Error de conexión. Inténtalo de nuevo.' });
    } finally {
      setLoading(false);
      loadStatus();
    }
  };

  const when = status?.syncedAt ? new Date(status.syncedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return (
    <div className="flex flex-col gap-2 pb-3 border-b border-zinc-100">
      <span className="text-[13px] font-bold text-zinc-900">Tarifas del Portal de Ventas</span>
      <p className="text-[11.5px] text-zinc-500 leading-normal">
        El portal muestra los precios desde una copia de las tarifas de Beds24, que se actualiza sola cada 6 horas y al cambiar precios desde la app.
        Si cambiaste precios directamente en Beds24, pulsa el botón para verlos ya en el portal.
      </p>
      <div className="text-[11px] text-zinc-600 bg-zinc-50 border border-zinc-200/70 rounded-xl p-2.5">
        {status ? (
          <>Última actualización completa: <strong>{when || 'nunca'}</strong> · {status.rows.toLocaleString('es-MX')} noches guardadas</>
        ) : 'Cargando estado…'}
      </div>
      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        className="self-start inline-flex items-center gap-2 px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white text-[12px] font-bold rounded-xl transition-colors cursor-pointer"
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Actualizando…' : 'Actualizar tarifas ahora'}
      </button>
      {message && <p className={`text-[11.5px] font-semibold ${message.ok ? 'text-emerald-700' : 'text-red-600'}`}>{message.text}</p>}
    </div>
  );
}
