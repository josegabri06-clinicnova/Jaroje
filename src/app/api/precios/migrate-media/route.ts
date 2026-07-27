import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const mediaPrices: Record<string, number> = {
  '679077': 1597, // Doble (directo 1900)
  '679087': 2269, // Apto 1 (directo 2700)
  '679091': 3025, // Apto 2 (directo 3600)
  '679092': 4538, // Apto 3 (directo 5400)
  '679093': 6050  // Casa Vacacional (directo 7200)
};

export async function GET() {
  try {
    const { data: rules, error: fetchErr } = await supabase
      .from('pricing_rules')
      .select('*')
      .eq('rule_type', 'seasonal');

    if (fetchErr) throw fetchErr;

    let updatedCount = 0;
    for (const rule of (rules || [])) {
      const isMedia = rule.name && rule.name.toLowerCase().includes('media') && !rule.name.toLowerCase().includes('alta');
      if (isMedia && mediaPrices[rule.room_type_id]) {
        const targetPrice = mediaPrices[rule.room_type_id];
        const { error: updateErr } = await supabase
          .from('pricing_rules')
          .update({ price: targetPrice })
          .eq('id', rule.id);

        if (updateErr) throw updateErr;
        updatedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Se actualizaron ${updatedCount} reglas de Temporada Media con los precios correctos.`
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
