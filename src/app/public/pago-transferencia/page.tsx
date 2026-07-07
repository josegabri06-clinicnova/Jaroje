'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
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

const TRANSLATIONS: Record<'es' | 'en', any> = {
  es: {
    portalTitle: 'Jaroje Condominios',
    pageTitle: 'Pago por Transferencia',
    securePortal: 'Portal Seguro',
    step1: '1. Transferencia',
    step2: '2. Comprobante',
    step3: '3. Verificación',
    totalToTransfer: 'Total a transferir',
    bookingLabel: 'Reserva',
    loadingAccount: 'Cargando datos de transferencia...',
    transferDataTitle: 'Datos de Transferencia',
    bankLabel: 'Banco',
    beneficiaryLabel: 'Beneficiario',
    platformLabel: 'Plataforma de Pago',
    accountNumberLabel: 'Número de Cuenta',
    clabeLabel: 'CLABE Interbancaria',
    conceptLabel: 'Concepto de Pago (Obligatorio)',
    uploadReceiptTitle: 'Subir Comprobante',
    uploadingText: 'Comprimiendo y subiendo...',
    pleaseWait: 'Espera un momento, por favor.',
    selectOrTakePhoto: 'Selecciona o toma foto del comprobante',
    supportFiles: 'Soporta imágenes (JPG, PNG) y PDF',
    receiptSubmitted: '¡Comprobante Enviado!',
    successDescription: (bookingId: string) => `Hemos recibido tu comprobante de transferencia con éxito para la reserva #${bookingId}.`,
    validationTimesTitle: 'Lapsos de validación:',
    validationTime1: 'Lunes a Domingo (9:00 AM — 9:00 PM): 10 a 15 minutos.',
    validationTime2: 'Fuera de horario: Se validará a primera hora del día siguiente.',
    notifyWhatsapp: 'Notificar por WhatsApp',
    needHelp: '¿Necesitas ayuda? ',
    contactSupport: 'Contactar Soporte',
    copyAccount: 'Copiar Cuenta',
    copyClabe: 'Copiar CLABE',
    copyConcept: 'Copiar Concepto',
  },
  en: {
    portalTitle: 'Condominios Jaroje',
    pageTitle: 'Payment by Bank Transfer',
    securePortal: 'Secure Portal',
    step1: '1. Transfer',
    step2: '2. Receipt',
    step3: '3. Verification',
    totalToTransfer: 'Total to transfer',
    bookingLabel: 'Reservation',
    loadingAccount: 'Loading transfer details...',
    transferDataTitle: 'Transfer Details',
    bankLabel: 'Bank',
    beneficiaryLabel: 'Beneficiary',
    platformLabel: 'Payment Platform',
    accountNumberLabel: 'Account Number',
    clabeLabel: 'Interbank CLABE',
    conceptLabel: 'Payment Reference (Required)',
    uploadReceiptTitle: 'Upload Receipt',
    uploadingText: 'Compressing and uploading...',
    pleaseWait: 'Please wait a moment.',
    selectOrTakePhoto: 'Select or take a photo of the receipt',
    supportFiles: 'Supports images (JPG, PNG) and PDF',
    receiptSubmitted: 'Receipt Submitted!',
    successDescription: (bookingId: string) => `We have successfully received your transfer receipt for reservation #${bookingId}.`,
    validationTimesTitle: 'Verification turnaround times:',
    validationTime1: 'Monday to Sunday (9:00 AM — 9:00 PM): 10 to 15 minutes.',
    validationTime2: 'After hours: Will be validated first thing the next morning.',
    notifyWhatsapp: 'Notify on WhatsApp',
    needHelp: 'Need help? ',
    contactSupport: 'Contact Support',
    copyAccount: 'Copy Account Number',
    copyClabe: 'Copy CLABE',
    copyConcept: 'Copy Reference',
  }
};

