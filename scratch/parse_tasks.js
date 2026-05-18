const fs = require('fs');

const rawText = `
◯ Limpieza aires acondicionados.
   ✔ 101
   ✔ 102
   ✔ 103,104,105,106.
   ✔ 201,
   ✔ 202
   ✔ 203.
   ◦ 204
   ✔ 205
   ✔ 206
   ✔ 301
   ✔ 302
   ✔ 303
   ◦ 304
   ✔ 305
   ✔ 306
   ✔ Cocina
   ✔ E500
   ✔ 107
   ✔ Loft.
   ◦ Casa
◯ Puerta principal 206 arrastra.
◯ Resanar puerta 107
◯ Colocar Antiderrapante con color desnivel loft
◯ Colocar focos área estacionamiento de casa
◯ Reparar mesa de centro de palapa
◯ Jaladera closet casa
◯ Mandar a reparar horno de microondas
◯ Reparación de cafeteras.
◯ Foco depa Sr Rolando fundido
◯ Dos cámaras no se ven en sistema
◯ Colocar toallero lado baño principal casa
◯ Chapa puerta principal de casa. Cambiar
◯ Verificar limpieza filtros RIEGOS (ROBERTO) (lun 2 de mar)
   ◦ Riego CENTRAL
   ◦ Riego 304-306
   ◦ Riego 301-303
   ◦ Riego jardín
   ◦ Jardineras afuera
   ◦ Jardinera alberca
◯ Verificar limpieza filtros (APAGAR PASTILLAS LUZ) (mar, 4 de nov de 2025)
   ◦ Secadora Industrial
   ◦ Lavadora Industrial
   ◦ Lavadoras pequeñas
   ◦ Secadoras pequeñas
   ◦ Limpieza atras de maquinas de lavandería
◯ Cambio piso 103 baño (lun, 28 de jul de 2025)
◯ Reportar luces de alumbrado público estén funcionando correctamente (mar, 5 de ago de 2025)
◯ Revisar y retocar Impermeabilizacion (lun 23 de mar)
   ◦ 100
   ◦ 200
   ◦ Casa
   ◦ Lavandería y loft
◯ Verificar quemadores de Secadora industrial (lun, 28 de abr de 2025)
◯ PEDIR GAS (mié 15 de abr)
◯ Acomodo y limpieza de bodega y taller (lun, 19 de may de 2025)
◯ Cambio mangueras boylers de 1/2 a 3/4 (dom, 31 de ago de 2025)
   ◦ 101
   ◦  102
   ✔ 103
   ✔ 104
   ◦ 105
   ◦ 106
◯ Colocación de cemento blanco, cal con pintura en barda del vecino (mar, 15 de jul de 2025)
◯ Instalar Electronivel sisterna azul, poner by Pass y poner pastilla para bomba.
◯ Limpieza de tinacos (mar, 2 de sep de 2025)
◯ Remplazo total de cuellos de cera de todos los baños de la casa (sáb, 30 de ago de 2025)
◯ Manijas carpintería  casa y 107 (mar, 5 de ago de 2025)
◯ Limpieza de registros eléctricos (IVAN-ELIHU) (antes de las lluvias) (mar, 1 de jun de 2027)
◯ PEDIR GAS (vie 1 de may)
✔ Apagador ventilador 301,105
✔ Checar plantas interiores.
✔ Resanar baño 305
✔ Resanar baño 204
✔ Apretar papelera de la 101 baño
✔ Quitar tabla roca 503 13 /marzo
✔ Ventilador 203 checar
✔ Ventilador 306 esta lento
✔ Puerta de basurero. Checar chapa.
✔ Colocar porta cigarros.
✔ Foco parte exterior pasillo 102
✔ Fuga de la 203 tarja
✔ Chapa reparación 103
✔ Ajustar porta escobas área patio de tendido.
✔ Reparación de tendederos
✔ Mezcladora floja 506
✔ Mezcladora floja 306
✔ Chapa floja 306
✔ Ivan te mando pendientes de MTTO para que los agregues xf
✔ Cambio cuello de cera baño 107.
✔ 203 ventilador de sala se mueve mucho
✔ Mezcladora 301 se mueve
✔ 106 ventana atorada
✔ Reparación de pistola de hidrolavadora
✔ Chapa depa sr Rolando.
✔ Colocar control ventilador de baño.
✔ Mezcladora de casa esta floja.
✔ Baño de casa de abajo checar focos.
✔ Colocar maya a coladeras, dos exterior y área de jardín
✔ Reparación rociador area jardín alado de la alberca.
✔ Tablaroca Puertas de comunicación 103,106
✔ Sanitario 107 reparación en tanque
✔ Silla blanca de comedor le falta tornillo a respaldo
✔ Mezcladora 107 floja
✔ Quitar decoración navideña
✔ Checar secadora industrial. Ruido en baleros
✔ Cono de coladera 303
✔ Apagador 107 lavandería.
✔ 206 checar plafon baño
✔ 107 tarja.
✔ Chapa floja 103.
✔ Reparación de manija secadora pequeña.
✔ Reparación de 2 sillas de la cocina.
✔ Verificación plaga en macetas.
✔ Seguro ventana 106
✔ Foco fundido pasillo 105
✔ Reparación de locetas área de alberca exterior
✔ Cono 102 regadera
✔ Bambú 104 recamara principal despegado
✔ Ventilador de cocina empleados.
✔ Cono baño 104
✔ Cambio de ventilador 401
✔ Cambiar chapa bodega 401
✔ Foco fundido 304.
✔ Cambiar electro nivel tinaco de recepción
✔ Reparación de pieza refrigerador 304
✔ 306 chapa floja
✔ Tubo de boiler 102 pintar
✔ Cespol 107
✔ Cortina 201 suena.
✔ Cambio de lámpara de la 103 baño
✔ Cespol 205
✔ Sapo baño mujeres.
✔ 304 fuga llave lavabo
✔ Baño 401 siempre huele a drenaje
✔ Foco fachada 101
✔ Puerta 106 rechina
✔ Agregar Antiderrapantes al siguiente escalón y sellar detalles de alberca con cemento blanco.
✔ Mezcladora 105 cambiar
✔ Foco lado plafon recepción
✔ Plafon área de recepción
✔ Lavabo cambiar mezcladora 203
✔ Instalación de dos focos lado jardinería de enemedio.
✔ Pegar lámpara de area de alberca
✔ Secadora pequeña no enciende
✔ Reparación de tapa de lavadora pequeña
✔ Coladera regadera áreas publicas.
✔ Filtración patio de tendido 203.
✔ Foco lateral 201.
✔ 302 asiento de wc
✔ Limpieza de cebollas.
✔ Reparación de cafetera
✔ Sellar ventana de la casa. Recamara king filtra cuando llueve
✔ Foco fachada 101 no esta funcionando.
✔ Checar cámaras qué no funcionan.
✔ Reparación tres filtraciones por lluvias en loft.
✔ Colocación de atrapolvos puertas blancas
✔ Reparación de detalle de la 301.en piso de arriba
✔ Chapa 102 checar.
✔ Chapa 107
✔ Cambio de foto celda lado recepción.
✔ Colocar flor de mayo donde estaba el limonar.
✔ Mantenimiento secadora chica
✔ Reparación piso área de alberca
✔ 202 mezcladora.
✔ 203 cespol lavadero
✔ Termitas en palapas
✔ 201 atrapolvo.
✔ Colocación de trampas en pasillos para lagartijas.
✔ 102 fregadero tiene fuga.
✔ Foco fundido 107, pasillo e500
✔ 401 no tiene atrapa polvo puerta lavandería.
✔ Mosquitero 303 roto
✔ Silla rota se dejó en el comedor
✔ Cambiar asiento wc de la casa.
✔ Quitar sarro ventilador 103. Cama king size.
✔ Pintura de aceite en parrilla refrigerador 103
✔ Pintura en detalle de la 101 color blanco cerca de la cocina.
✔ Cambio de fotocelda recepción
✔ Colocar tendederos en habitaciones
✔ Cambio de foco lámparas. Pasillo de enmedio
✔ Pintar tubo boyler casa
✔ Refrigerador 107 tira agua
✔ Colocar antiderrapante en primer escalón de Alberca
✔ Reparar tubo de bomba de sisterna azul
✔ Colocación 1 reflectores lado casa.
✔ Verificar limpieza filtros RIEGOS (ROBERTO) (lun, 10 de nov de 2025)
   ◦ Riego CENTRAL
   ◦ Riego 304-306
   ◦ Riego 301-303
   ◦ Riego jardín
   ◦ Jardineras afuera
   ◦ Jardinera alberca
✔ Verificar limpieza filtros RIEGOS (ROBERTO) (lun, 8 de dic de 2025)
   ◦ Riego CENTRAL
   ◦ Riego 304-306
   ◦ Riego 301-303
   ◦ Riego jardín
   ◦ Jardineras afuera
   ◦ Jardinera alberca
✔ Verificar limpieza filtros RIEGOS (ROBERTO) (lun 19 de ene)
   ◦ Riego CENTRAL
   ◦ Riego 304-306
   ◦ Riego 301-303
   ◦ Riego jardín
   ◦ Jardineras afuera
   ◦ Jardinera alberca
✔ Verificar limpieza filtros RIEGOS (ROBERTO) (lun, 29 de sep de 2025)
   ◦ Riego CENTRAL
   ◦ Riego 304-306
   ◦ Riego 301-303
   ◦ Riego jardín
   ◦ Jardineras afuera
   ◦ Jardinera alberca
✔ Verificar limpieza filtros RIEGOS (ROBERTO) (lun 2 de feb)
   ◦ Riego CENTRAL
   ◦ Riego 304-306
   ◦ Riego 301-303
   ◦ Riego jardín
   ◦ Jardineras afuera
   ◦ Jardinera alberca
✔ Verificar limpieza filtros RIEGOS (ROBERTO) (lun 16 de feb)
   ◦ Riego CENTRAL
   ◦ Riego 304-306
   ◦ Riego 301-303
   ◦ Riego jardín
   ◦ Jardineras afuera
   ◦ Jardinera alberca
✔ Verificar limpieza filtros RIEGOS (ROBERTO) (lun 5 de ene)
   ◦ Riego CENTRAL
   ◦ Riego 304-306
   ◦ Riego 301-303
   ◦ Riego jardín
   ◦ Jardineras afuera
   ◦ Jardinera alberca
✔ Verificar limpieza filtros RIEGOS (ROBERTO) (lun, 13 de oct de 2025)
   ◦ Riego CENTRAL
   ◦ Riego 304-306
   ◦ Riego 301-303
   ◦ Riego jardín
   ◦ Jardineras afuera
   ◦ Jardinera alberca
✔ Verificar limpieza filtros RIEGOS (ROBERTO) (lun, 24 de nov de 2025)
   ◦ Riego CENTRAL
   ◦ Riego 304-306
   ◦ Riego 301-303
   ◦ Riego jardín
   ◦ Jardineras afuera
   ◦ Jardinera alberca
✔ Verificar limpieza filtros RIEGOS (ROBERTO) (lun, 27 de oct de 2025)
   ◦ Riego CENTRAL
   ◦ Riego 304-306
   ◦ Riego 301-303
   ◦ Riego jardín
   ◦ Jardineras afuera
   ◦ Jardinera alberca
✔ Verificar limpieza filtros RIEGOS (ROBERTO) (lun, 22 de dic de 2025)
   ◦ Riego CENTRAL
   ◦ Riego 304-306
   ◦ Riego 301-303
   ◦ Riego jardín
   ◦ Jardineras afuera
   ◦ Jardinera alberca
✔ Verificar limpieza filtros RIEGOS (ROBERTO) (lun, 1 de sep de 2025)
   ◦ Riego CENTRAL
   ◦ Riego 304-306
   ◦ Riego 301-303
   ◦ Riego jardín
   ◦ Jardineras afuera
   ◦ Jardinera alberca
✔ Verificar limpieza filtros RIEGOS (ROBERTO) (lun, 15 de sep de 2025)
   ◦ Riego CENTRAL
   ◦ Riego 304-306
   ◦ Riego 301-303
   ◦ Riego jardín
   ◦ Jardineras afuera
   ◦ Jardinera alberca
✔ Verificar limpieza filtros (APAGAR PASTILLAS LUZ) (mar, 29 de jul de 2025)
   ◦ Secadora Industrial
   ◦ Lavadora Industrial
   ◦ Lavadoras pequeñas
   ◦ Secadoras pequeñas
   ◦ Limpieza atras de maquinas de lavandería
✔ Verificar limpieza filtros (APAGAR PASTILLAS LUZ) (lun, 3 de nov de 2025)
   ◦ Secadora Industrial
   ◦ Lavadora Industrial
   ◦ Lavadoras pequeñas
   ◦ Secadoras pequeñas
   ◦ Limpieza atras de maquinas de lavandería
✔ Verificar limpieza filtros (APAGAR PASTILLAS LUZ) (mar, 12 de ago de 2025)
   ◦ Secadora Industrial
   ◦ Lavadora Industrial
   ◦ Lavadoras pequeñas
   ◦ Secadoras pequeñas
   ◦ Limpieza atras de maquinas de lavandería
✔ Verificar limpieza filtros (APAGAR PASTILLAS LUZ) (mar, 26 de ago de 2025)
   ◦ Secadora Industrial
   ◦ Lavadora Industrial
   ◦ Lavadoras pequeñas
   ◦ Secadoras pequeñas
   ◦ Limpieza atras de maquinas de lavandería
✔ 106 Checar cespol fregadero se tira mucha agua cuando se lavan trastes
✔ Cambio mezcladora lavabo 203
✔ Cambio mezcladora tarja 202
✔ PEDIR GAS (jue 15 de ene)
✔ PEDIR GAS (lun, 15 de sep de 2025)
✔ PEDIR GAS (sáb, 15 de nov de 2025)
✔ PEDIR GAS (mié, 15 de oct de 2025)
✔ PEDIR GAS (dom 15 de mar)
✔ PEDIR GAS (lun, 15 de dic de 2025)
✔ PEDIR GAS (dom 15 de feb)
✔ PEDIR GAS (mié, 1 de oct de 2025)
✔ PEDIR GAS (dom 1 de feb)
✔ PEDIR GAS (lun, 1 de dic de 2025)
✔ PEDIR GAS (lun, 1 de sep de 2025)
✔ PEDIR GAS (mié 1 de abr)
✔ PEDIR GAS (jue 1 de ene)
✔ PEDIR GAS (sáb, 1 de nov de 2025)
✔ PEDIR GAS (dom 1 de mar)
`;

