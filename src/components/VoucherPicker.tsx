'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Camera, CheckCircle2, CreditCard, Trash2, Upload } from 'lucide-react';

/** Un cobro con tarjeta o transferencia debe documentarse con la foto del voucher / comprobante. */
export const methodRequiresVoucher = (method: string | null) => method === 'tarjeta' || method === 'transferencia';

/** Selector obligatorio de la foto del voucher TPV / comprobante. Solo elige el archivo: lo sube quien confirma el cobro. */
export function VoucherPicker({ method, file, onChange }: { method: string | null; file: File | null; onChange: (file: File | null) => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => (file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) onChange(picked);
    e.target.value = ''; // permite volver a elegir el mismo archivo después de quitarlo
  };

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-xl space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-extrabold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
          <CreditCard size={13} className="text-amber-600" /> Voucher TPV / Comprobante
        </span>
        <span className="text-[9px] font-extrabold text-red-600 bg-red-100 border border-red-200 px-2 py-0.5 rounded-full uppercase tracking-wider">* Obligatorio</span>
      </div>
      <p className="text-[10.5px] text-amber-900 font-medium leading-relaxed">
        Pago con <strong>{method === 'tarjeta' ? 'Tarjeta (TPV)' : 'Transferencia'}</strong>: adjunta la foto del comprobante para continuar.
      </p>

      {file && (
        <div className="relative rounded-xl border border-amber-300 bg-white overflow-hidden">
          {previewUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={previewUrl} alt="Vista previa del voucher" className="w-full h-36 object-cover" />
            : <p className="p-3 pt-8 text-[11px] font-bold text-zinc-700 break-all">{file.name}</p>}
          <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 size={11} className="text-emerald-400" /> Voucher listo
          </span>
          <button type="button" onClick={() => onChange(null)} title="Quitar voucher"
            className="absolute top-2 right-2 bg-red-50 border border-red-200 text-red-600 p-1.5 rounded-lg cursor-pointer">
            <Trash2 size={12} />
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={() => cameraRef.current?.click()}
          className="flex-1 py-2.5 bg-amber-900 hover:bg-amber-950 text-white text-[11px] font-extrabold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer">
          <Camera size={13} /> {file ? 'Cambiar foto' : 'Cámara'}
        </button>
        <button type="button" onClick={() => galleryRef.current?.click()}
          className="flex-1 py-2.5 bg-white border border-amber-300 hover:bg-amber-50 text-amber-950 text-[11px] font-extrabold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer">
          <Upload size={13} className="text-amber-700" /> Cargar archivo
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={pick} className="hidden" />
      <input ref={galleryRef} type="file" accept="image/*,application/pdf" onChange={pick} className="hidden" />
    </div>
  );
}
