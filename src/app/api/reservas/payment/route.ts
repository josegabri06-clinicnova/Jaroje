import { NextResponse } from 'next/server';

// ─── AUTO-REFRESH DE TOKEN BEDS24 ─────────────────────────────────────────
async function getBeds24Token(): Promise<string> {
  const tempToken = process.env.BEDS24_TEMP_TOKEN;
  const refreshToken = process.env.BEDS24_REFRESH_TOKEN;

  if (!refreshToken) throw new Error('Falta BEDS24_REFRESH_TOKEN en .env');

  // Primero intenta el token temporal actual
  if (tempToken) {
    const probe = await fetch('https://api.beds24.com/v2/bookings?limit=1', {
      headers: { 'token': tempToken },
      cache: 'no-store'
    });
    if (probe.ok || probe.status === 404) return tempToken; // funciona
  }

  // Si está caducado o no existe, usa el refresh token para obtener uno nuevo
  const refreshRes = await fetch('https://api.beds24.com/v2/authentication/token', {
    method: 'GET',
    headers: { 'refreshToken': refreshToken },
    cache: 'no-store'
  });
  const refreshData = await refreshRes.json();

  if (!refreshData.token) {
    throw new Error('TOKEN_EXPIRED');
  }

  // Actualizar en memoria para esta instancia del servidor
  process.env.BEDS24_TEMP_TOKEN = refreshData.token;
  if (refreshData.refreshToken) {
    process.env.BEDS24_REFRESH_TOKEN = refreshData.refreshToken;
  }

  return refreshData.token;
}

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
