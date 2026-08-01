import { NextResponse } from 'next/server';
import { getBeds24Token } from '@/lib/beds24';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const token = await getBeds24Token();
    
    // Consultar las últimas 15 reservas de Beds24
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - 10);
    const arrivalFrom = fromDate.toISOString().split('T')[0];
    
    const res = await fetch(`https://api.beds24.com/v2/bookings?arrivalFrom=${arrivalFrom}&limit=15`, {
      headers: { 'token': token },
      cache: 'no-store'
    });
    
    if (!res.ok) {
      return NextResponse.json({ error: `Beds24 API returned status ${res.status}: ${await res.text()}` }, { status: res.status });
    }
    
    const json = await res.json();
    
    if (!json.data || json.data.length === 0) {
      return NextResponse.json({ message: "No bookings found in the last 10 days" });
    }
    
    // Mapear solo los campos clave de interés para cada reserva para depurar el país y teléfono
    const debugData = json.data.map((b: any) => {
      // Filtrar todas las llaves que contengan country, phone, mobile, address, guest
      const relatedKeys: Record<string, any> = {};
      Object.keys(b).forEach(k => {
        const lowerK = k.toLowerCase();
        if (
          lowerK.includes('country') || 
          lowerK.includes('phone') || 
          lowerK.includes('mobile') || 
          lowerK.includes('address') || 
          lowerK.includes('guest') ||
          lowerK.includes('first') ||
          lowerK.includes('last')
        ) {
          relatedKeys[k] = b[k];
        }
      });
      
      return {
        id: b.id,
        status: b.status,
        roomId: b.roomId,
        unitId: b.unitId,
        guestName: `${b.firstName || ''} ${b.lastName || ''}`.trim(),
        allRelatedKeys: relatedKeys
      };
    });
    
    return NextResponse.json({
      success: true,
      count: json.data.length,
      bookingsSample: debugData
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