export default function PagoTransferenciaPage() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('bookingId') || searchParams.get('id') || '';
  const rawAmount = searchParams.get('amount') || '';
  const name = searchParams.get('name') || '';
  const email = searchParams.get('email') || '';

  const lang = (searchParams.get('lang') || 'es') as 'es' | 'en';
  const method = searchParams.get('method') || '';
  const t = TRANSLATIONS[lang] || TRANSLATIONS.es;

  const [amount, setAmount] = useState<number>(0);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const [transferAccount, setTransferAccount] = useState<string>('santander');
  const [loadingAccount, setLoadingAccount] = useState<boolean>(true);

  useEffect(() => {
    if (rawAmount) {
      const parsed = parseFloat(rawAmount);
      if (!isNaN(parsed)) {
        setAmount(parsed);
      }
    }
  }, [rawAmount]);

  useEffect(() => {
    if (!bookingId) {
      setLoadingAccount(false);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('booking_portal_settings')
          .select('transfer_account')
          .eq('booking_id', String(bookingId))
          .maybeSingle();
        if (!error && data) {
          setTransferAccount(data.transfer_account || 'santander');
        }
      } catch (err) {
        console.error("Error loading transfer settings:", err);
      } finally {
        setLoadingAccount(false);
      }
    })();
  }, [bookingId]);

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

  const allAccounts: Record<string, { banco: string; titular: string; cuenta?: string; clabe?: string; url?: string; isLink?: boolean; description?: string }> = {
    santander: {
      banco: 'SANTANDER',
      titular: 'Laura Isabel Corral Dovalina',
      cuenta: '60628351140',
      clabe: '014060606283511403'
    },
    banamex: {
      banco: 'BANAMEX',
      titular: 'Rolando Diaz Ceballos',
      cuenta: '70042002214',
      clabe: '002634700420022141'
    },
    hsbc: {
      banco: 'HSBC',
      titular: 'Rolando Diaz Ceballos',
      cuenta: '70042002214',
      clabe: '002634700420022141'
    },
    wise: {
      banco: 'WISE USD',
      titular: 'Rolando Diaz Ceballos',
      url: 'https://wise.com/pay/me/rolandod148',
      isLink: true,
      description: lang === 'en'
        ? 'Please make your payment in US Dollars (USD) via the Wise secure platform.'
        : 'Por favor, realiza tu pago en dólares americanos (USD) a través de la plataforma segura de Wise.'
    },
    paypal: {
      banco: 'PAYPAL USD',
      titular: 'Live Huatulco',
      url: 'https://www.paypal.me/livehuatulco',
      isLink: true,
      description: lang === 'en'
        ? 'Please make your payment in US Dollars (USD) via the PayPal secure platform.'
        : 'Por favor, realiza tu pago en dólares americanos (USD) a través de la plataforma segura de PayPal.'
    }
  };

  const activeAccount = allAccounts[transferAccount] || allAccounts.santander;

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
        formData.append('notes', method === 'mercadopago' ? '[Plataforma: Mercado Pago]' : `[Banco Destino: ${activeAccount.banco}]`);
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

  return (
    <div className="min-h-screen bg-[#F6F5F2] flex flex-col items-center justify-center p-4 font-sans select-none">
      <div className="w-full max-w-md bg-white rounded-3xl border border-zinc-200/80 shadow-xl overflow-hidden">
        
        {/* Top Header */}
        <div className="bg-[#18181b] px-6 py-5 text-white flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{t.portalTitle}</span>
            <h2 className="text-lg font-bold">{method === 'mercadopago' ? (lang === 'en' ? 'Mercado Pago Receipt' : 'Comprobante Mercado Pago') : t.pageTitle}</h2>
          </div>
          <div className="bg-[#25D366] text-[10px] font-black px-2.5 py-1 rounded-full uppercase text-zinc-950 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-950 animate-ping"></span>
            {t.securePortal}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Progress Indicator */}
          <div className="flex items-center justify-between px-2 text-[11px] font-bold text-zinc-400 uppercase tracking-wide">
            <span className="text-blue-600">{method === 'mercadopago' ? (lang === 'en' ? '1. Card Payment' : '1. Pago Tarjeta') : t.step1}</span>
            <ArrowRight size={12} className="text-zinc-300" />
            <span className={success ? "text-blue-600" : ""}>{t.step2}</span>
            <ArrowRight size={12} className="text-zinc-300" />
            <span className={success ? "text-emerald-600" : ""}>{t.step3}</span>
          </div>

          {!success ? (
            <>
              {/* Payment Summary */}
              <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{t.totalToTransfer}</p>
                  <p className="text-2xl font-black text-zinc-950 mt-0.5">
                    ${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-bold text-zinc-500">MXN</span>
                  </p>
                </div>
                {bookingId && (
                  <div className="text-right">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{t.bookingLabel}</p>
                    <p className="text-sm font-black text-zinc-900 mt-0.5">#{bookingId}</p>
                  </div>
                )}
              </div>

              {/* Bank Details Card */}
              {method === 'mercadopago' ? (
                <div className="space-y-3.5">
                  <h3 className="text-[12px] font-extrabold text-[#00A650] uppercase tracking-wider px-1">
                    {lang === 'en' ? 'Mercado Pago Confirmation' : 'Confirmación Mercado Pago'}
                  </h3>
                  
                  <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 space-y-4 shadow-sm text-left">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-zinc-100">
                      <div className="w-8 h-8 rounded-full bg-[#00A650]/10 flex items-center justify-center text-[#00A650]">
                        <CheckCircle2 size={16} />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase block">{lang === 'en' ? 'Payment Method' : 'Método de Pago'}</span>
                        <p className="text-sm font-extrabold text-zinc-900">Mercado Pago (Tarjeta/OXXO)</p>
                      </div>
                    </div>
                    
                    <p className="text-xs text-zinc-650 leading-relaxed">
                      {lang === 'en' 
                        ? 'Please upload the screenshot or receipt of your transaction made on Mercado Pago. We will verify the transaction and confirm your booking.' 
                        : 'Por favor, sube la captura de pantalla o comprobante de tu pago en Mercado Pago. Validaremos la transacción para confirmar tu reservación.'}
                    </p>
                  </div>
                </div>
              ) : loadingAccount ? (
                <div className="bg-white border border-zinc-200/80 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 shadow-sm">
                  <Loader2 className="animate-spin text-indigo-600" size={24} />
                  <p className="text-xs font-bold text-zinc-500">{t.loadingAccount}</p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  <h3 className="text-[12px] font-extrabold text-zinc-400 uppercase tracking-wider px-1">{t.transferDataTitle}</h3>
                  
                  <div className="bg-white border border-zinc-200/80 rounded-2xl p-4.5 space-y-3.5 shadow-sm">
                    
                    {/* Banco */}
                    <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                      <div className="text-left">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase block">{t.bankLabel}</span>
                        <p className="text-sm font-bold text-zinc-900">{activeAccount.banco}</p>
                      </div>
                    </div>

                    {/* Beneficiario */}
                    <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                      <div className="text-left">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase block">{t.beneficiaryLabel}</span>
                        <p className="text-sm font-bold text-zinc-900">{activeAccount.titular}</p>
                      </div>
                    </div>

                    {/* Enlace de Pago Seguro (Wise/PayPal) */}
                    {activeAccount.isLink && (
                      <div className="flex flex-col gap-2 border-b border-zinc-100 pb-3">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase text-left">{t.platformLabel}</span>
                        <p className="text-[11px] text-zinc-500 italic text-left">{activeAccount.description}</p>
                        <a
                          href={activeAccount.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full bg-[#00A650] hover:bg-[#008f43] text-white font-bold text-xs py-2.5 rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-1 animate-pulse"
                        >
                          <span>{lang === 'en' ? `Pay with ${activeAccount.banco} ↗` : `Pagar en ${activeAccount.banco} ↗`}</span>
                        </a>
                      </div>
                    )}

                    {/* Cuenta */}
                    {!activeAccount.isLink && activeAccount.cuenta && (
                      <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                        <div className="text-left">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase block">{t.accountNumberLabel}</span>
                          <p className="text-sm font-black text-zinc-950 tracking-wider font-mono">{activeAccount.cuenta}</p>
                        </div>
                        <button 
                          onClick={() => copyToClipboard(activeAccount.cuenta!, 'cuenta')}
                          className="w-8 h-8 flex items-center justify-center bg-zinc-50 border border-zinc-200 rounded-lg hover:bg-zinc-100 transition-colors"
                          title={t.copyAccount}
                        >
                          {copiedField === 'cuenta' ? (
                            <Check size={14} className="text-emerald-600" />
                          ) : (
                            <Copy size={14} className="text-zinc-500" />
                          )}
                        </button>
                      </div>
                    )}

                    {/* CLABE */}
                    {!activeAccount.isLink && activeAccount.clabe && (
                      <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                        <div className="text-left">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase block">{t.clabeLabel}</span>
                          <p className="text-sm font-black text-zinc-950 tracking-wider font-mono">{activeAccount.clabe}</p>
                        </div>
                        <button 
                          onClick={() => copyToClipboard(activeAccount.clabe!, 'clabe')}
                          className="w-8 h-8 flex items-center justify-center bg-zinc-50 border border-zinc-200 rounded-lg hover:bg-zinc-100 transition-colors"
                          title={t.copyClabe}
                        >
                          {copiedField === 'clabe' ? (
                            <Check size={14} className="text-emerald-600" />
                          ) : (
                            <Copy size={14} className="text-zinc-500" />
                          )}
                        </button>
                      </div>
                    )}

                    {/* Concepto */}
                    <div className="flex items-center justify-between">
                      <div className="text-left">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase block">{t.conceptLabel}</span>
                        <p className="text-sm font-black text-zinc-950 font-mono">{bookingId || 'ID de la reserva'}</p>
                      </div>
                      <button 
                        onClick={() => copyToClipboard(String(bookingId), 'concepto')}
                        className="w-8 h-8 flex items-center justify-center bg-zinc-50 border border-zinc-200 rounded-lg hover:bg-zinc-100 transition-colors"
                        title={t.copyConcept}
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
              )}

              {/* Uploader Section */}
              <div className="space-y-3.5">
                <h3 className="text-[12px] font-extrabold text-zinc-400 uppercase tracking-wider px-1">{t.uploadReceiptTitle}</h3>
                
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
                        <p className="text-sm font-bold text-zinc-800">{t.uploadingText}</p>
                        <p className="text-[11px] text-zinc-400 mt-1">{t.pleaseWait}</p>
                      </>
                    ) : (
                      <>
                        <Upload className="text-zinc-400 mb-2.5" size={32} />
                        <p className="text-sm font-bold text-zinc-800">{t.selectOrTakePhoto}</p>
                        <p className="text-[11px] text-zinc-400 mt-1">{t.supportFiles}</p>
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
                <h3 className="text-xl font-bold text-zinc-950">{t.receiptSubmitted}</h3>
                <p className="text-xs text-zinc-500 max-w-xs mx-auto leading-relaxed">
                  {lang === 'en' ? 'We have successfully received your transfer receipt for reservation ' : 'Hemos recibido tu comprobante de transferencia con éxito para la reserva '}
                  <span className="font-bold text-zinc-800">#{bookingId}</span>.
                </p>
              </div>

              <div className="bg-emerald-50/50 border border-emerald-100/80 rounded-2xl p-4 max-w-sm mx-auto text-left space-y-2 text-xs text-emerald-800">
                <p className="font-bold flex items-center gap-1.5">
                  <Clock size={13} /> {t.validationTimesTitle}
                </p>
                <ul className="list-disc pl-4 space-y-1 font-medium">
                  <li>{t.validationTime1}</li>
                  <li>{t.validationTime2}</li>
                </ul>
              </div>

              {uploadedUrl && (
                <div className="pt-2">
                  <a 
                    href={`https://wa.me/529581168698?text=${encodeURIComponent(
                      lang === 'en'
                        ? `Hi, I just uploaded the bank transfer receipt for my reservation #${bookingId}. You can view it here: ${uploadedUrl}`
                        : `Hola, acabo de subir el comprobante de mi reserva #${bookingId}. Puedes verlo aquí: ${uploadedUrl}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-[#25D366] text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-[#20ba5a] active:scale-95 transition-all shadow-md"
                  >
                    <MessageSquare size={14} />
                    {t.notifyWhatsapp}
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Footer help */}
          <div className="pt-2 border-t border-zinc-100 flex items-center justify-center gap-2 text-zinc-400 text-xs font-semibold">
            <HelpCircle size={13} />
            {t.needHelp}
            <a 
              href="https://wa.me/529581168698" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-zinc-650 hover:text-zinc-800 underline transition-colors"
            >
              {t.contactSupport}
            </a>
          </div>

        </div>
      </div>
    </div>
  );
}
