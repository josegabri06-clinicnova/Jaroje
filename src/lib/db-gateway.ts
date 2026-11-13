/**
 * PASARELA DE BASE DE DATOS: núcleo de decisiones (sin dependencias, para poder probarlo a fondo).
 *
 * Hoy varias páginas hablan directamente con Supabase desde el navegador usando la clave pública, que va dentro del código
 * que descarga cualquier visitante. La pasarela sustituye ese camino: la página sigue pidiendo los datos igual, pero la petición
 * viaja por /api/db, donde (1) se exige la sesión, (2) se decide por rol, tabla y operación qué se permite, y (3) solo entonces
 * el servidor la reenvía a Supabase con la clave de servicio, que nunca sale del servidor.
 *
 * Aquí está solo la parte que DECIDE. Es deliberadamente estricta:
 *  - lo que no está escrito en las tablas de abajo, está prohibido (tablas, operaciones, roles, claves de `settings`);
 *  - solo acepta el repertorio de consultas que usan las páginas hoy (sin or/and, rpc, rangos, comodines ni relaciones salvo una);
 *  - los cambios y borrados exigen siempre algún filtro, así que no hay actualizaciones ni borrados masivos por descuido.
 */

export type DbRole = 'admin' | 'recepcion' | 'staff_limpieza' | 'staff_mantenimiento';
export type DbOp = 'select' | 'insert' | 'update' | 'delete';

const ADMIN: DbRole[] = ['admin'];
const ADMIN_REC: DbRole[] = ['admin', 'recepcion'];
const STAFF: DbRole[] = ['staff_limpieza', 'staff_mantenimiento'];
const ADMIN_STAFF: DbRole[] = [...ADMIN, ...STAFF];
const ALL: DbRole[] = [...ADMIN_REC, ...STAFF];

type TableRule = Partial<Record<DbOp, DbRole[]>>;

/**
 * Qué rol puede hacer qué en cada tabla. Se ha sacado de lo que hacen hoy las páginas desde el navegador, cruzado con
 * a qué páginas entra cada rol (AuthGuard y middleware). Tablas que NO aparecen: prohibidas.
 *
 * Decisiones que se revisarán al pasar las páginas (Fase 2):
 *  - beds24_reservations NO está: hoy las páginas intentan modificarla con la clave pública, pero esa tabla ya está cerrada
 *    y esas escrituras no hacen nada. Permitirlas aquí cambiaría el comportamiento, así que se queda prohibida.
 *  - billing_requests sí está: hoy la lista de solicitudes de factura en Reservas aparece vacía por culpa de las políticas.
 */
export const TABLE_RULES: Record<string, TableRule> = {
  accounts: { select: ADMIN_REC, insert: ADMIN, update: ADMIN_REC, delete: ADMIN },
  finances: { select: ADMIN, insert: ADMIN_REC, update: ADMIN_REC, delete: ADMIN },
  checkins: { select: ALL, insert: ADMIN_REC, update: ADMIN_REC, delete: ADMIN_REC },
  local_reservas: { update: ADMIN_REC },
  transfer_receipts: { select: ADMIN_REC, update: ADMIN_REC },
  billing_requests: { select: ADMIN_REC, update: ADMIN_REC },
  booking_portal_settings: { select: ADMIN_REC },
  room_status: { select: ADMIN_REC },
  employee_logs: { insert: ADMIN_REC },
  tasks: { insert: ADMIN_STAFF, update: ADMIN_STAFF, delete: ADMIN },
  inventory: { select: ALL, insert: ALL, update: ALL, delete: ALL }, // todos los perfiles gestionan el inventario; vaciarlo entero (borrado sin id) sigue siendo solo de admin (ver más abajo)
  settings: { select: ALL, insert: ADMIN_STAFF, update: ADMIN_STAFF }, // el detalle por clave está en SETTINGS_READ / SETTINGS_WRITE
};

/** Claves de `settings` que cada rol puede leer. Los PIN, la clave de recuperación y la agenda de excluidos NUNCA salen por aquí. */
export const SETTINGS_READ: Record<string, DbRole[]> = {
  pricing_unit_settings: ALL,
  capacity_settings: ADMIN_REC,
  season_ranges: ADMIN_REC,
  temp_discounts: ADMIN_REC,
  ota_multipliers: ADMIN_REC,
  season_base_prices: ADMIN_REC,
  default_transfer_account: ADMIN,
  maintenance_schedules: ADMIN_STAFF,
  disable_automatic_whatsapp: ADMIN,
  admin_notification_phone: ADMIN,
  reception_wa_group_url: ADMIN,
  maintenance_wa_group_url: ADMIN,
  google_sheet_nominas_url: ADMIN,
  official_employees: ADMIN,
};

