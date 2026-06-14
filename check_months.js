require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDates() {
  console.log('Checking records for July and August...');
  const { data, error } = await supabase
    .from('daily_logs')
    .select('log_date');

  if (error) {
    console.error('Error fetching data:', error);
    return;
  }

  const counts = {};
  data.forEach(row => {
    if (!row.log_date) return;
    const prefix = row.log_date.substring(0, 7); // YYYY-MM
    counts[prefix] = (counts[prefix] || 0) + 1;
  });

  console.log('Record counts by month:');
  for (const month of Object.keys(counts).sort()) {
    console.log(`${month}: ${counts[month]} records`);
  }
}

checkDates();
