const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkBooking() {
  const { data: localData, error: localErr } = await supabase
    .from('local_reservas')
    .select('*')
    .eq('guest_name', 'ROLANDO DIAZ CEBALLOS');
  
  console.log("Local Reservas for Rolando:", localData, localErr);

  const { data: b24Data, error: b24Err } = await supabase
    .from('beds24_reservations')
    .select('*');

  console.log("Beds24 Reservations metadata (all):", b24Data, b24Err);
}

checkBooking();