/** Claves de `settings` que cada rol puede escribir (solo las que las páginas escriben hoy desde el navegador). */
export const SETTINGS_WRITE: Record<string, DbRole[]> = {
  maintenance_schedules: ADMIN_STAFF,
  disable_automatic_whatsapp: ADMIN,
  admin_notification_phone: ADMIN,
  reception_wa_group_url: ADMIN,
  maintenance_wa_group_url: ADMIN,
};

/** Relaciones incrustadas que se permiten en un select: tabla -> { texto exacto: tabla relacionada } */
export const EMBEDS: Record<string, Record<string, string>> = {
  finances: { 'accounts(name)': 'accounts' },
};

export interface GatewayInput {
  role: string;
  method: string;
  /** Lo que hay detrás de /api/db/ , ya separado por barras (esperado: ['rest', 'v1', '<tabla>']) */
  segments: string[];
  search: URLSearchParams;
  accept: string | null;
  prefer: string | null;
  bodyText: string | null;
}

export type GatewayDecision =
  | { ok: true; table: string; op: DbOp | 'upsert'; query: string; headers: Record<string, string>; body?: string }
  | { ok: false; status: number; reason: string };

const IDENT = /^[a-z_][a-z0-9_]*$/;
const COLUMNS_ITEM = /^([a-z_][a-z0-9_]*|"[a-z_][a-z0-9_]*")$/; // supabase-js manda columns="a","b" (con comillas) en los inserts de varias filas
const ORDER_ITEM = /^[a-z_][a-z0-9_]*(\.(asc|desc))?(\.(nullsfirst|nullslast))?$/;
const FILTER_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is', 'in']);
const ONCE = new Set(['select', 'limit', 'offset', 'on_conflict', 'columns']);
const REPEATABLE_RESERVED = new Set(['order']);
const LOGIC_PARAMS = new Set(['or', 'and', 'not']); // operadores lógicos de PostgREST: las páginas no los usan
const MAX_LIMIT = 5000;
const MAX_ROWS = 500;
const MAX_PARAMS = 30;
const MAX_VALUE_LEN = 500;
const MAX_BODY_CHARS = 1_000_000;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

const deny = (status: number, reason: string): GatewayDecision => ({ ok: false, status, reason });

function isRole(r: string): r is DbRole {
  return r === 'admin' || r === 'recepcion' || r === 'staff_limpieza' || r === 'staff_mantenimiento';
}

/** Divide por comas que no estén dentro de paréntesis: "*, accounts(name)" -> ["*", "accounts(name)"] */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** "eq.valor", "not.is.null", "in.(a,b)": solo operadores de la lista, sin caracteres de control ni valores enormes */
function validFilterValue(v: string): boolean {
  if (v.length > MAX_VALUE_LEN || CONTROL_CHARS.test(v)) return false;
  const rest = v.startsWith('not.') ? v.slice(4) : v;
  const dot = rest.indexOf('.');
  if (dot < 1) return false;
  const op = rest.slice(0, dot);
  const val = rest.slice(dot + 1);
  if (!FILTER_OPS.has(op)) return false;
  if (op === 'is') return ['null', 'true', 'false', 'unknown'].includes(val);
  if (op === 'in') return val.startsWith('(') && val.endsWith(')');
  return true;
}

/** Claves pedidas en un filtro de `key`: "eq.x" o "in.(a,b)" -> ["x"] / ["a","b"]; null si el filtro no es de ese tipo */
function keysFromKeyFilter(v: string): string[] | null {
  if (v.startsWith('eq.')) return [v.slice(3).replace(/^"(.*)"$/, '$1')];
  if (v.startsWith('in.(') && v.endsWith(')')) {
    return v.slice(4, -1).split(',').map((k) => k.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);
  }
  return null;
}

