const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://acbvhhzjbotgtynafemy.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjYnZoaHpqYm90Z3R5bmFmZW15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MzY4MDIsImV4cCI6MjA5NTExMjgwMn0.VfufRzGX0tJ4kY23hK_PlyDsTFYGDZzuWVYywxZUTss";
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('finances')
    .select('amount, type, category')
    .eq('type', 'gasto')
    .limit(10);
  if (error) {
    console.error(error);
  } else {
    console.log("Gastos:", data);
  }
}
check();
