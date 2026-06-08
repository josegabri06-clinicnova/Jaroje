import { NextResponse } from 'next/server';
import { getBeds24Token } from '@/lib/beds24';

// POST: Registrar un cobro/pago en Beds24 asociado a una reserva
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { bookId, amount, paymentMethod, employeeNum, description: customDescription } = body;

    if (!bookId || !amount || !paymentMethod) {
      return NextResponse.json({ 
        success: false, 
        error: 'Faltan parámetros: bookId, amount, paymentMethod' 
      }, { status: 400 });
    }

    const BEDS24_TOKEN = await getBeds24Token();

    // Estructurar el pago según la especificación contable de Beds24 API v2:
    // - Las entradas de dinero (pagos recibidos) se mandan con qty = -1 y price = valor positivo.
    const description = customDescription || `Cobro Check-In ${paymentMethod.toUpperCase()}${employeeNum ? ` (Operador: ${employeeNum})` : ''} [Jaroje OS]`;

    const beds24Response = await fetch('https://api.beds24.com/v2/bookings', {
      method: 'POST',
      headers: { 
        'token': BEDS24_TOKEN, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify([{
        bookId: Number(bookId),
        invoiceItems: [
          {
            description: description,
            qty: -1,
            price: Number(amount)
          }
        ]
      }])
    });

    if (!beds24Response.ok) {
      const errText = await beds24Response.text();
      throw new Error(`Beds24 rechazó la transacción: ${errText}`);
    }

    const dataB24 = await beds24Response.json();

    return NextResponse.json({ 
      success: true, 
      message: "Pago sincronizado con Beds24.", 
      data: dataB24 
    });

  } catch (err: any) {
    console.error("Error registrando pago en Beds24:", err);
    return NextResponse.json({ 
      success: false, 
      error: err.message || 'Error interno del servidor' 
    }, { status: 500 });
  }
}
