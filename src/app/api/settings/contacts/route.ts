import { NextResponse } from 'next/server';
import {
  getExcludedContacts,
  savePersonalContact,
  removePersonalContact,
  bulkImportPersonalContacts,
  extract10Digits
} from '@/lib/personal-contacts';
import { getSessionFromRequest } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * GET: Devuelve la lista completa de contactos excluidos del bot
 */
export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized: Privilegios de administrador requeridos.' }, { status: 403 });
    }

    const contacts = await getExcludedContacts(true);
    return NextResponse.json({
      success: true,
      contacts,
      total: contacts.length
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST: Guarda un contacto personal o procesa importación masiva (.vcf / .csv)
 */
export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized: Privilegios de administrador requeridos.' }, { status: 403 });
    }

    const body = await req.json();

    // Importación masiva (array de contactos)
    if (Array.isArray(body.contacts)) {
      const res = await bulkImportPersonalContacts(body.contacts);
      return NextResponse.json({
        success: true,
        message: `Se importaron ${res.added} contactos personales con éxito.`,
        added: res.added,
        total: res.total
      });
    }

    // Contacto individual
    const { phone, name, notes } = body;
    if (!phone || extract10Digits(phone).length < 10) {
      return NextResponse.json({
        success: false,
        error: 'El teléfono debe contener al menos 10 dígitos.'
      }, { status: 400 });
    }

    const saved = await savePersonalContact({
      phone,
      name: name || 'Contacto Personal',
      notes
    });

    if (!saved) {
      return NextResponse.json({ success: false, error: 'Error guardando en Supabase' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Contacto personal guardado con éxito.'
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * DELETE: Elimina un contacto personal por teléfono
 */
export async function DELETE(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized: Privilegios de administrador requeridos.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone');
    if (!phone) {
      return NextResponse.json({ success: false, error: 'Parámetro phone requerido' }, { status: 400 });
    }

    const removed = await removePersonalContact(phone);
    if (!removed) {
      return NextResponse.json({ success: false, error: 'No se pudo eliminar el contacto' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Contacto personal eliminado con éxito.'
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
