import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { normalizePhone } from '@/lib/whatsapp';

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
 * Normaliza cualquier formato de teléfono a sus últimos 10 dígitos para comparación segura
 */
export function extract10Digits(phone: string): string {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '');
  if (clean.length >= 10) {
    return clean.slice(-10);
  }
  return clean;
}

/**
 * Obtiene la lista completa de contactos excluidos de la tabla `settings`:
 * 1. Contactos personales guardados por Rolando (clave: 'excluded_personal_contacts')
 * 2. Empleados oficiales (clave: 'official_employees')
 * 3. Teléfono de gerencia / alertas (clave: 'admin_notification_phone')
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
      .in('key', ['excluded_personal_contacts', 'official_employees', 'admin_notification_phone']);

    if (error) {
      console.warn('[Personal Contacts] Error consultando settings en Supabase:', error.message);
      return memoryCache.contacts;
    }

    const contactsMap = new Map<string, PersonalContact>();

    // A. Contactos personales guardados explícitamente
    const personalRow = rows?.find(r => r.key === 'excluded_personal_contacts');
    if (personalRow?.value) {
      try {
        const parsed: PersonalContact[] = typeof personalRow.value === 'string'
          ? JSON.parse(personalRow.value)
          : personalRow.value;
        if (Array.isArray(parsed)) {
          parsed.forEach(c => {
            const ten = extract10Digits(c.phone);
            if (ten) {
              contactsMap.set(ten, {
                phone: c.phone,
                name: c.name || 'Contacto Personal',
                notes: c.notes || '',
                added_at: c.added_at,
                source: 'personal'
              });
            }
          });
        }
      } catch (parseErr) {
        console.error('[Personal Contacts] Error parseando excluded_personal_contacts:', parseErr);
      }
    }

    // B. Empleados oficiales (Staff)
    const empRow = rows?.find(r => r.key === 'official_employees');
    if (empRow?.value) {
      try {
        const emps: any[] = typeof empRow.value === 'string' ? JSON.parse(empRow.value) : empRow.value;
        if (Array.isArray(emps)) {
          emps.forEach(e => {
            const ten = extract10Digits(e.phone || '');
            if (ten && !contactsMap.has(ten)) {
              contactsMap.set(ten, {
                phone: e.phone,
                name: `${e.full_name || 'Empleado'} (${e.department || 'Staff'})`,
                notes: `Empleado #${e.employee_num}`,
                source: 'employee'
              });
            }
          });
        }
      } catch (empErr) {
        console.error('[Personal Contacts] Error parseando official_employees:', empErr);
      }
    }

    // C. Teléfono de Alertas de Gerencia
    const adminPhoneRow = rows?.find(r => r.key === 'admin_notification_phone');
    if (adminPhoneRow?.value) {
      const phones = String(adminPhoneRow.value).split(',').map(p => p.trim());
      phones.forEach(p => {
        const ten = extract10Digits(p);
        if (ten && !contactsMap.has(ten)) {
          contactsMap.set(ten, {
            phone: p,
            name: 'Gerencia / Alertas',
            notes: 'Teléfono administrador',
            source: 'admin'
          });
        }
      });
    }

    // Fallback asegurado para Francisco San Martin (caso reportado por Rolando)
    const fsmTen = '2225509046';
    if (!contactsMap.has(fsmTen)) {
      contactsMap.set(fsmTen, {
        phone: '+522225509046',
        name: 'Francisco San Martin',
        notes: 'Contacto personal de Rolando',
        source: 'personal'
      });
    }

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
 * Determina si un número de teléfono pertenece a los contactos personales de Rolando o a empleados
 */
export async function isExcludedPersonalContact(rawPhone: string): Promise<{
  isExcluded: boolean;
  contact?: PersonalContact;
}> {
  if (!rawPhone) return { isExcluded: false };

  const targetDigits = extract10Digits(rawPhone);
  if (!targetDigits || targetDigits.length < 10) return { isExcluded: false };

  const contacts = await getExcludedContacts();
  const match = contacts.find(c => extract10Digits(c.phone) === targetDigits);

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

    // Actualizar si existe o agregar nuevo
    const existingIdx = personalOnly.findIndex(c => extract10Digits(c.phone) === rawDigits);
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
    const rawDigits = extract10Digits(phone);
    if (!rawDigits) return false;

    const currentContacts = await getExcludedContacts(true);
    const personalOnly = currentContacts.filter(c => c.source === 'personal' && extract10Digits(c.phone) !== rawDigits);

    const { error } = await supabase
      .from('settings')
      .upsert(
        { key: 'excluded_personal_contacts', value: JSON.stringify(personalOnly) },
        { onConflict: 'key' }
      );

    if (error) throw error;

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
