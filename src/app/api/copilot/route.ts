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
      const allReservas = await getBeds24Bookings();

      const active = allReservas.filter((r: any) => r.check_in <= todayStr && r.check_out > todayStr);
      const llegadasHoy = allReservas.filter((r: any) => r.check_in === todayStr);
      const salidasHoy = allReservas.filter((r: any) => r.check_out === todayStr);
      const proximas = allReservas.filter((r: any) => r.check_in > todayStr).slice(0, 10);

      contextData += `\n=== FECHA DE HOY: ${todayStr} ===\n`;
      contextData += `\n[HUÉSPEDES EN CASA AHORA] (${active.length} reservas activas):\n${JSON.stringify(active.map((r: any) => ({
        huesped: r.guest_name, habitacion: r.room_name, check_in: r.check_in, check_out: r.check_out, canal: r.channel, telefono: r.guest_phone || 'no disponible', noches: r.nights, tarifa_estimada: r.price_estimate
      })), null, 2)}\n`;
      contextData += `\n[LLEGADAS HOY] (${llegadasHoy.length}):\n${JSON.stringify(llegadasHoy.map((r: any) => ({ huesped: r.guest_name, habitacion: r.room_name, canal: r.channel })), null, 2)}\n`;
      contextData += `\n[SALIDAS HOY] (${salidasHoy.length}):\n${JSON.stringify(salidasHoy.map((r: any) => ({ huesped: r.guest_name, habitacion: r.room_name })), null, 2)}\n`;
      contextData += `\n[PRÓXIMAS LLEGADAS] (siguientes 10):\n${JSON.stringify(proximas.map((r: any) => ({ huesped: r.guest_name, habitacion: r.room_name, check_in: r.check_in, check_out: r.check_out, canal: r.channel, noches: r.nights })), null, 2)}\n`;
      contextData += `\n[TOTAL RESERVAS EN SISTEMA]: ${allReservas.length}\n`;
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

        const { data: payroll } = await supabase
          .from("payroll")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);
        if (payroll) {
          contextData += `\nNóminas recientes:\n${JSON.stringify(payroll, null, 2)}\n`;
        }
      }
    } catch (dbErr) {
      console.error("DB fetch error (non-fatal):", dbErr);
    }

    const systemPrompt = isAdmin
      ? `Eres Jaroje AI, el Asistente Inteligente del Hotel Jaroje. Eres el consejero de confianza del Administrador.
Tienes acceso a datos en tiempo real de la base de datos del hotel:
${contextData}
Reglas:
1. Usa los datos proporcionados arriba para responder preguntas. No inventes números.
2. Responde de forma profesional, concisa y útil.
3. El hotel usa Pesos Mexicanos (MXN).`
      : `Eres Jaroje AI, el Asistente del Hotel Jaroje para el personal de Recepción.
Datos actuales:
${contextData}
Reglas ESTRICTAS:
1. NUNCA hables de nóminas, salarios, finanzas, bancos, ingresos ni gastos.
2. Si te preguntan algo financiero, di: "Lo siento, no tengo permisos para consultar datos financieros."
3. Solo puedes ayudar con información sobre los huéspedes en casa.
4. Responde de forma breve y profesional.`;

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
