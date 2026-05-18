import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const newTasks = [
  { room: '102', description: 'fuga lavabo', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'General', description: 'Lubricar ventanas depa', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'General', description: 'Secadora tisna la ropa elihut.', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: '305', description: 'Focos pasillo 305,306 fundidos', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: '203', description: 'Foco pasillo fundido 203', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: '206', description: 'Puerta principal 206 arrastra.', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: '107', description: 'Resanar puerta 107', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'General', description: 'Colocar Antiderrapante con color desnivel loft', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'Casa', description: 'Colocar focos área estacionamiento de casa', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'General', description: 'Reparar mesa de centro de palapa', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: '103', description: 'Tarja tapada 103', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: '205', description: 'Fuga de agua lavabo 205.', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'Casa', description: 'Foco depa Sr Rolando fundido', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'Casa', description: 'Cámara estacionamiento casa reparación', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'Casa', description: 'Colocar toallero lado baño principal casa', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'Casa', description: 'Chapa puerta principal de casa. Cambiar', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  
  { room: 'General', description: 'Verificar limpieza filtros RIEGOS (ROBERTO) (Hoy)\n- Riego CENTRAL\n- Riego 304-306\n- Riego 301-303\n- Riego jardín\n- Jardineras afuera\n- Jardinera alberca', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'General', description: 'Verificar limpieza filtros (APAGAR PASTILLAS LUZ)\n- Secadora Industrial\n- Lavadora Industrial\n- Lavadoras pequeñas\n- Secadoras pequeñas\n- Limpieza atras de maquinas de lavandería', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  
  { room: '103', description: 'Cambio piso 103 baño (lun, 28 de jul de 2025)', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'General', description: 'Reportar luces de entrada a condominios', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'General', description: 'Revisar y retocar Impermeabilizacion\n- 100\n- 200\n- Casa\n- Lavandería y loft', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'General', description: 'Verificar quemadores de Secadora industrial (lun, 28 de abr de 2025)', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'General', description: 'PEDIR GAS (vie 15 de may)', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'General', description: 'Hacer bases de garrafones', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  
  { room: '101', description: 'Cambio mangueras boylers de 1/2 a 3/4', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: '102', description: 'Cambio mangueras boylers de 1/2 a 3/4', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: '103', description: 'Cambio mangueras boylers de 1/2 a 3/4', status: 'resuelta', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: '104', description: 'Cambio mangueras boylers de 1/2 a 3/4', status: 'resuelta', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: '105', description: 'Cambio mangueras boylers de 1/2 a 3/4', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: '106', description: 'Cambio mangueras boylers de 1/2 a 3/4', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  
  { room: 'General', description: 'Colocación de cemento blanco, cal con pintura en barda del vecino (mar, 15 de jul de 2025)', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: '201', description: 'Instalación de agua de los tinacos a lavadero 201', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'General', description: 'Limpieza de tinacos', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'General', description: 'Colocar plafon baño caballeros', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: '107', description: 'Manijas carpintería casa y 107', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'General', description: 'Limpieza de registros eléctricos (IVAN-ELIHU)', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
  { room: 'General', description: 'PEDIR GAS (lun 1 de jun)', status: 'pendiente', reported_by: 'Admin', direction: 'admin_to_staff', type: 'mantenimiento' },
];

async function run() {
  console.log("Deleting old tasks...");
  const { error: delError } = await supabase.from('tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delError) { console.error(delError); return; }
  
  console.log("Inserting new tasks...");
  const { error: insError } = await supabase.from('tasks').insert(newTasks);
  if (insError) { console.error(insError); return; }
  
  console.log("Done!");
}

run();