let currentHeader = null;
let currentHeaderStatus = 'pendiente';
const tasks = [];

const lines = rawText.split('\n');
for (const line of lines) {
  const t = line.trim();
  if (!t) continue;
  if (t === 'MANTENIMIENTO' || t.startsWith('- [ ]') || t.includes('Ivan te mando')) continue;

  let status = 'pendiente';
  if (t.startsWith('✔')) status = 'resuelta';
  if (t.startsWith('◯') || t.startsWith('◦')) status = 'pendiente';
  
  const text = t.replace(/^[◯✔◦\-]\s*/, '').trim().replace(/\.$/, '').replace(/,$/, '');

  const isRoomSubItem = line.startsWith('   ') && currentHeader;
  
  if (isRoomSubItem) {
    const rooms = text.split(',').map(r => r.trim());
    for (const r of rooms) {
      if (r) {
        tasks.push({
          room: r,
          description: currentHeader,
          status: status
        });
      }
    }
  } else {
    currentHeader = text;
    currentHeaderStatus = status;

    let room = 'General';
    const roomMatch = text.match(/\b(101|102|103|104|105|106|107|201|202|203|204|205|206|301|302|303|304|305|306|401|503|506|E500|Loft|Casa|Cocina)\b/i);
    if (roomMatch) room = roomMatch[1];
    
    const nextLine = lines[lines.indexOf(line)+1];
    const isHeaderOnly = nextLine && nextLine.startsWith('   ');
    
    if (!isHeaderOnly) {
      tasks.push({
        room: room,
        description: text,
        status: status
      });
    }
  }
}

