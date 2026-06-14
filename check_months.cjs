const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAll() {
  let allData = [];
  let start = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('daily_logs')
      .select('log_date')
      .range(start, start + limit - 1);

    if (error) {
      console.error(error);
      return;
    }
    if (data && data.length > 0) {
      allData = allData.concat(data);
      start += limit;
      if (data.length < limit) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  const counts = {};
  allData.forEach(row => {
    if (!row.log_date) return;
    const prefix = row.log_date.substring(0, 7);
    counts[prefix] = (counts[prefix] || 0) + 1;
  });

  for (const month of Object.keys(counts).sort()) {
    console.log(`${month}: ${counts[month]} records`);
  }
}
checkAll();
