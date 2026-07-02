'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  Copy, 
  Check, 
  Upload, 
  Loader2, 
  FileText, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  MessageSquare,
  ArrowRight,
  TrendingUp,
  Clock
} from 'lucide-react';

export default function PagoTransferenciaPage() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('bookingId') || searchParams.get('id') || '';
  const rawAmount = searchParams.get('amount') || '';
  const name = searchParams.get('name') || '';
  const email = searchParams.get('email') || '';

  const [amount, setAmount] = useState<number>(0);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (rawAmount) {
      const parsed = parseFloat(rawAmount);
      if (!isNaN(parsed)) {
        setAmount(parsed);
      }
    }
  }, [rawAmount]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Función para comprimir imágenes
  const compressImage = async (file: File): Promise<Blob | File> => {
    if (!file.type.startsWith('image/')) return file;
    
    return new Promise((resolve) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(file);

        // Max width/height of 1200px
        const MAX_SIZE = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
          } else {
            resolve(file);
          }
        }, 'image/jpeg', 0.85); // 85% calidad
      };
      img.onerror = () => resolve(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setUploadError(null);
      setUploading(true);

      try {
        const fileToUpload = await compressImage(file);
        
        const formData = new FormData();
        formData.append('bookingId', String(bookingId));
        formData.append('amount', String(amount));
        formData.append('name', String(name));
        formData.append('email', String(email));
        formData.append('file', fileToUpload);

        const res = await fetch('/api/payments/transfer-submit', {
          method: 'POST',
          body: formData
        });

        const json = await res.json();
        if (res.ok && json.success) {
          setUploadedUrl(json.receiptUrl);
          setSuccess(true);
        } else {
          setUploadError(json.error || 'Ocurrió un error al procesar el comprobante.');
        }
      } catch (err) {
        setUploadError('Error de red al intentar subir el archivo.');
      } finally {
        setUploading(false);
      }
    }
  };

  const bankDetails = {
    banco: 'Santander',
    titular: 'Laura Isabel Corral Dovalina',
    cuenta: '60628351140',
    clabe: '014060606283511403',
    concepto: bookingId || 'ID de la reserva'
  };

  return (
    <div className="min-h-screen bg-[#F6F5F2] flex flex-col items-center justify-center p-4 font-sans select-none">
      <div className="w-full max-w-md bg-white rounded-3xl border border-zinc-200/80 shadow-xl overflow-hidden">
        
        {/* Top Header */}
        <div className="bg-[#18181b] px-6 py-5 text-white flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Jaroje Condominios</span>
            <h2 className="text-lg font-bold">Pago por Transferencia</h2>
          </div>
          <div className="bg-[#25D366] text-[10px] font-black px-2.5 py-1 rounded-full uppercase text-zinc-950 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-950 animate-ping"></span>
            Portal Seguro
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Progress Indicator */}
          <div className="flex items-center justify-between px-2 text-[11px] font-bold text-zinc-400 uppercase tracking-wide">
            <span className="text-blue-600">1. Transferencia</span>
            <ArrowRight size={12} className="text-zinc-300" />
            <span className={success ? "text-blue-600" : ""}>2. Comprobante</span>
            <ArrowRight size={12} className="text-zinc-300" />
            <span className={success ? "text-emerald-600" : ""}>3. Verificación</span>
          </div>

          {!success ? (
            <>
              {/* Payment Summary */}
              <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Total a transferir</p>
                  <p className="text-2xl font-black text-zinc-950 mt-0.5">
                    ${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-bold text-zinc-500">MXN</span>
                  </p>
                </div>
                {bookingId && (
                  <div className="text-right">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Reserva</p>
                    <p className="text-sm font-black text-zinc-900 mt-0.5">#{bookingId}</p>
                  </div>
                )}
              </div>

              {/* Bank Details Card */}
              <div className="space-y-3.5">
                <h3 className="text-[12px] font-extrabold text-zinc-400 uppercase tracking-wider px-1">Datos de Transferencia</h3>
                
                <div className="bg-white border border-zinc-200/80 rounded-2xl p-4.5 space-y-3.5 shadow-sm">
                  
                  {/* Banco */}
                  <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase">Banco</span>
                      <p className="text-sm font-bold text-zinc-900">{bankDetails.banco}</p>
                    </div>
                  </div>

                  {/* Beneficiario */}
                  <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase">Beneficiario</span>
                      <p className="text-sm font-bold text-zinc-900">{bankDetails.titular}</p>
                    </div>
                  </div>

                  {/* CLABE */}
                  <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase">CLABE Interbancaria</span>
                      <p className="text-sm font-black text-zinc-950 tracking-wider font-mono">{bankDetails.clabe}</p>
                    </div>
                    <button 
                      onClick={() => copyToClipboard(bankDetails.clabe, 'clabe')}
                      className="w-8 h-8 flex items-center justify-center bg-zinc-50 border border-zinc-200 rounded-lg hover:bg-zinc-100 transition-colors"
                      title="Copiar CLABE"
                    >
                      {copiedField === 'clabe' ? (
                        <Check size={14} className="text-emerald-600" />
                      ) : (
                        <Copy size={14} className="text-zinc-500" />
                      )}
                    </button>
                  </div>

                  {/* Concepto */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase">Concepto de Pago (Obligatorio)</span>
                      <p className="text-sm font-black text-zinc-950 font-mono">{bankDetails.concepto}</p>
                    </div>
                    <button 
                      onClick={() => copyToClipboard(String(bankDetails.concepto), 'concepto')}
                      className="w-8 h-8 flex items-center justify-center bg-zinc-50 border border-zinc-200 rounded-lg hover:bg-zinc-100 transition-colors"
                      title="Copiar Concepto"
                    >
                      {copiedField === 'concepto' ? (
                        <Check size={14} className="text-emerald-600" />
                      ) : (
                        <Copy size={14} className="text-zinc-500" />
                      )}
                    </button>
                  </div>

                </div>
              </div>

              {/* Uploader Section */}
              <div className="space-y-3.5">
                <h3 className="text-[12px] font-extrabold text-zinc-400 uppercase tracking-wider px-1">Subir Comprobante</h3>
                
                <div className="relative border-2 border-dashed border-zinc-300 hover:border-zinc-400 rounded-2xl transition-colors bg-zinc-50/50">
                  <input 
                    type="file" 
                    id="receipt-upload"
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
                    disabled={uploading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="p-8 text-center flex flex-col items-center justify-center">
                    {uploading ? (
                      <>
                        <Loader2 className="animate-spin text-blue-600 mb-2.5" size={32} />
                        <p className="text-sm font-bold text-zinc-800">Comprimiendo y subiendo...</p>
                        <p className="text-[11px] text-zinc-400 mt-1">Espera un momento, por favor.</p>
                      </>
                    ) : (
                      <>
                        <Upload className="text-zinc-400 mb-2.5" size={32} />
                        <p className="text-sm font-bold text-zinc-800">Selecciona o toma foto del comprobante</p>
                        <p className="text-[11px] text-zinc-400 mt-1">Soporta imágenes (JPG, PNG) y PDF</p>
                      </>
                    )}
                  </div>
                </div>

                {uploadError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 flex items-start gap-2">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <p className="font-semibold">{uploadError}</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Success screen */
            <div className="text-center py-8 space-y-5">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
                <CheckCircle2 size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-zinc-950">¡Comprobante Enviado!</h3>
                <p className="text-xs text-zinc-500 max-w-xs mx-auto leading-relaxed">
                  Hemos recibido tu comprobante de transferencia con éxito para la reserva <span className="font-bold text-zinc-800">#{bookingId}</span>.
                </p>
              </div>

              <div className="bg-emerald-50/50 border border-emerald-100/80 rounded-2xl p-4 max-w-sm mx-auto text-left space-y-2 text-xs text-emerald-800">
                <p className="font-bold flex items-center gap-1.5">
                  <Clock size={13} /> Lapsos de validación:
                </p>
                <ul className="list-disc pl-4 space-y-1 font-medium">
                  <li>Lunes a Domingo (9:00 AM — 9:00 PM): 10 a 15 minutos.</li>
                  <li>Fuera de horario: Se validará a primera hora del día siguiente.</li>
                </ul>
              </div>

              {uploadedUrl && (
                <div className="pt-2">
                  <a 
                    href={`https://wa.me/529581168698?text=Hola,%20acabo%20de%20subir%20el%20comprobante%20de%20mi%20reserva%20${bookingId}.%20Puedes%20verlo%20aquí:%20${encodeURIComponent(uploadedUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-[#25D366] text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-[#20ba5a] active:scale-95 transition-all shadow-md"
                  >
                    <MessageSquare size={14} />
                    Notificar por WhatsApp
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Footer help */}
          <div className="pt-2 border-t border-zinc-100 flex items-center justify-center gap-2 text-zinc-400 text-xs font-semibold">
            <HelpCircle size={13} />
            ¿Necesitas ayuda? 
            <a 
              href="https://wa.me/529581168698" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-zinc-650 hover:text-zinc-800 underline transition-colors"
            >
              Contactar Soporte
            </a>
          </div>

        </div>
      </div>
    </div>
  );
}
