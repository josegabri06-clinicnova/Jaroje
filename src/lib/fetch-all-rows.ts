/**
 * Lee TODAS las filas de una consulta por páginas. Supabase devuelve como máximo 1.000 filas por respuesta, sin avisar: una tabla que
 * pase de ahí (p. ej. los movimientos de Finanzas) llegaría recortada, y lo que se pierde es justo lo último del orden pedido.
 *
 * `page(from, to)` debe devolver la consulta ya con su orden y `.range(from, to)`. El orden tiene que ser estable (acabar en una columna
 * única como `id`) para que ninguna fila se repita ni se salte entre páginas. Si una página falla se devuelve el error y nada de datos
 * parciales: es preferible no mostrar nada que mostrar un libro incompleto como si fuera el completo.
 */
export async function fetchAllRows<T = unknown>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
  maxPages = 100
): Promise<{ data: T[] | null; error: unknown }> {
  const all: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const from = i * pageSize;
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) return { data: all, error: null };
  }
  return { data: null, error: new Error(`Demasiadas filas (más de ${maxPages * pageSize})`) };
}
