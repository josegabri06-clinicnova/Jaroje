import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { id, language } = await req.json();

    if (!id || !language) {
      return NextResponse.json({ error: 'Faltan parámetros obligatorios (id, language)' }, { status: 400 });
    }

    if (language !== 'es' && language !== 'en') {
      return NextResponse.json({ error: 'Idioma no soportado. Use es o en.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('booking_portal_settings')
      .upsert({
        booking_id: String(id),
        language: language
      });

    if (error) {
      console.error("[change-language] Error updating database:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Idioma cambiado exitosamente a ${language === 'es' ? 'Español' : 'Inglés'}.`,
      language
    });
  } catch (err: any) {
    console.error("[change-language] Request exception:", err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
