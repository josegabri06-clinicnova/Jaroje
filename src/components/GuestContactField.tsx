'use client';

import React, { useState } from 'react';
import { ExternalLink, Loader2, Mail, Save } from 'lucide-react';
import { getRole } from '@/lib/auth';
import { gmailComposeUrl, isValidGuestEmail } from '@/lib/guest-email';

interface GuestContactFieldProps {
  /** Reserva (la primera es la principal; en grupos, todas las habitaciones) */
  bookingIds: (string | number)[];
  email?: string | null;
  /** Abrir mostrando el correo (cuando no hay teléfono y sí correo). No se usa donde el teléfono es obligatorio (check-in) */
  startOnEmail?: boolean;
  onSaved: (email: string) => void;
  /** Vista del teléfono de siempre. Recibe la función para pasar a email (undefined si este perfil no puede) */
  renderPhone: (switchToEmail?: () => void) => React.ReactNode;
}

/**
 * Hueco de contacto del huésped: muestra el teléfono (como siempre) o el correo; se cambia pulsando el icono.
 * Solo Administración y Recepción, y solo en reservas ya creadas. Se debe montar con key={id de la reserva}.
 */
export function GuestContactField({ bookingIds, email, startOnEmail = false, onSaved, renderPhone }: GuestContactFieldProps) {
  const role = getRole();
  const allowed = (role === 'admin' || role === 'recepcion') && /^\d+$/.test(String(bookingIds[0] ?? ''));
  const current = String(email || '').trim();

  const [showEmail, setShowEmail] = useState(() => startOnEmail && !!current);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!allowed || !showEmail) return <>{renderPhone(allowed ? () => setShowEmail(true) : undefined)}</>;

  const showInput = editing || !current;
  const value = editing ? draft : (current ? current : draft);

  const save = async () => {
    const next = value.trim().toLowerCase();
    if (!isValidGuestEmail(next)) { setError('Escribe un correo válido.'); return; }
    // Las OTA dejan un correo de reenvío: reemplazarlo es posible, pero se pide confirmación
    if (current && next !== current.toLowerCase() && !window.confirm(`¿Reemplazar el correo ${current} por ${next}?`)) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/reservas/contact-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingIds, email: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'No se pudo guardar el correo.');
      setEditing(false);
      onSaved(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-2xl flex items-center gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)] text-left">
      <button
        type="button"
        onClick={() => { setShowEmail(false); setEditing(false); setError(''); }}
        title="Cambiar a teléfono"
        aria-label="Cambiar a teléfono"
        className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 cursor-pointer active:scale-95 hover:bg-blue-100"
      >
        <Mail size={16} className="text-blue-600" />
      </button>
      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Email</span>
        {showInput ? (
          <div className="flex items-center gap-1.5">
            <input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={draft}
              onChange={e => { setDraft(e.target.value); setError(''); }}
              placeholder="cliente@correo.com"
              className="flex-1 min-w-0 bg-white border border-zinc-300 focus:border-blue-500 rounded-xl px-3 py-2 text-[16px] font-semibold text-zinc-900 outline-none"
            />
            <button
              type="button"
              onClick={save}
              disabled={saving || !draft.trim()}
              className="px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-[11px] font-black rounded-xl flex items-center gap-1 shrink-0 cursor-pointer"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <a
              href={gmailComposeUrl(current)}
              target="_blank"
              rel="noopener noreferrer"
              title="Escribir desde Gmail"
              className="min-w-0 text-[13px] font-bold text-blue-700 hover:underline flex items-center gap-1.5"
            >
              <span className="truncate">{current}</span>
              <ExternalLink size={11} className="shrink-0" />
            </a>
            <button
              type="button"
              onClick={() => { setDraft(current); setEditing(true); }}
              className="text-[11px] font-extrabold text-zinc-500 hover:text-zinc-800 shrink-0 cursor-pointer"
            >
              Editar
            </button>
          </div>
        )}
        {error && <p className="text-[11px] font-semibold text-red-600 mt-1">{error}</p>}
      </div>
    </div>
  );
}
