const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const content = fs.readFileSync('inventario_temp.csv', 'utf-8');
  const lines = content.split(/\r?\n|\r/);
  const items = [];

  for (const line of lines) {
    if (!line.trim() || line.startsWith(';')) continue;
    
    const cols = line.split(';');
    
    // Validar que la primera columna parezca un código (empieza con letra y guión o M-)
    if (!cols[0].match(/^[A-Z0-9]+-/)) continue;

    const producto = cols[3]?.trim();
    let stock = parseInt(cols[4]);
    let minStock = parseInt(cols[5]);

    if (!producto || producto === 'PRODUCTO' || isNaN(stock) || isNaN(minStock)) continue;

    let category = 'otro';
    const lowerProd = producto.toLowerCase();
    
    if (lowerProd.includes('toalla') || lowerProd.includes('sabana') || lowerProd.includes('funda') || lowerProd.includes('almohada') || lowerProd.includes('cobertor') || lowerProd.includes('tapete') || lowerProd.includes('rodapie') || lowerProd.includes('cortina') || lowerProd.includes('cojin')) {
      category = 'blancos';
    } else if (lowerProd.includes('jabon') || lowerProd.includes('shampoo') || lowerProd.includes('papel') || lowerProd.includes('costurero') || lowerProd.includes('gorra') || lowerProd.includes('kit') || lowerProd.includes('amenidad') || lowerProd.includes('cafe') || lowerProd.includes('azucar') || lowerProd.includes('crema') || lowerProd.includes('te ') || lowerProd.includes('vaso') || lowerProd.includes('plato') || lowerProd.includes('cuchara') || lowerProd.includes('tenedor') || lowerProd.includes('cuchillo')) {
      category = 'amenidades';
    } else if (lowerProd.includes('cloro') || lowerProd.includes('limpiador') || lowerProd.includes('escoba') || lowerProd.includes('trapeador') || lowerProd.includes('fibra') || lowerProd.includes('bolsa') || lowerProd.includes('detergente') || lowerProd.includes('suavizante') || lowerProd.includes('aroma') || lowerProd.includes('acido') || lowerProd.includes('desinfectante') || lowerProd.includes('cepillo') || lowerProd.includes('esponja') || lowerProd.includes('pasta')) {
      category = 'limpieza';
    } else if (lowerProd.includes('agua') || lowerProd.includes('refresco') || lowerProd.includes('coca') || lowerProd.includes('jugo')) {
      category = 'bebidas';
    }

    items.push({ item_name: producto, category, stock, min_stock: minStock, last_updated_by: 'Admin Import' });
  }

  if (items.length > 0) {
    console.log(`Borrando inventario viejo...`);
    const { error: err1 } = await supabase.from('inventory').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (err1) console.error(err1);

    console.log(`Insertando ${items.length} artículos nuevos...`);
    // Insert in batches of 100
    for (let i = 0; i < items.length; i += 100) {
      const batch = items.slice(i, i + 100);
      const { error: err2 } = await supabase.from('inventory').insert(batch);
      if (err2) console.error(err2);
    }
    console.log('¡Importación completada!');
  } else {
    console.log('No se encontraron artículos válidos');
  }
}

run();
