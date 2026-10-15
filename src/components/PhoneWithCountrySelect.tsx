"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Phone, AlertCircle, Check, Loader2, Send, ChevronDown, Save } from 'lucide-react';
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
    // Solo dígitos para almacenar en BD
    const digitsOnly = rawInput.replace(/\D/g, '');
    setNationalNumber(digitsOnly);
    const full = buildE164Phone(dialCode, digitsOnly);
    onChange(full);
  };

  const waLink = useMemo(() => {
    return buildWhatsAppLink(dialCode, nationalNumber);
  }, [dialCode, nationalNumber]);

  // País seleccionado actual para mostrar bandera y prefijo compacto
  const selectedCountry = useMemo(() => {
    if (guestCountry) {
      const byGuest = ALL_COUNTRY_CODES.find(
        c => (c.code.toUpperCase() === guestCountry.trim().toUpperCase() || c.name.toLowerCase() === guestCountry.trim().toLowerCase()) && c.dialCode === dialCode
      );
      if (byGuest) return byGuest;
    }
    const pop = POPULAR_COUNTRY_CODES.find(c => c.dialCode === dialCode);
    if (pop) return pop;
    const all = ALL_COUNTRY_CODES.find(c => c.dialCode === dialCode);
    if (all) return all;
    return { name: 'Prefijo', code: '', dialCode: dialCode || '+52', flag: '🌐' };
  }, [dialCode, guestCountry]);

  // Lista ordenada alfabéticamente para la segunda sección
  const alphabetizedCountries = useMemo(() => {
    return [...ALL_COUNTRY_CODES].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, []);

  return (
    <div
      className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
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
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Input Bar Unificado: Prefijo a la izquierda + Número nacional a la derecha */}
        <div className="flex-1 min-w-0 flex items-center bg-white border border-zinc-300 hover:border-zinc-400 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 rounded-xl shadow-xs transition-all overflow-hidden">
          {/* Selector de prefijo ultra compacto con bandera y chevron */}
          <div className="relative shrink-0 flex items-center bg-zinc-50 hover:bg-zinc-100 border-r border-zinc-200 px-2 sm:px-2.5 py-2.5 cursor-pointer transition-colors select-none">
            <span className="text-[17px] leading-none shrink-0 mr-1">{selectedCountry.flag}</span>
            <span className="text-[13px] font-black text-zinc-800 tracking-tight">{selectedCountry.dialCode}</span>
            <ChevronDown size={12} className="text-zinc-400 ml-0.5 shrink-0" />

            {/* Select nativo superpuesto para máxima ergonomía táctil en iOS y Android */}
            <select
              value={dialCode}
              onChange={handleDialCodeChange}
              aria-label="Prefijo de país"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-[16px]"
            >
              <optgroup label="🌟 Más Frecuentes">
                {POPULAR_COUNTRY_CODES.map((c, i) => (
                  <option key={`pop-${c.code}-${c.dialCode}-${i}`} value={c.dialCode}>
                    {c.flag} {c.name} ({c.dialCode})
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
          </div>

          {/* Campo de número telefónico: toma TODO el espacio restante */}
          <input
            type="tel"
            value={nationalNumber}
            onChange={handleNationalNumberChange}
            placeholder="Ej: 608 290 664"
            className="flex-1 min-w-0 bg-transparent px-3 py-2 text-[14px] font-bold text-zinc-900 outline-none placeholder:text-zinc-400 tracking-wider"
          />
        </div>

        {/* Botón Guardar compacto y estilizado */}
        {showSaveButton && onSaveOnly && (
          <button
            type="button"
            onClick={onSaveOnly}
            disabled={savingOnly || !nationalNumber.trim()}
            className="px-2.5 sm:px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-white text-[11px] sm:text-[12px] font-black rounded-xl transition-all flex items-center gap-1 shadow-xs shrink-0 cursor-pointer"
          >
            {savingOnly ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span className="hidden xs:inline">Guardando...</span>
              </>
            ) : savedSuccess ? (
              <>
                <Check size={13} className="text-white" />
                <span>¡Listo!</span>
              </>
            ) : (
              <>
                <Save size={13} />
                <span>Guardar</span>
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
