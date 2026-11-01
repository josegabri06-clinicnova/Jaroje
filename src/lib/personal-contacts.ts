import { createClient } from '@supabase/supabase-js';
import { normalizePhone } from '@/lib/whatsapp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface PersonalContact {
  phone: string;
  name: string;
  notes?: string;
  added_at?: string;
  source?: string;
}

// Cache en memoria con TTL de 3 minutos para máxima velocidad en Webhooks
let memoryCache: {
  contacts: PersonalContact[];
  lastFetched: number;
} = {
  contacts: [],
  lastFetched: 0,
};

const CACHE_TTL_MS = 3 * 60 * 1000;

/**
 * Limpia y extrae exclusivamente los dígitos de cualquier formato de teléfono
 */
export function cleanDigits(phone: string): string {
  return String(phone || '').replace(/\D/g, '');
}

/**
 * Normaliza cualquier formato de teléfono a sus últimos 10 dígitos para comparación segura
 */
export function extract10Digits(phone: string): string {
  if (!phone) return '';
  const clean = cleanDigits(phone);
  if (clean.length >= 10) {
    return clean.slice(-10);
  }
  return clean;
}

/**
 * Compara dos números telefónicos con tolerancia a prefijos internacionales (+52, +34, etc.)
 */
export function matchesPhone(rawA: string, rawB: string): boolean {
  const a = cleanDigits(rawA);
  const b = cleanDigits(rawB);
  if (!a || !b) return false;
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen >= 8) {
    if (a.endsWith(b) || b.endsWith(a)) return true;
  }
  if (a.length >= 10 && b.length >= 10) {
    if (a.slice(-10) === b.slice(-10)) return true;
  }
  return false;
}

/**
 * Obtiene la lista completa de contactos excluidos de la tabla `settings`:
 * 1. Claves directas: 'excluded_person', 'excluded_persons', 'excluded_personal_contacts'
 * 2. Empleados oficiales (clave: 'official_employees')
 * 3. Teléfono de gerencia / alertas (clave: 'admin_notification_phone')
 * 4. Tabla 'excluded_person' (si existe en Supabase)
 */
export async function getExcludedContacts(forceRefresh = false): Promise<PersonalContact[]> {
  const now = Date.now();
  if (!forceRefresh && memoryCache.contacts.length > 0 && now - memoryCache.lastFetched < CACHE_TTL_MS) {
    return memoryCache.contacts;
  }

  try {
    const { data: rows, error } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', [
        'excluded_person',
        'excluded_persons',
        'excluded_personal_contacts',
        'official_employees',
        'admin_notification_phone'
      ]);

    if (error) {
      console.warn('[Personal Contacts] Error consultando settings en Supabase:', error.message);
      return memoryCache.contacts;
    }

    const contactsMap = new Map<string, PersonalContact>();

    // Helper para parsear cualquier formato de lista de contactos
    const parseAndAddContacts = (value: any, source: string) => {
      if (!value) return;
      try {
        let items: any[] = [];
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            const parsed = JSON.parse(trimmed);
            items = Array.isArray(parsed) ? parsed : [parsed];
          } else {
            items = trimmed.split(/[\n,]+/).map(p => ({ phone: p.trim() })).filter(x => x.phone);
          }
        } else if (Array.isArray(value)) {
          items = value;
        }

        items.forEach(c => {
          const rawPhone = typeof c === 'string' ? c : (c.phone || c.telefono || c.number || '');
          const rawDigits = cleanDigits(rawPhone);
          if (rawDigits && rawDigits.length >= 7) {
            const contactName = (typeof c === 'object' && c?.name) ? c.name : (source === 'employee' ? 'Empleado Staff' : 'Contacto Personal');
            const contactNotes = (typeof c === 'object' && c?.notes) ? c.notes : '';
            contactsMap.set(rawDigits, {
              phone: rawPhone,
              name: contactName,
              notes: contactNotes,
              added_at: typeof c === 'object' ? c.added_at : undefined,
              source
            });
          }
        });
      } catch (err) {
        console.error('[Personal Contacts] Error parseando lista de contactos:', err);
      }
    };

    // A. Contactos personales guardados bajo cualquier clave de exclusión
    const excludedRows = (rows || []).filter(r => 
      r.key === 'excluded_person' || 
      r.key === 'excluded_persons' || 
      r.key === 'excluded_personal_contacts'
    );
    for (const r of excludedRows) {
      parseAndAddContacts(r.value, 'personal');
    }

    // B. Empleados oficiales (Staff)
    const empRow = rows?.find(r => r.key === 'official_employees');
    if (empRow?.value) {
      parseAndAddContacts(empRow.value, 'employee');
    }

    // C. Teléfono de Alertas de Gerencia
    const adminPhoneRow = rows?.find(r => r.key === 'admin_notification_phone');
    if (adminPhoneRow?.value) {
      parseAndAddContacts(adminPhoneRow.value, 'admin');
    }

    // D. Tabla 'excluded_person' si existe en la base de datos
    try {
      const { data: tableRows } = await supabase
        .from('excluded_person')
        .select('*');
      if (tableRows && Array.isArray(tableRows)) {
        tableRows.forEach((row: any) => {
          const rawPhone = row.phone || row.telefono || row.number || '';
          const rawDigits = cleanDigits(rawPhone);
          if (rawDigits && rawDigits.length >= 7) {
            contactsMap.set(rawDigits, {
              phone: rawPhone,
              name: row.name || row.nombre || 'Contacto Excluido',
              notes: row.notes || row.notas || '',
              source: 'personal'
            });
          }
        });
      }
    } catch (_) {}

    const merged = Array.from(contactsMap.values());
    memoryCache = {
      contacts: merged,
      lastFetched: now
    };
    return merged;
  } catch (err) {
    console.error('[Personal Contacts] Excepción cargando contactos excluidos:', err);
    return memoryCache.contacts;
  }
}

