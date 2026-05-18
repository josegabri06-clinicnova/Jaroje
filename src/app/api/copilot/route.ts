import { openai } from "@ai-sdk/openai";
import { streamText, tool } from "ai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// Supabase client (Service Role for full access)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result: any = streamText({
    model: openai("gpt-4o") as any,
    system: `Eres Jaroje AI, el Asistente Inteligente del Hotel Jaroje. 
    Tu objetivo es ayudar al administrador a entender la operativa y las finanzas del hotel.
    
    Tienes acceso a herramientas para consultar la base de datos de:
    - Nóminas (tabla 'payroll'): Pagos a empleados.
    - Finanzas (tablas 'finances' y 'accounts'): Movimientos de sobres de efectivo y bancos.
    - Check-ins (tabla 'checkins'): Estado de huéspedes en casa.
    
    Reglas:
    1. Si te preguntan sobre dinero, sé preciso. Usa el formato MX$ para moneda.
    2. Si no tienes datos suficientes, usa las herramientas. No inventes números.
    3. Responde de forma profesional, concisa y útil (estilo SaaS Premium).
    4. El hotel usa Pesos Mexicanos (MXN).`,
    messages,
    tools: {
      get_payroll: tool({
        description: "Obtiene el historial de nóminas y pagos a empleados.",
        parameters: z.object({
          limit: z.number().optional().default(50),
        }),
        execute: async ({ limit }: any) => {
          const { data } = await supabase
            .from("payroll")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(limit);
          return data;
        },
      } as any),
      get_finances: tool({
        description: "Obtiene los movimientos financieros recientes de los sobres y bancos.",
        parameters: z.object({
          limit: z.number().optional().default(50),
        }),
        execute: async ({ limit }: any) => {
          const { data } = await supabase
            .from("finances")
            .select("*, accounts(name)")
            .order("date", { ascending: false })
            .limit(limit);
          return data;
        },
      } as any),
      get_accounts_summary: tool({
        description: "Obtiene el saldo actual de todos los sobres y cuentas de banco.",
        parameters: z.object({}),
        execute: async () => {
          const { data } = await supabase.from("accounts").select("*");
          return data;
        },
      } as any),
      get_current_guests: tool({
        description: "Consulta qué huéspedes están actualmente en el hotel (check-in activo).",
        parameters: z.object({}),
        execute: async () => {
          const { data } = await supabase
            .from("checkins")
            .select("*")
            .eq("status", "checked_in");
          return data;
        },
      } as any),
    },
  });

  return result.toDataStreamResponse();
}
