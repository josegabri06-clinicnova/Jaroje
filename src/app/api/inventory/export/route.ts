import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const searchFilter = searchParams.get('search') || '';
    const onlyLowStock = searchParams.get('onlyLowStock') === 'true';

    // 1. Obtener todos los artículos del inventario de la base de datos
    const { data: items, error } = await supabase
      .from('inventory')
      .select('*')
      .order('category', { ascending: true })
      .order('item_name', { ascending: true });

    if (error) throw error;

    // 2. Filtrar artículos según los filtros activos de búsqueda y stock bajo
    const filtered = (items || []).filter(item => {
      let matchSearch = true;
      if (searchFilter.trim()) {
        const query = searchFilter.toLowerCase().trim();
        const name = String(item.item_name || '').toLowerCase();
        const cat = String(item.category || '').toLowerCase();
        matchSearch = name.includes(query) || cat.includes(query);
      }

      let matchLowStock = true;
      if (onlyLowStock) {
        matchLowStock = (item.stock || 0) <= (item.min_stock || 0);
      }

      return matchSearch && matchLowStock;
    });

    if (filtered.length === 0) {
      return new Response('No hay datos para exportar.', { status: 204 });
    }

    // 3. Formatear como CSV delimitado por punto y coma (Super compatible con Excel en Español)
    const headers = ["Articulo", "Categoria", "Stock Actual", "Stock Minimo", "Ultima Actualizacion Por"];
    const csvContent = [
      "sep=;", // Le indica a Excel que fuerce la separación por punto y coma
      headers.join(";"),
      ...filtered.map(item => {
        const nameStr = String(item.item_name || '').replace(/"/g, '""').replace(/;/g, ' ');
        const catStr = String(item.category || '').replace(/"/g, '""').replace(/;/g, ' ');
        const lastUpdatedBy = String(item.last_updated_by || 'Desconocido').replace(/"/g, '""').replace(/;/g, ' ');
        return [
          `"${nameStr}"`,
          `"${catStr}"`,
          item.stock || 0,
          item.min_stock || 0,
          `"${lastUpdatedBy}"`
        ].join(";");
      })
    ].join("\n");

    const filename = `Inventario_Jaroje_${format(new Date(), 'yyyy-MM-dd')}.csv`;

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