/**
 * Determina si un número de teléfono pertenece a la lista "excluded_person", contactos personales o empleados
 */
export async function isExcludedPersonalContact(rawPhone: string): Promise<{
  isExcluded: boolean;
  contact?: PersonalContact;
}> {
  if (!rawPhone) return { isExcluded: false };

  const targetDigits = cleanDigits(rawPhone);
  if (!targetDigits || targetDigits.length < 7) return { isExcluded: false };

  const contacts = await getExcludedContacts();
  const match = contacts.find(c => matchesPhone(c.phone, rawPhone));

  if (match) {
    return {
      isExcluded: true,
      contact: match
    };
  }

  return { isExcluded: false };
}

/**
 * Guarda o actualiza un contacto personal en `settings`
 */
export async function savePersonalContact(contact: { phone: string; name: string; notes?: string }): Promise<boolean> {
  try {
    const rawDigits = extract10Digits(contact.phone);
    if (!rawDigits || rawDigits.length < 10) {
      throw new Error('El número telefónico debe contener al menos 10 dígitos válidos');
    }

    const currentContacts = await getExcludedContacts(true);
    const personalOnly = currentContacts.filter(c => c.source === 'personal');

    const cleanNormPhone = normalizePhone(contact.phone) || `+52${rawDigits}`;
    const newEntry: PersonalContact = {
      phone: cleanNormPhone,
      name: contact.name.trim() || 'Contacto Personal',
      notes: contact.notes?.trim() || '',
      added_at: new Date().toISOString(),
      source: 'personal'
    };

    // Actualizar si existe o agregar nuevo con comparación elástica de teléfono
    const existingIdx = personalOnly.findIndex(c => matchesPhone(c.phone, contact.phone));
    if (existingIdx >= 0) {
      personalOnly[existingIdx] = newEntry;
    } else {
      personalOnly.unshift(newEntry);
    }

    const { error } = await supabase
      .from('settings')
      .upsert(
        { key: 'excluded_personal_contacts', value: JSON.stringify(personalOnly) },
        { onConflict: 'key' }
      );

    if (error) throw error;

    // Invalidar cache
    memoryCache.contacts = [];
    memoryCache.lastFetched = 0;
    return true;
  } catch (err) {
    console.error('[Personal Contacts] Error guardando contacto personal:', err);
    return false;
  }
}

/**
 * Elimina un contacto personal por número de teléfono
 */
export async function removePersonalContact(phone: string): Promise<boolean> {
  try {
    const rawDigits = cleanDigits(phone);
    if (!rawDigits) return false;

    const currentContacts = await getExcludedContacts(true);
    const personalOnly = currentContacts.filter(c => c.source === 'personal' && !matchesPhone(c.phone, phone));

    const { error } = await supabase
      .from('settings')
      .upsert(
        { key: 'excluded_personal_contacts', value: JSON.stringify(personalOnly) },
        { onConflict: 'key' }
      );

    if (error) throw error;

    memoryCache.contacts = [];
    memoryCache.lastFetched = 0;
    return true;
  } catch (err) {
    console.error('[Personal Contacts] Error eliminando contacto personal:', err);
    return false;
  }
}

/**
 * Importación masiva de contactos (desde archivo .vcf o .csv)
 */
export async function bulkImportPersonalContacts(items: Array<{ phone: string; name: string; notes?: string }>): Promise<{
  added: number;
  total: number;
}> {
  try {
    const currentContacts = await getExcludedContacts(true);
    const personalOnly = currentContacts.filter(c => c.source === 'personal');
    const existingDigitsMap = new Set(personalOnly.map(c => extract10Digits(c.phone)));

    let addedCount = 0;
    items.forEach(item => {
      const ten = extract10Digits(item.phone);
      if (ten && ten.length === 10 && !existingDigitsMap.has(ten)) {
        existingDigitsMap.add(ten);
        personalOnly.push({
          phone: normalizePhone(item.phone) || `+52${ten}`,
          name: item.name.trim() || 'Contacto Importado',
          notes: item.notes || 'Importado vía agenda',
          added_at: new Date().toISOString(),
          source: 'personal'
        });
        addedCount++;
      }
    });

    const { error } = await supabase
      .from('settings')
      .upsert(
        { key: 'excluded_personal_contacts', value: JSON.stringify(personalOnly) },
        { onConflict: 'key' }
      );

    if (error) throw error;

    memoryCache.lastFetched = 0;
    return { added: addedCount, total: personalOnly.length };
  } catch (err) {
    console.error('[Personal Contacts] Error en importación masiva:', err);
    return { added: 0, total: 0 };
  }
}