const sqlInserts = tasks.map(t => {
  const desc = t.description.replace(/'/g, "''");
  const rm = t.room.replace(/'/g, "''");
  return "('" + rm + "', '" + desc + "', '" + t.status + "', 'Admin', 'admin_to_staff', 'mantenimiento')";
});

const sql = "CREATE TABLE IF NOT EXISTS public.tasks (\n" +
"    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,\n" +
"    type TEXT NOT NULL,\n" +
"    room TEXT NOT NULL,\n" +
"    description TEXT NOT NULL,\n" +
"    status TEXT NOT NULL,\n" +
"    reported_by TEXT NOT NULL,\n" +
"    direction TEXT NOT NULL,\n" +
"    image_base64 TEXT,\n" +
"    read_by_admin BOOLEAN DEFAULT true,\n" +
"    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),\n" +
"    resolved_at TIMESTAMP WITH TIME ZONE\n" +
");\n\n" +
"ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;\n" +
"DROP POLICY IF EXISTS \"Enable all for tasks\" ON public.tasks;\n" +
"CREATE POLICY \"Enable all for tasks\" ON public.tasks FOR ALL USING (true);\n\n" +
"INSERT INTO public.tasks (room, description, status, reported_by, direction, type) VALUES\n" +
sqlInserts.join(',\n') + ";\n";

fs.writeFileSync('scratch/supabase_tasks.sql', sql);
console.log('SQL generated!');
