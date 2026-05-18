"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2, Upload, Loader2, ShieldCheck, User, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function PreCheckinPage() {
  const { id } = useParams();
  const [reserva, setReserva] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchReserva = async () => {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('id', id)
        .single();
        
      if (data && !error) {
        setReserva(data);
      }
      setLoading(false);
    };

    if (id) {
      fetchReserva();
    }
  }, [id]);

  const handleUpload = async () => {
    if (!file || !reserva) return;
    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `precheckin_${reserva.id}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('guest_documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('guest_documents')
        .getPublicUrl(fileName);

      // Guardar como Pre Check-in
      const { error: insertError } = await supabase.from('checkins').insert([{
        reservation_id: reserva.id.toString(),
        guest_name: reserva.guest_name,
        room: reserva.room_name || 'Asignada en Recepción',
        check_in_date: reserva.check_in,
        check_out_date: reserva.check_out,
        status: 'pre_checkin',
        checked_in_by: 'Guest Online',
        document_url: publicUrlData.publicUrl
      }]);

      if (insertError) throw insertError;
      
      setSuccess(true);
    } catch (e) {
      console.error(e);
      alert('Hubo un error al procesar tu documento. Por favor, intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  if (!reserva) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#fafafa] text-center">
        <ShieldCheck size={48} className="text-zinc-300 mb-4" />
        <h1 className="text-xl font-bold text-zinc-900 mb-2">Reserva no encontrada</h1>
        <p className="text-zinc-500">El enlace es inválido o la reserva ha expirado.</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#fafafa] text-center">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 size={40} className="text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">¡Pre Check-in Completado!</h1>
        <p className="text-zinc-500 mb-8 max-w-sm">
          Hemos recibido tu documentación. Muestra este código QR en recepción a tu llegada para agilizar tu entrega de llaves.
        </p>
        
        <div className="bg-white p-6 rounded-3xl shadow-xl shadow-zinc-200/50 mb-8">
          <QRCodeSVG 
            value={typeof window !== 'undefined' ? `${window.location.origin}/reservas?scan=${reserva.id}` : `https://jaroje.com/reservas?scan=${reserva.id}`} 
            size={200} 
            className="mx-auto" 
          />
          <p className="text-xs font-mono font-bold text-zinc-400 mt-4 tracking-widest uppercase">ID: {reserva.id}</p>
        </div>

        <p className="text-sm font-semibold text-zinc-600">
          Nos vemos el {format(new Date(reserva.check_in + 'T12:00:00'), "d 'de' MMMM", { locale: es })}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col pb-12">
      {/* Header */}
      <div className="bg-zinc-900 pt-12 pb-24 px-6 rounded-b-[2.5rem]">
        <img src="/logo-jaroje.png" alt="Jaroje" className="h-8 brightness-0 invert opacity-90 mx-auto mb-8" />
        <h1 className="text-2xl font-bold text-white text-center mb-2">Pre Check-in Online</h1>
        <p className="text-zinc-400 text-center text-sm">Agiliza tu llegada a Jaroje Condominios</p>
      </div>

      {/* Main Card */}
      <div className="flex-1 px-6 -mt-16">
        <div className="bg-white rounded-3xl p-6 shadow-xl shadow-zinc-200/50 mb-6">
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-zinc-100">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shrink-0">
              <User size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Huésped Titular</p>
              <p className="text-lg font-bold text-zinc-900 leading-tight">{reserva.guest_name}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Llegada</p>
              <p className="text-sm font-semibold text-zinc-900">
                {format(new Date(reserva.check_in + 'T12:00:00'), 'dd MMM yyyy', { locale: es })}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Salida</p>
              <p className="text-sm font-semibold text-zinc-900">
                {format(new Date(reserva.check_out + 'T12:00:00'), 'dd MMM yyyy', { locale: es })}
              </p>
            </div>
          </div>

          <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-blue-900 mb-2 flex items-center gap-2">
              <ShieldCheck size={16} className="text-blue-600" /> Verificación de Identidad
            </h3>
            <p className="text-xs text-blue-800/80 mb-4 leading-relaxed">
              Por requerimientos legales, necesitamos una foto de tu identificación oficial (DNI o Pasaporte).
            </p>

            <div className="relative">
              <input 
                type="file" 
                accept="image/*"
                capture="environment"
                onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className={`w-full border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center transition-colors ${file ? 'border-blue-400 bg-blue-50' : 'border-blue-200 bg-white'}`}>
                {file ? (
                  <>
                    <CheckCircle2 size={24} className="text-blue-500 mb-2" />
                    <p className="text-xs font-semibold text-blue-700">{file.name}</p>
                    <p className="text-[10px] text-blue-500 mt-1">Toca para cambiar</p>
                  </>
                ) : (
                  <>
                    <Upload size={24} className="text-blue-400 mb-2" />
                    <p className="text-xs font-semibold text-blue-600">Tomar foto o subir archivo</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full bg-zinc-900 text-white font-bold text-[15px] py-4 rounded-2xl shadow-lg shadow-zinc-900/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
        >
          {uploading ? (
            <><Loader2 size={18} className="animate-spin" /> Procesando...</>
          ) : (
            <><QrCode size={18} /> Completar Pre Check-in</>
          )}
        </button>
      </div>
    </div>
  );
}
