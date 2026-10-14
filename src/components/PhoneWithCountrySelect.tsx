"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Phone, AlertCircle, Check, Loader2, Send } from 'lucide-react';
import {
  ALL_COUNTRY_CODES,
  POPULAR_COUNTRY_CODES,
  parsePhoneAndDialCode,
  buildE164Phone,
  buildWhatsAppLink,
  isOtaReservation,
  isOtaPhoneMissingOrInvalid
} from '@/lib/country-dial-codes';

interface PhoneWithCountrySelectProps {
  value: string;
  onChange: (fullPhone: string) => void;
  channel?: string | null;
  guestCountry?: string | null;
  onSaveOnly?: () => Promise<void> | void;
  savingOnly?: boolean;
  savedSuccess?: boolean;
  required?: boolean;
  className?: string;
  showSaveButton?: boolean;
}

export function PhoneWithCountrySelect({
  value,
  onChange,
  channel,
  guestCountry,
  onSaveOnly,
  savingOnly = false,
  savedSuccess = false,
  required = false,
  className = '',
  showSaveButton = true
}: PhoneWithCountrySelectProps) {
  // Inicializar prefijo y número nacional a partir del valor externo
  const parsed = useMemo(() => {
    return parsePhoneAndDialCode(value || '', guestCountry);
  }, [value, guestCountry]);

  const [dialCode, setDialCode] = useState<string>(parsed.dialCode);
  const [nationalNumber, setNationalNumber] = useState<string>(parsed.nationalNumber);

  // Mantener sincronizado si cambia el valor externo
  useEffect(() => {
    setDialCode(parsed.dialCode);
    setNationalNumber(parsed.nationalNumber);
  }, [parsed.dialCode, parsed.nationalNumber]);

  const isOta = isOtaReservation(channel);
  const isMissing = isOtaPhoneMissingOrInvalid(value);
  const isMandatoryOta = isOta && (required || true); // Obligatorio siempre para OTAs

  const handleDialCodeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDial = e.target.value;
    setDialCode(newDial);
    const full = buildE164Phone(newDial, nationalNumber);
    onChange(full);
  };

  const handleNationalNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawInput = e.target.value;
    // Permitir dígitos y espacios
    const digitsOnly = rawInput.replace(/\D/g, '');
    setNationalNumber(digitsOnly);
    const full = buildE164Phone(dialCode, digitsOnly);
    onChange(full);
  };

  const waLink = useMemo(() => {
    return buildWhatsAppLink(dialCode, nationalNumber);
  }, [dialCode, nationalNumber]);

  // Lista ordenada alfabéticamente para la segunda sección
  const alphabetizedCountries = useMemo(() => {
    return [...ALL_COUNTRY_CODES].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, []);

  return (
    <div
      className={`p-4 rounded-2xl border transition-all ${
        isMandatoryOta && isMissing
          ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-400/20 shadow-sm'
          : 'bg-zinc-50 border-zinc-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.01)]'
      } ${className}`}
    >
      {/* Header / Badges */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Phone
            size={13}
            className={isMandatoryOta && isMissing ? 'text-amber-700' : 'text-emerald-600'}
          />
          <span className="text-[11px] font-extrabold text-zinc-700 uppercase tracking-wider flex items-center gap-1">
            <span>Teléfono del Huésped (WhatsApp)</span>
            {isMandatoryOta && (
              <span className="text-rose-600 font-black text-[12px]">*</span>
            )}
          </span>
        </div>
        {channel && (
          <span
            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
              isOta
                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                : 'bg-zinc-200 text-zinc-700'
            }`}
          >
            {channel}
          </span>
        )}
      </div>

      {/* Alerta explícita para Booking / Expedia */}
      {isMandatoryOta && isMissing && (
        <div className="mb-3 p-2.5 rounded-xl bg-amber-100/90 border border-amber-300 flex items-start gap-2 shadow-xs">
          <AlertCircle size={15} className="text-amber-800 shrink-0 mt-0.5" />
          <div className="text-[11px] text-amber-950 leading-tight">
            <p className="font-extrabold text-amber-900">
              🚨 Obligatorio para {channel || 'Booking / Expedia'}:
            </p>
            <p className="font-medium mt-0.5">
              Las plataformas no proporcionan el teléfono real. <strong>Debes registrar el WhatsApp</strong> del huésped para que reciba sus claves de acceso y el portal digital. No se puede finalizar el Check-In sin este dato.
            </p>
          </div>
        </div>
      )}

      {/* Selector de País + Input de Número + Botón Guardar */}
      <div className="flex items-center gap-2">
        {/* Dropdown con banderas y prefijos */}
        <div className="relative shrink-0">
          <select
            value={dialCode}
            onChange={handleDialCodeChange}
            aria-label="Prefijo de país"
            className="appearance-none bg-white border border-zinc-300 hover:border-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-2.5 py-2 pr-7 text-[13px] font-extrabold text-zinc-800 outline-none transition-all cursor-pointer shadow-inner max-w-[130px] truncate"
          >
            <optgroup label="🌟 Más Frecuentes">
              {POPULAR_COUNTRY_CODES.map((c, i) => (
                <option key={`pop-${c.code}-${c.dialCode}-${i}`} value={c.dialCode}>
                  {c.flag} {c.code} ({c.dialCode})
                </option>
              ))}
            </optgroup>
            <optgroup label="🌍 Todos los Países (A-Z)">
              {alphabetizedCountries.map((c, i) => (
                <option key={`all-${c.code}-${c.dialCode}-${i}`} value={c.dialCode}>
                  {c.flag} {c.name} ({c.dialCode})
                </option>
              ))}
            </optgroup>
          </select>
          {/* Chevron flecha hacia abajo */}
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-zinc-400">
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>

        {/* Input de Número Nacional */}
        <input
          type="tel"
          value={nationalNumber}
          onChange={handleNationalNumberChange}
          placeholder="Ej: 998 123 4567"
          className="flex-1 min-w-0 bg-white border border-zinc-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-3 py-2 text-[13px] font-bold text-zinc-900 outline-none transition-all shadow-inner tracking-wider"
        />

        {/* Botón Guardar (si aplica) */}
        {showSaveButton && onSaveOnly && (
          <button
            type="button"
            onClick={onSaveOnly}
            disabled={savingOnly || !nationalNumber.trim()}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-white text-[11px] font-extrabold rounded-xl transition-all flex items-center gap-1.5 shadow-sm shrink-0 cursor-pointer"
          >
            {savingOnly ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Guardando...</span>
              </>
            ) : savedSuccess ? (
              <>
                <Check size={13} className="text-white" />
                <span>¡Guardado!</span>
              </>
            ) : (
              <>
                <span>💾 Guardar</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Enlace rápido a WhatsApp si ya hay suficientes dígitos */}
      {waLink && (
        <div className="mt-2.5 pt-2 border-t border-zinc-200/60 flex items-center justify-between text-left">
          <span className="text-[10px] font-semibold text-zinc-500">
            Formato WhatsApp ({dialCode}):
          </span>
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Send size={11} className="rotate-45" />
            <span>Abrir chat ({dialCode} {nationalNumber})</span>
          </a>
        </div>
      )}
    </div>
  );
}
export default PhoneWithCountrySelect;