function parsePrefer(prefer: string | null): { tokens: string[]; hasResolution: boolean } {
  const allowed: Record<string, string[]> = {
    return: ['minimal', 'representation', 'headers-only'],
    resolution: ['merge-duplicates', 'ignore-duplicates'],
    count: ['exact', 'planned', 'estimated'],
    missing: ['default'],
  };
  const tokens: string[] = [];
  let hasResolution = false;
  for (const raw of String(prefer ?? '').split(',')) {
    const [k, v] = raw.trim().split('=');
    if (k && v && allowed[k]?.includes(v)) {
      tokens.push(`${k}=${v}`);
      if (k === 'resolution') hasResolution = true;
    }
  }
  return { tokens, hasResolution };
}

function can(table: string, op: DbOp, role: DbRole): boolean {
  return TABLE_RULES[table]?.[op]?.includes(role) === true;
}

export function evaluateDbRequest(input: GatewayInput): GatewayDecision {
  if (!isRole(input.role)) return deny(403, 'Rol no autorizado.');
  const role = input.role;

  // 1) Solo /rest/v1/<tabla>: nada de rpc, auth, storage ni rutas con más trozos
  const seg = input.segments;
  if (seg.length !== 3 || seg[0] !== 'rest' || seg[1] !== 'v1') return deny(404, 'Ruta no permitida.');
  const table = seg[2];
  if (!IDENT.test(table)) return deny(400, 'Nombre de tabla no válido.');
  if (!TABLE_RULES[table]) return deny(403, 'Tabla no permitida.');

  // 2) Método -> operación
  const method = input.method.toUpperCase();
  const prefer = parsePrefer(input.prefer);
  const hasOnConflict = input.search.has('on_conflict');
  let op: DbOp | 'upsert';
  if (method === 'GET' || method === 'HEAD') op = 'select';
  else if (method === 'POST') op = hasOnConflict || prefer.hasResolution ? 'upsert' : 'insert';
  else if (method === 'PATCH') op = 'update';
  else if (method === 'DELETE') op = 'delete';
  else return deny(405, 'Método no permitido.');

  // 3) Permiso por rol y tabla (un upsert exige poder insertar y modificar)
  if (op === 'upsert') {
    if (!can(table, 'insert', role) || !can(table, 'update', role)) return deny(403, 'Operación no permitida para este rol.');
  } else if (!can(table, op, role)) {
    return deny(403, 'Operación no permitida para este rol.');
  }

  // 4) Parámetros de la consulta
  let count = 0;
  const seen = new Set<string>();
  const forward: [string, string][] = [];
  const filters: [string, string][] = [];
  let selectValue: string | null = null;

  for (const [name, value] of input.search.entries()) {
    if (++count > MAX_PARAMS) return deny(400, 'Demasiados parámetros.');
    if (value.length > MAX_VALUE_LEN * 4 || CONTROL_CHARS.test(value)) return deny(400, 'Valor no válido.');

    if (ONCE.has(name) || REPEATABLE_RESERVED.has(name)) {
      if (ONCE.has(name) && seen.has(name)) return deny(400, 'Parámetro repetido.');
      seen.add(name);
      if (name === 'select') {
        selectValue = value;
      } else if (name === 'limit') {
        if (!/^\d{1,6}$/.test(value) || Number(value) > MAX_LIMIT) return deny(400, 'Límite no válido.');
      } else if (name === 'offset') {
        if (!/^\d{1,9}$/.test(value)) return deny(400, 'Desplazamiento no válido.');
      } else if (name === 'on_conflict') {
        if (!value.split(',').every((c) => IDENT.test(c))) return deny(400, 'Columnas no válidas.');
      } else if (name === 'columns') {
        if (!value.split(',').every((c) => COLUMNS_ITEM.test(c))) return deny(400, 'Columnas no válidas.');
      } else if (name === 'order') {
        if (!value.split(',').every((c) => ORDER_ITEM.test(c))) return deny(400, 'Orden no válido.');
      }
      forward.push([name, value]);
      continue;
    }

    // Todo lo demás debe ser un filtro sobre una columna de esta misma tabla (nada de or/and, relaciones ni nombres raros)
    if (!IDENT.test(name) || LOGIC_PARAMS.has(name)) return deny(400, 'Parámetro no permitido.');
    if (!validFilterValue(value)) return deny(400, 'Filtro no permitido.');
    filters.push([name, value]);
    forward.push([name, value]);
  }

  // 5) select: solo columnas simples, "*" o la relación incrustada permitida (y solo en lecturas)
  if (selectValue !== null) {
    for (const item of splitTopLevel(selectValue)) {
      if (item === '*' || IDENT.test(item)) continue;
      const related = EMBEDS[table]?.[item.replace(/\s+/g, '')];
      if (related && op === 'select' && can(related, 'select', role)) continue;
      return deny(400, 'Selección no permitida.');
    }
  }

  // 6) Cambios y borrados: siempre con algún filtro (nunca masivos por descuido)
  if ((op === 'update' || op === 'delete') && filters.length === 0) return deny(400, 'Se exige al menos un filtro.');

  // 6b) Inventario: limpieza, mantenimiento y recepción borran artículos de uno en uno (filtro id=eq.<id>); el borrado masivo
  // (vaciar el catálogo entero) es solo del administrador.
  if (table === 'inventory' && op === 'delete' && role !== 'admin') {
    const idFilters = filters.filter(([n]) => n === 'id');
    if (idFilters.length !== 1 || !idFilters[0][1].startsWith('eq.')) return deny(403, 'Solo el administrador puede borrar varios artículos a la vez.');
  }

  // 7) Cuerpo
  let body: string | undefined;
  let rows: Record<string, unknown>[] = [];
  if (op === 'insert' || op === 'upsert' || op === 'update') {
    const text = input.bodyText ?? '';
    if (!text) return deny(400, 'Falta el cuerpo.');
    if (text.length > MAX_BODY_CHARS) return deny(413, 'Cuerpo demasiado grande.');
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return deny(400, 'Cuerpo no válido.'); }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    if (list.length === 0 || list.length > MAX_ROWS) return deny(400, 'Número de filas no válido.');
    if (op === 'update' && Array.isArray(parsed)) return deny(400, 'Un cambio lleva un solo objeto.');
    if (!list.every((r) => r !== null && typeof r === 'object' && !Array.isArray(r))) return deny(400, 'Filas no válidas.');
    rows = list as Record<string, unknown>[];
    body = text;
  } else if (input.bodyText) {
    return deny(400, 'Esta operación no admite cuerpo.');
  }

  // 8) Reglas propias de `settings`: por clave, nunca la tabla entera
  if (table === 'settings') {
    if (op === 'delete') return deny(403, 'No se pueden borrar ajustes.');
    if (op === 'select') {
      const keyFilters = filters.filter(([n]) => n === 'key');
      if (keyFilters.length !== 1) return deny(403, 'Los ajustes se piden por clave.');
      const keys = keysFromKeyFilter(keyFilters[0][1]);
      if (!keys || keys.length === 0 || !keys.every((k) => SETTINGS_READ[k]?.includes(role))) return deny(403, 'Ajuste no permitido.');
    } else if (op === 'update') {
      const keyFilters = filters.filter(([n]) => n === 'key');
      const keys = keyFilters.length === 1 ? keysFromKeyFilter(keyFilters[0][1]) : null;
      if (!keys || keys.length !== 1 || !SETTINGS_WRITE[keys[0]]?.includes(role)) return deny(403, 'Ajuste no permitido.');
      if ('key' in rows[0] && rows[0].key !== keys[0]) return deny(403, 'No se puede cambiar la clave de un ajuste.');
    } else {
      // insert / upsert
      if (hasOnConflict && input.search.get('on_conflict') !== 'key') return deny(400, 'Conflicto no permitido.');
      if (!rows.every((r) => typeof r.key === 'string' && SETTINGS_WRITE[r.key]?.includes(role))) return deny(403, 'Ajuste no permitido.');
    }
  }

  // 9) Lo que se reenvía: solo lo validado, y solo las cabeceras necesarias
  const headers: Record<string, string> = {};
  if (op === 'select') {
    const accept = (input.accept ?? '').toLowerCase();
    headers.Accept = accept.includes('application/vnd.pgrst.object+json') ? 'application/vnd.pgrst.object+json' : 'application/json';
  } else {
    headers.Accept = 'application/json';
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer.tokens.length) headers.Prefer = prefer.tokens.join(',');

  const query = new URLSearchParams();
  for (const [n, v] of forward) query.append(n, v);

  return { ok: true, table, op, query: query.toString(), headers, body };
}
