const fs = require('fs');

const content = fs.readFileSync('inventario_temp.csv', 'utf-8');
const lines = content.split(/\r?\n|\r/);

let sql = `-- Eliminar inventario de prueba
DELETE FROM public.inventory;

-- Insertar inventario real
INSERT INTO public.inventory (item_name, category, stock, min_stock) VALUES
`;

const values = [];

for (const line of lines) {
  if (!line.trim()) continue;
  
  const cols = line.split(';');
  const producto = cols[4]?.trim();
  let stock = parseInt(cols[5]);
  let minStock = parseInt(cols[6]);

  // Si no es un producto válido o no tiene números, saltar
  if (!producto || producto === 'PRODUCTO' || isNaN(stock) || isNaN(minStock)) {
    continue;
  }

  // Escapar comillas simples
  const cleanProducto = producto.replace(/'/g, "''");

  // Asignar categoría basada en palabras clave
  let category = 'otro';
  const lowerProd = cleanProducto.toLowerCase();
  
  if (lowerProd.includes('toalla') || lowerProd.includes('sabana') || lowerProd.includes('funda') || lowerProd.includes('almohada') || lowerProd.includes('cobertor') || lowerProd.includes('tapete') || lowerProd.includes('rodapie') || lowerProd.includes('cortina') || lowerProd.includes('cojin')) {
    category = 'blancos';
  } else if (lowerProd.includes('jabon') || lowerProd.includes('shampoo') || lowerProd.includes('papel') || lowerProd.includes('costurero') || lowerProd.includes('gorra') || lowerProd.includes('kit') || lowerProd.includes('amenidad') || lowerProd.includes('cafe') || lowerProd.includes('azucar') || lowerProd.includes('crema') || lowerProd.includes('te ') || lowerProd.includes('vaso') || lowerProd.includes('plato') || lowerProd.includes('cuchara') || lowerProd.includes('tenedor') || lowerProd.includes('cuchillo')) {
    category = 'amenidades';
  } else if (lowerProd.includes('cloro') || lowerProd.includes('limpiador') || lowerProd.includes('escoba') || lowerProd.includes('trapeador') || lowerProd.includes('fibra') || lowerProd.includes('bolsa') || lowerProd.includes('detergente') || lowerProd.includes('suavizante') || lowerProd.includes('aroma') || lowerProd.includes('acido') || lowerProd.includes('desinfectante') || lowerProd.includes('cepillo') || lowerProd.includes('esponja')) {
    category = 'limpieza';
  } else if (lowerProd.includes('agua') || lowerProd.includes('refresco') || lowerProd.includes('coca') || lowerProd.includes('jugo')) {
    category = 'bebidas';
  }

  values.push(`('${cleanProducto}', '${category}', ${stock}, ${minStock})`);
}

if (values.length === 0) {
  console.log('No valid products found.');
} else {
  sql += values.join(',\n') + ';';
  fs.writeFileSync('import_inventory.sql', sql);
  console.log(`Procesados ${values.length} artículos.`);
}
