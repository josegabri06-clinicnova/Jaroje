import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { getBeds24Bookings } from "@/lib/beds24";

export const maxDuration = 30;
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    );

    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY no configurada en Vercel." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const messages: { role: string; content: string }[] = body.messages || [];
    let role = body.role || req.headers.get("x-user-role") || "recepcion";
    
    // Obtener PIN de Administrador enviado por la cabecera o el cuerpo
    const adminPinHeader = req.headers.get("x-admin-pin") || body.pin || null;

    let isAdmin = false;

    // VALIDACIÓN HERMÉTICA DE SEGURIDAD EN EL SERVIDOR (OPCIÓN A)
    if (role === "admin") {
      try {
        const { data: pinSetting } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "pin_admin")
          .single();
        
        const dbAdminPin = pinSetting?.value || "1234"; // fallback por defecto si está vacío
        
        if (adminPinHeader && adminPinHeader === dbAdminPin) {
          isAdmin = true;
        } else {
          console.warn("Jaroje AI Copilot: Acceso Admin denegado. PIN incorrecto o ausente.");
          role = "recepcion"; // Degradación forzada por seguridad
          isAdmin = false;
        }
      } catch (dbErr) {
        console.error("Error validando PIN de Admin en base de datos, degradando a recepcion:", dbErr);
        role = "recepcion";
        isAdmin = false;
      }
    }

    // Fetch context data — Beds24 is the SOURCE OF TRUTH for reservations
    let contextData = "";
    const todayStr = new Date().toISOString().split('T')[0];

    try {
      // --- 1. BEDS24 RESERVATIONS (Llamada interna local, cero loopback HTTP) ---
      let allReservas = await getBeds24Bookings(true);

      // --- 1.1 LOCAL RESERVATIONS (Supabase) ---
      try {
        const { data: localData } = await supabase
          .from('local_reservas')
          .select('*')
          .neq('status', 'cancelled');

        if (localData && localData.length > 0) {
          const mappedLocal = localData.map((b: any) => {
            const arrivalDate = b.check_in ? new Date(b.check_in) : null;
            const departureDate = b.check_out ? new Date(b.check_out) : null;
            const nights = (arrivalDate && departureDate)
              ? Math.max(1, Math.round((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)))
              : 1;

            const physicalName = b.unit_id ? (b.unit_id === '1' ? '500' : b.unit_id === '2' ? '501' : b.unit_id === '3' ? '502' : b.unit_id === '4' ? '503' : b.unit_id === '5' ? '504' : b.unit_id === '6' ? '505' : b.unit_id === '7' ? '506' : b.unit_id === '8' ? '507' : b.unit_id) : '';

            return {
              id: b.id.toString(),
              roomId: b.room_id,
              unitId: b.unit_id,
              room_name: `Habitación ${physicalName}`,
              roomName: `Habitación ${physicalName}`,
              arrival: b.check_in,
              departure: b.check_out,
              check_in: b.check_in,
              check_out: b.check_out,
              guest_name: b.guest_name,
              firstName: b.guest_name,
              lastName: '',
              status: b.status || 'confirmed',
              price: Number(b.price || 0),
              price_estimate: Number(b.price || 0),
              deposit: Number(b.deposit || 0),
              balance: Number(b.price || 0) - Number(b.deposit || 0),
              guest_phone: b.phone || '',
              phone: b.phone || '',
              num_adult: Number(b.num_adult || 1),
              num_child: Number(b.num_child || 0),
              notes: b.notes || '',
              channel: b.channel || 'Recepción',
              isLocal: true,
              nights
            };
          });
          allReservas = [...allReservas, ...mappedLocal];
        }
      } catch (localDbErr) {
        console.error("Copilot local_reservas fetch error:", localDbErr);
      }

      const active = allReservas.filter((r: any) => r.check_in <= todayStr && r.check_out > todayStr);
      const llegadasHoy = allReservas.filter((r: any) => r.check_in === todayStr);
      const salidasHoy = allReservas.filter((r: any) => r.check_out === todayStr);
      
      // Ordenación cronológica ascendente para facilitar búsqueda a la IA
      const sortedReservas = [...allReservas].sort((a: any, b: any) => 
        new Date(a.check_in).getTime() - new Date(b.check_in).getTime()
      );

      contextData += `\n=== FECHA DE HOY (SISTEMA): ${todayStr} ===\n`;
      contextData += `\n[RESUMEN OPERATIVO DE HOY]:\n`;
      contextData += `- Huéspedes actualmente Hospedados ("En Casa"): ${active.length} reservas\n`;
      contextData += `- Llegadas programadas hoy: ${llegadasHoy.length} reservas\n`;
      contextData += `- Salidas programadas hoy: ${salidasHoy.length} reservas\n`;
      contextData += `- Total general de reservas activas en catálogo: ${allReservas.length}\n`;

      contextData += `\n[HUÉSPEDES EN CASA AHORA (DETALLE)]:\n${JSON.stringify(active.map((r: any) => ({
        huesped: r.guest_name, habitacion: r.room_name, check_in: r.check_in, check_out: r.check_out, canal: r.channel, telefono: r.guest_phone || 'no disponible', noches: r.nights, tarifa_estimada: r.price_estimate
      })), null, 2)}\n`;

      contextData += `\n[LLEGADAS DE HOY (DETALLE)]:\n${JSON.stringify(llegadasHoy.map((r: any) => ({ huesped: r.guest_name, habitacion: r.room_name, canal: r.channel })), null, 2)}\n`;

      contextData += `\n[SALIDAS DE HOY (DETALLE)]:\n${JSON.stringify(salidasHoy.map((r: any) => ({ huesped: r.guest_name, habitacion: r.room_name })), null, 2)}\n`;

      contextData += `\n[LISTADO GENERAL Y COMPLETO DE TODAS LAS RESERVAS REGISTRADAS (FUENTE DE VERDAD COGNITIVA)]:\n`;
      contextData += sortedReservas.map((r: any) => 
        `ID: ${r.id} | Huesped: ${r.guest_name} | Habitación: ${r.room_name} | Check-in: ${r.check_in} | Check-out: ${r.check_out} | Canal: ${r.channel} | Noches: ${r.nights} | Tarifa Est: MX$${r.price_estimate} | Tel: ${r.guest_phone || 'No disp.'} | Email: ${r.guest_email || 'No disp.'} | Status: ${r.status}`
      ).join('\n') + '\n';
      
    } catch (bedsErr) {
      console.error("Copilot Beds24 fetch error locally:", bedsErr);
      contextData += `\n[AVISO]: No se pudo conectar con Beds24 para obtener reservas en tiempo real.\n`;
    }

    try {
      // --- 2. SUPABASE CHECK-INS (tracks reception processing status) ---
      const { data: checkins } = await supabase
        .from("checkins")
        .select("*")
        .in("status", ["checked_in", "checked_out"]);
      if (checkins && checkins.length > 0) {
        const checkedIn = checkins.filter((c: any) => c.status === "checked_in");
        const checkedOut = checkins.filter((c: any) => c.status === "checked_out");
        contextData += `\n[CHECK-INS PROCESADOS POR RECEPCIÓN] (${checkedIn.length} activos):\n${JSON.stringify(checkedIn.map((c: any) => ({ huesped: c.guest_name, habitacion: c.room, check_in: c.check_in_date, check_out: c.check_out_date })), null, 2)}\n`;
        contextData += `\n[CHECK-OUTS PROCESADOS HOY] (${checkedOut.length}):\n${JSON.stringify(checkedOut.map((c: any) => ({ huesped: c.guest_name, habitacion: c.room })), null, 2)}\n`;
      }

      // ACCESO FINANCIERO PROTEGIDO SÓLO PARA ADMIN VALIDADO
      if (isAdmin) {
        const { data: finances } = await supabase
          .from("finances")
          .select("*")
          .order("date", { ascending: false })
          .limit(30);
        if (finances) {
          contextData += `\nÚltimos movimientos financieros:\n${JSON.stringify(finances, null, 2)}\n`;
        }

        const { data: accounts } = await supabase.from("accounts").select("*");
        if (accounts) {
          contextData += `\nSaldo de cuentas y sobres:\n${JSON.stringify(accounts, null, 2)}\n`;
        }

      }
    } catch (dbErr) {
      console.error("DB fetch error (non-fatal):", dbErr);
    }

    const systemPrompt = isAdmin
      ? `Eres Jaroje AI, el Asistente Inteligente del Hotel Jaroje. Eres el consejero estratégico de confianza del Administrador del hotel. Tienes acceso completo a datos de la base de datos y de Beds24 en tiempo real.

[DATOS EN TIEMPO REAL DEL SISTEMA]
${contextData}

[CONOCIMIENTO OPERATIVO Y CONFIGURACIÓN CRÍTICA DEL HOTEL]

1. DISTRIBUCIÓN HOMOLOGADA DE HABITACIONES (ORDEN DE FILAS EN PANEL Y CALENDARIO)
El hotel tiene sus habitaciones agrupadas físicamente de la siguiente forma, organizadas estrictamente por filas para homologar toda la interfaz:
* Fila 1: Apartamentos Premier 3 Recámaras (101, 102, 103, 104, 105, 106, 107)
* Fila 2: Apartamentos Premier 2 Recámaras (201, 202, 203, 204, 205, 206)
* Fila 3: Unidades Especiales (401 - Casa Lujo 401, 402 - Condo 1R 402)
* Fila 4: Habitaciones Dobles / Estándar (301, 302, 303, 304, 305, 306)
* Fila 5: Apartamentos Nuevos (500, 501, 502, 503, 504, 505, 506)

2. INTEGRACIÓN META / WHATSAPP CLOUD API (COMUNICACIÓN OFICIAL)
* La cuenta antigua de Meta y sus plantillas de nóminas han sido completamente retiradas del negocio. Las nóminas ya NO existen en el sistema.
* Canal Oficial de WhatsApp del Hotel Jaroje: +34 659 28 60 72 (Phone ID: 1198960849956537).
* Plantilla Oficial de Presentación / Bienvenida: "presentacion_cliente_jaroje_2". Esta es la única plantilla aprobada por Meta para iniciar conversaciones de presentación con los huéspedes de forma automatizada o manual.

3. INTERFAZ DE USUARIO (UX), NAVEGACIÓN Y ROLES DE STAYSYNC
* Navegación Inferior (Bottom Nav): Rediseñada y simplificada. Se eliminó por completo el botón flotante central de "más" (+) y su popover. Ahora hay 4 pestañas limpias distribuidas uniformemente: Panel, Calendario, Reservas, Ajustes.
* Navegación del Calendario: Cuenta con un selector de fecha nativo (Date Picker) interactivo. Se accede haciendo clic en el icono del calendario o sobre el rango de fechas en la parte superior para saltar directamente a fechas lejanas sin necesidad de scroll manual.
* Notificaciones (Campana): Se eliminó la sección de "Incidencias". Al presionar la campana, se despliega directamente el "Historial de Actividad" (Activity Logs) para auditar cambios en el sistema.
* Roles y Restricción de Vistas: El Administrador (Admin) posee acceso completo 360, incluyendo datos financieros de la reserva y botón de enlace directo al WhatsApp del huésped. Recepción y Limpieza tienen acceso operativo similar en tarjetas y botones, pero tienen restricción absoluta a los datos financieros y a los enlaces de WhatsApp de los huéspedes (exclusivos de Admin).

Reglas del Copiloto:
1. Sé conciso, directo, estratégico y brutalmente útil. Hablas con el dueño/administrador del hotel.
2. Utiliza siempre datos reales del sistema proporcionados en este prompt. No inventes números ni estados de reservas.
3. El hotel opera y cotiza en Pesos Mexicanos (MXN).
4. Si el Administrador te pregunta sobre configuraciones o cambios de interfaz, confirma con precisión los detalles descritos en este prompt.
5. Cuando te pregunten si hay una reserva en una habitación o quién la tiene (ej: 'quién tiene la 500', 'reservas para la 301', etc.), escanea obligatoriamente TODO el '[LISTADO GENERAL Y COMPLETO DE TODAS LAS RESERVAS REGISTRADAS]' de arriba a abajo. No asumas que no hay nada solo buscando en 'HUÉSPEDES EN CASA AHORA' o llegadas de hoy. Si hay reservas futuras o pasadas en el listado general, menciónalas indicando claramente sus fechas.
6. Si te preguntan por un número de habitación (ej: '500', '101', '302'), haz coincidencia lógica o parcial con los nombres de la lista (ej: 'Habitación 500' o 'Apartamento Premier 101' corresponden a la 500 y 101).
7. Si te preguntan sobre cualquier funcionalidad, botón, sección, pestaña, flujo de navegación o cambio de interfaz en Jaroje OS (como los accesos a WhatsApp, nóminas, incidencias, roles de recepción/limpieza, botones de acción rápida, etc.), debes responder basándote ESTRICTAMENTE en el '[CONOCIMIENTO OPERATIVO Y CONFIGURACIÓN CRÍTICA DEL HOTEL]' descrito en este prompt. NUNCA inventes rutas, no supongas flujos obsoletos que fueron removidos (ej: botón floating '+', incidencias o nóminas de Meta) ni utilices conocimiento previo no documentado aquí. Si el usuario pregunta por algo que no conoces o que no está detallado en este prompt, indícalo amablemente en lugar de alucinar.`
      : `Eres Jaroje AI, el Asistente del Hotel Jaroje para el personal de Recepción y Staff Operativo. Tienes acceso a datos de huéspedes y reservas en tiempo real.

[DATOS EN TIEMPO REAL DEL SISTEMA]
${contextData}

[CONOCIMIENTO OPERATIVO Y CONFIGURACIÓN CRÍTICA DEL HOTEL]

1. DISTRIBUCIÓN HOMOLOGADA DE HABITACIONES (ORDEN DE FILAS EN PANEL Y CALENDARIO)
* Fila 1: Apartamentos Premier 3 Recámaras (101 a 107)
* Fila 2: Apartamentos Premier 2 Recámaras (201 a 206)
* Fila 3: Unidades Especiales (401 - Casa Lujo 401, 402 - Condo 1R 402)
* Fila 4: Habitaciones Dobles / Estándar (301 a 306)
* Fila 5: Apartamentos Nuevos (500 a 506)

2. INTEGRACIÓN META / WHATSAPP CLOUD API (COMUNICACIÓN CON HUÉSPEDES)
* Teléfono de WhatsApp de recepción/hotel: +34 659 28 60 72.
* Plantilla Oficial para presentarse a huéspedes: "presentacion_cliente_jaroje_2". Úsala cuando se requiera iniciar contacto con una nueva reserva.

3. INTERFAZ DE USUARIO (UX), NAVEGACIÓN Y ROLES DE VISTA
* Navegación Inferior: 4 pestañas limpias (Panel, Calendario, Reservas, Ajustes). Ya no existe el botón flotante central (+).
* Calendario: Usa el selector de fecha nativo (Date Picker) haciendo clic en el icono del calendario para saltar a fechas futuras de forma rápida.
* Campana de notificaciones: Te lleva directamente al Historial de Actividad (Activity Logs). Ya no existe la sección de incidencias.
* Roles y Permisos de Vistas: Recepción y Limpieza tienen vistas de tarjetas de reserva con botones operativos similares, pero tienen prohibido el acceso a datos financieros y enlaces de contacto directo de WhatsApp de huéspedes. Solo el Administrador puede ver esta información sensible.

Reglas ESTRICTAS del Copiloto:
1. NUNCA hables de nóminas, salarios, finanzas, bancos, saldos, ingresos ni gastos.
2. Si te preguntan algo financiero, responde con amabilidad: "Lo siento, no tengo permisos para consultar datos financieros."
3. Ayuda de forma proactiva, profesional y muy atenta a la recepción en la gestión diaria de entradas, salidas y estancias de huéspedes.
4. Utiliza solo los datos reales provistos. No inventes información de huéspedes ni de disponibilidad.
5. Si te preguntan si hay una reserva en una habitación o quién la tiene (ej: 'quién tiene la 500' o 'reservas de la 301'), busca minuciosamente en el '[LISTADO GENERAL Y COMPLETO DE TODAS LAS RESERVAS REGISTRADAS]' completo. No te limites a ver los 'HUÉSPEDES EN CASA AHORA'. Si la reserva es para fechas futuras o pasadas, explícalo detalladamente al recepcionista (ej: 'Hoy no hay check-in ni nadie en casa para la 500, pero Mike McKenna tiene una reserva confirmada a futuro del 30 de enero al 8 de febrero de 2027').
6. Haz coincidencia lógica y parcial de los números de habitación (ej: si el usuario escribe '302', busca en los registros que digan '302' o 'Habitación DOBLE 302').
7. Si te preguntan sobre cómo funciona la app, dónde está un botón, flujos de navegación, o accesos de Recepción y Limpieza, básate ESTRICTAMENTE en el '[CONOCIMIENTO OPERATIVO Y CONFIGURACIÓN CRÍTICA DEL HOTEL]' provisto. No asumas la existencia de elementos eliminados (ej. botón floating '+', nóminas o incidencias). Si te piden datos de WhatsApp o financieros de un cliente, recuerda que están protegidos y debes denegar el acceso.`;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              controller.enqueue(
                encoder.encode(`0:${JSON.stringify(delta)}\n`)
              );
            }
          }
          controller.enqueue(
            encoder.encode(
              `d:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n`
            )
          );
          controller.close();
        } catch (streamErr) {
          controller.error(streamErr);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Vercel-AI-Data-Stream": "v1",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error: any) {
    console.error("Copilot API error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
