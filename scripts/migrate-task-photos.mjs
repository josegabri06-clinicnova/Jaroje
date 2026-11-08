/**
 * Migra las fotos antiguas de las tareas (guardadas como texto base64 dentro de la fila, columna `tasks.image_base64`)
 * al almacén `maintenance_photos`, dejando en la fila solo el enlace.
 *
 * Es seguro por diseño:
 *  - Por defecto NO cambia nada (modo de prueba): solo cuenta y enseña lo que haría. Para aplicar hay que pasar --apply.
 *  - Antes de modificar una fila guarda una copia local (task-photos-backup-<fecha>.json) con el valor original.
 *  - Cada foto se sube, se comprueba que el enlace público responde con el mismo tamaño y solo entonces se actualiza la fila.
 *  - Si algo falla en una fila, esa fila se deja intacta (las fotos ya subidas de esa fila se borran).
 *  - La actualización solo se aplica si la fila sigue igual que cuando se leyó (si alguien la editó mientras tanto, se salta).
 *  - Solo acepta imágenes JPG/PNG/WEBP/GIF reconocidas por su contenido; lo demás se deja como está.
 *
 * Uso (con las variables de Vercel en .env.local, por ejemplo `vercel env pull .env.local`):
 *   node --env-file=.env.local scripts/migrate-task-photos.mjs                 -> prueba, no cambia nada
 *   node --env-file=.env.local scripts/migrate-task-photos.mjs --apply --limit=3  -> aplica solo a 3 tareas
 *   node --env-file=.env.local scripts/migrate-task-photos.mjs --apply          -> aplica a todas
 */
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';

const BUCKET = 'maintenance_photos';
const apply = process.argv.includes('--apply');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1], 10) || 0) : Infinity;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (usa --env-file=.env.local).');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/** Tipo real de la imagen por su contenido (no por lo que diga el texto) */
function sniff(bytes) {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { ext: 'png', mime: 'image/png' };
  if (bytes.length > 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  if (bytes.length > 6 && bytes.toString('latin1', 0, 4) === 'GIF8') return { ext: 'gif', mime: 'image/gif' };
  return null;
}

/** Interpreta el valor de la columna: un texto suelto o una lista JSON de textos */
function parseValue(raw) {
  const v = String(raw).trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    const arr = JSON.parse(v);
    if (!Array.isArray(arr) || arr.some((x) => typeof x !== 'string')) throw new Error('lista no válida');
    return { list: arr, wasArray: true };
  }
  return { list: [v], wasArray: false };
}

async function migrateRow(row) {
  const original = row.image_base64;
  let parsed;
  try { parsed = parseValue(original); } catch (e) { return { status: 'saltada', why: 'valor no interpretable: ' + e.message }; }

  const uploaded = []; // rutas subidas, para borrarlas si la fila falla
  const out = [];
  let bytesTotal = 0;
  for (let i = 0; i < parsed.list.length; i++) {
    const item = parsed.list[i];
    if (!item.startsWith('data:image/')) { out.push(item); continue; } // ya es un enlace
    const m = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i.exec(item);
    if (!m) return await fail(uploaded, 'una foto no tiene formato data URL válido');
    const bytes = Buffer.from(m[1].replace(/\s/g, ''), 'base64');
    const type = sniff(bytes);
    if (!type) return await fail(uploaded, 'una foto no es JPG/PNG/WEBP/GIF por su contenido');
    bytesTotal += bytes.length;
    if (!apply) { out.push('(se subiría)'); continue; }

    const path = `legacy/${row.id}_${i}_${crypto.randomUUID().slice(0, 8)}.${type.ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: type.mime, upsert: false });
    if (error) return await fail(uploaded, 'error al subir: ' + error.message);
    uploaded.push(path);
    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const head = await fetch(publicUrl, { method: 'HEAD' }).catch(() => null);
    if (!head || !head.ok || Number(head.headers.get('content-length')) !== bytes.length) {
      return await fail(uploaded, 'el enlace público no responde con el mismo tamaño');
    }
    out.push(publicUrl);
  }
  if (bytesTotal === 0) return await fail(uploaded, 'no contiene ninguna foto en texto que migrar');
  if (!apply) return { status: 'prueba', fotos: out.filter((x) => x === '(se subiría)').length, bytes: bytesTotal };

  const newValue = parsed.wasArray ? JSON.stringify(out) : out[0];
  // Solo se actualiza si la fila sigue exactamente igual que cuando se leyó
  const { data, error } = await supabase.from('tasks').update({ image_base64: newValue }).eq('id', row.id).eq('image_base64', original).select('id');
  if (error || !data || data.length !== 1) {
    return await fail(uploaded, error ? 'error al actualizar: ' + error.message : 'la fila cambió mientras se migraba');
  }
  return { status: 'migrada', fotos: uploaded.length, bytes: bytesTotal };
}

async function fail(uploaded, why) {
  if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded).catch(() => {});
  return { status: 'saltada', why };
}

// ── Lectura por páginas (las filas pesan; así no se carga todo de golpe) ─────────────────────────────────────────
const rows = [];
for (let from = 0; rows.length < limit; from += 25) {
  const { data, error } = await supabase.from('tasks').select('id, image_base64').like('image_base64', '%data:image/%').order('created_at', { ascending: true }).range(from, from + 24);
  if (error) { console.error('Error leyendo tareas:', error.message); process.exit(1); }
  if (!data || data.length === 0) break;
  rows.push(...data);
  if (data.length < 25) break;
}
const todo = rows.slice(0, limit);
console.log(`${apply ? 'APLICANDO' : 'PRUEBA (no cambia nada)'} · tareas con foto en texto: ${todo.length}${limit !== Infinity ? ` (límite ${limit})` : ''}`);
if (todo.length === 0) process.exit(0);

if (apply) {
  const file = `task-photos-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(file, JSON.stringify(todo.map((r) => ({ id: r.id, image_base64: r.image_base64 }))));
  console.log(`Copia de seguridad guardada en ${file} (guárdala hasta comprobar que todo va bien).`);
}

const resumen = { migrada: 0, prueba: 0, saltada: 0 };
let fotos = 0, bytes = 0;
for (const row of todo) {
  const r = await migrateRow(row);
  resumen[r.status]++;
  fotos += r.fotos || 0; bytes += r.bytes || 0;
  console.log(`${r.status.padEnd(8)} ${row.id}` + (r.status === 'saltada' ? `  -> ${r.why}` : `  (${r.fotos} foto(s), ${(r.bytes / 1024).toFixed(0)} KB)`));
}
console.log(`\nResumen: ${JSON.stringify(resumen)} · ${fotos} foto(s) · ${(bytes / 1024 / 1024).toFixed(2)} MB`);
if (!apply) console.log('Esto era una prueba. Para aplicar: añade --apply (empieza con --limit=3).');
