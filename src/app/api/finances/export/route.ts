import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const timeFilter = searchParams.get('time') || 'todo'; // 'hoy' | 'semana' | 'mes' | 'todo'
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const searchFilter = searchParams.get('search') || '';
    const accountFilter = searchParams.get('account') || 'todo';

    // 1. Obtener los movimientos del libro contable (finances)
    let query = supabase
      .from('finances')
      .select('*, accounts(name)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    const { data: records, error } = await query;
    if (error) throw error;

    // 2. Filtrar los movimientos por rango de tiempo, por rango de fechas y por búsqueda de texto
    const today = new Date();
    const filtered = (records || []).filter(r => {
      // Filtrar por tiempo
      let matchTime = true;
      if (timeFilter !== 'todo') {
        const rDate = new Date(r.date + 'T00:00:00'); // Evitar problemas de huso horario
        if (timeFilter === 'hoy') {
          matchTime = rDate.toDateString() === today.toDateString();
        } else if (timeFilter === 'semana') {
          const lastWeek = new Date(today);
          lastWeek.setDate(lastWeek.getDate() - 7);
          matchTime = rDate >= lastWeek;
        } else if (timeFilter === 'mes') {
          matchTime = rDate.getMonth() === today.getMonth() && rDate.getFullYear() === today.getFullYear();
        }
      }

      // Filtrar por rango de fechas específico
      let matchDateRange = true;
      if (startDate) {
        matchDateRange = matchDateRange && (r.date >= startDate);
      }
      if (endDate) {
        matchDateRange = matchDateRange && (r.date <= endDate);
      }

      // Filtrar por búsqueda de texto
      let matchSearch = true;
      if (searchFilter.trim()) {
        const query = searchFilter.toLowerCase().trim();
        const desc = String(r.description || '').toLowerCase();
        const cat = String(r.category || '').toLowerCase();
        const amt = String(r.amount || '');
        const accountName = String(r.accounts?.name || '').toLowerCase();
        const dateStr = String(r.date || '');
        const typeStr = String(r.type || '').toLowerCase();

        matchSearch = desc.includes(query) || 
                      cat.includes(query) || 
                      amt.includes(query) || 
                      accountName.includes(query) ||
                      dateStr.includes(query) ||
                      typeStr.includes(query);
      }

      // Filtrar por cuenta
      let matchAccount = true;
      if (accountFilter && accountFilter !== 'todo') {
        matchAccount = r.account_id === accountFilter;
      }

      return matchTime && matchDateRange && matchSearch && matchAccount;
    });

    if (filtered.length === 0) {
      return new Response('No hay datos para exportar.', { status: 204 });
    }

    // 3. Formatear como CSV delimitado por punto y coma (Super compatible con Excel en Español)
    const headers = ["Fecha", "Tipo", "Categoria", "Monto", "Cuenta", "Descripcion"];
    const csvContent = [
      "sep=;", // Le indica a Excel que fuerce la separación por punto y coma
      headers.join(";"),
      ...filtered.map(r => {
        const rDate = r.date ? new Date(r.date + 'T00:00:00') : new Date(); // Evitar desfasamiento de zona horaria
        const dateStr = format(rDate, 'dd/MM/yyyy');
        const descStr = String(r.description || '').replace(/"/g, '""').replace(/;/g, ' ').replace(/\r?\n|\r/g, ' ');
        const catStr = String(r.category || '').replace(/"/g, '""').replace(/;/g, ' ');
        const accountName = r.accounts?.name || 'Desconocido';
        return [
          dateStr,
          r.type,
          `"${catStr}"`,
          r.amount,
          `"${accountName}"`,
          `"${descStr}"`
        ].join(";");
      })
    ].join("\n");

    const filename = `Finanzas_Jaroje_${format(new Date(), 'yyyy-MM-dd')}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      }
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
