"use client";

import React, { useState } from 'react';
import { Phone, Check, X, Loader2 } from 'lucide-react';
import { ALL_COUNTRY_CODES, POPULAR_COUNTRY_CODES } from '@/lib/country-dial-codes';

const TEXT = {
  es: {
    title: 'Recibe tu información por WhatsApp',
    desc: 'Déjanos tu WhatsApp (opcional) y te enviaremos por ahí los datos de tu reserva, tu llegada y tu acceso. Así no dependes del chat de la plataforma.',
    country: 'País',
    placeholder: 'Tu número de WhatsApp',
    consent: 'Al guardarlo aceptas recibir mensajes de WhatsApp sobre tu reserva.',
    save: 'Guardar mi WhatsApp',
    saving: 'Guardando…',
    later: 'Ahora no',
    doneSent: '¡Listo! Te enviamos un mensaje por WhatsApp para confirmar tu número.',
    doneSaved: '¡Listo! Guardamos tu número. Te escribiremos por WhatsApp con los datos de tu reserva.',
    invalid: 'Revisa el número: escríbelo sin el código de país y sin espacios extra.',
    hasPhone: 'Esta reserva ya tiene un teléfono registrado.',
    hasDocuments: 'Para añadir tu teléfono escríbenos por el chat de la reserva.',
    limited: 'Demasiados intentos. Inténtalo de nuevo en unos minutos.',
    generic: 'No se pudo guardar. Inténtalo de nuevo.',
  },
  en: {
    title: 'Get your information on WhatsApp',
    desc: 'Leave us your WhatsApp number (optional) and we will send your booking details, arrival information and access there. No need to depend on the platform chat.',
    country: 'Country',
    placeholder: 'Your WhatsApp number',
    consent: 'By saving it you agree to receive WhatsApp messages about your booking.',
    save: 'Save my WhatsApp',
    saving: 'Saving…',
    later: 'Not now',
    doneSent: 'Done! We sent you a WhatsApp message to confirm your number.',
    doneSaved: 'Done! We saved your number. We will message you on WhatsApp with your booking details.',
    invalid: 'Please check the number: enter it without the country code and without extra spaces.',
    hasPhone: 'This booking already has a phone number on file.',
    hasDocuments: 'To add your phone number, please message us in the booking chat.',
    limited: 'Too many attempts. Please try again in a few minutes.',
    generic: 'Could not save. Please try again.',
  },
} as const;

const ALPHABETICAL = [...ALL_COUNTRY_CODES].sort((a, b) => a.name.localeCompare(b.name, 'es'));

export default function PhoneRequestCard({ bookingId, lang }: { bookingId: string; lang: 'es' | 'en' }) {
  const tx = TEXT[lang === 'en' ? 'en' : 'es'];
  const [dialCode, setDialCode] = useState('+52');
  const [national, setNational] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | 'sent' | 'saved'>(null);
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  const save = async () => {
    if (saving || !national.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/public/reserva/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bookingId, dialCode, national, lang }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        setDone(json.whatsappSent ? 'sent' : 'saved');
      } else if (json.code === 'invalid_phone') setError(tx.invalid);
      else if (json.code === 'has_phone') setError(tx.hasPhone);
      else if (json.code === 'has_documents') setError(tx.hasDocuments);
      else if (json.code === 'rate_limited') setError(tx.limited);
      else setError(tx.generic);
    } catch {
      setError(tx.generic);
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-sm flex gap-3 items-start">
        <Check size={18} className="text-emerald-600 shrink-0 mt-0.5" />
        <p className="text-[13px] leading-relaxed font-semibold text-emerald-900">{done === 'sent' ? tx.doneSent : tx.doneSaved}</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-emerald-200/70 rounded-2xl p-4 shadow-sm space-y-3 relative">
      <button
        type="button"
        onClick={() => setHidden(true)}
        aria-label={tx.later}
        className="absolute top-3 right-3 text-zinc-400 hover:text-zinc-600 cursor-pointer"
      >
        <X size={16} />
      </button>
      <div className="flex items-center gap-2 pr-6">
        <Phone size={16} className="text-emerald-600" />
        <h3 className="font-extrabold text-zinc-900 text-[13px] uppercase tracking-wide">{tx.title}</h3>
      </div>
      <p className="text-[12px] text-zinc-600 leading-relaxed">{tx.desc}</p>
      <div className="flex gap-2">
        <select
          value={dialCode}
          onChange={e => { setDialCode(e.target.value); setError(null); }}
          aria-label={tx.country}
          className="w-[104px] shrink-0 text-[14px] bg-zinc-50 border border-zinc-300 rounded-xl px-2 py-2.5 outline-none focus:ring-2 focus:ring-emerald-300"
        >
          <optgroup label="★">
            {POPULAR_COUNTRY_CODES.map((c, i) => (
              <option key={`p-${c.code}-${i}`} value={c.dialCode}>{c.flag} {c.dialCode}</option>
            ))}
          </optgroup>
          <optgroup label="A-Z">
            {ALPHABETICAL.map((c, i) => (
              <option key={`a-${c.code}-${i}`} value={c.dialCode}>{c.flag} {c.name} ({c.dialCode})</option>
            ))}
          </optgroup>
        </select>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          maxLength={20}
          value={national}
          onChange={e => { setNational(e.target.value.replace(/[^\d\s()-]/g, '')); setError(null); }}
          onKeyDown={e => { if (e.key === 'Enter') save(); }}
          placeholder={tx.placeholder}
          className="flex-1 min-w-0 text-[14px] font-bold tracking-wider bg-white border border-zinc-300 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-emerald-300"
        />
      </div>
      {error && <p className="text-[11.5px] text-red-600 font-semibold">{error}</p>}
      <button
        type="button"
        onClick={save}
        disabled={saving || !national.trim()}
        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[13px] font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
      >
        {saving ? <><Loader2 size={14} className="animate-spin" />{tx.saving}</> : tx.save}
      </button>
      <p className="text-[10.5px] text-zinc-400 leading-snug">{tx.consent}</p>
    </div>
  );
}
