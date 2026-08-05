"use client";

import { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw, Check } from 'lucide-react';

interface CameraModalProps {
  onCapture: (file: File, base64: string) => void;
  onClose: () => void;
  title?: string;
}

export default function CameraModal({ onCapture, onClose, title = "Tomar Foto" }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Iniciar la cámara
  const startCamera = async () => {
    setIsLoading(true);
    setError(null);
    setCapturedImage(null);

    // Detener cualquier stream anterior
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    try {
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' }, // Cámara trasera idealmente
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.error("Error playing video:", e));
      }
      setIsLoading(false);
    } catch (err: any) {
      console.error("Camera access error:", err);
      setError(
        err.name === 'NotAllowedError' 
          ? "No se otorgaron permisos para acceder a la cámara." 
          : "No se pudo iniciar la cámara en este dispositivo."
      );
      setIsLoading(false);
    }
  };

  useEffect(() => {
    startCamera();

    // Limpiar al desmontar
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Capturar el cuadro actual del video
  const capturePhoto = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Dibujar la imagen del video en el lienzo
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedImage(dataUrl);

      // Detener la cámara para ahorrar recursos
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  // Confirmar y subir la foto
  const handleConfirm = () => {
    if (!capturedImage) return;

    // Convertir base64 dataURL a un archivo real
    try {
      const arr = capturedImage.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      
      const fileName = `captura_${Date.now()}.jpg`;
      const file = new File([u8arr], fileName, { type: mime });
      
      onCapture(file, capturedImage);
    } catch (e) {
      console.error("Error creating File from base64:", e);
      alert("Error al procesar la captura.");
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-black animate-in fade-in duration-200">
      {/* Cabecera */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur text-white z-10">
        <span className="text-[14px] font-bold tracking-wider uppercase">{title}</span>
        <button 
          onClick={onClose} 
          className="w-9 h-9 bg-zinc-800 active:scale-95 text-white flex items-center justify-center rounded-full transition-all cursor-pointer shadow-sm"
        >
          <X size={18} strokeWidth={2.5} />
        </button>
      </div>

      {/* Contenedor del Visor */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-400 bg-zinc-950">
            <RefreshCw className="w-8 h-8 animate-spin" />
            <span className="text-xs font-semibold">Iniciando cámara...</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-zinc-400 bg-zinc-950 gap-4">
            <span className="text-sm font-semibold text-rose-500">⚠️ {error}</span>
            <button 
              onClick={startCamera}
              className="py-2.5 px-5 bg-zinc-800 hover:bg-zinc-700 active:scale-98 rounded-xl text-xs font-bold text-white transition-all cursor-pointer shadow-md"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Video en vivo */}
        {!capturedImage && !error && (
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover max-w-md"
          />
        )}

        {/* Vista previa de la captura */}
        {capturedImage && (
          <img
            src={capturedImage}
            alt="Preview"
            className="w-full h-full object-cover max-w-md"
          />
        )}
      </div>

      {/* Panel de Controles inferior */}
      <div className="px-6 py-8 border-t border-zinc-900 bg-zinc-950 flex items-center justify-center z-10 gap-8">
        {!capturedImage && !error && !isLoading && (
          <button
            onClick={capturePhoto}
            className="w-18 h-18 bg-white hover:bg-zinc-150 active:scale-90 border-4 border-zinc-350 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xl"
            title="Tomar Foto"
          >
            <div className="w-13 h-13 bg-white border border-zinc-300 rounded-full flex items-center justify-center">
              <Camera className="w-6 h-6 text-zinc-800" />
            </div>
          </button>
        )}

        {capturedImage && (
          <div className="flex gap-4 w-full max-w-md">
            <button
              onClick={startCamera}
              className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-white font-extrabold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 text-[13px]"
            >
              <RefreshCw size={16} /> Reintentar
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-98 text-[13px]"
            >
              <Check size={16} /> Confirmar Foto
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
