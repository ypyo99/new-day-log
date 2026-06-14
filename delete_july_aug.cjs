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

async function deleteData() {
  console.log('Fetching IDs for July and August...');
  
  let allIds = [];
  let start = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('daily_logs')
      .select('id, log_date')
      .gte('log_date', '2026-07-01')
      .lte('log_date', '2026-08-31')
      .range(start, start + limit - 1);

    if (error) {
      console.error('Error fetching data:', error);
      return;
    }
    
    if (data && data.length > 0) {
      allIds = allIds.concat(data.map(r => r.id));
      start += limit;
      if (data.length < limit) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  console.log(`Found ${allIds.length} records to delete.`);

  // Delete in chunks of 500
  const chunkSize = 500;
  for (let i = 0; i < allIds.length; i += chunkSize) {
    const chunk = allIds.slice(i, i + chunkSize);
    console.log(`Deleting chunk ${i / chunkSize + 1} of ${Math.ceil(allIds.length / chunkSize)}...`);
    const { error } = await supabase
      .from('daily_logs')
      .delete()
      .in('id', chunk);

    if (error) {
      console.error('Error deleting chunk:', error);
    }
  }

  console.log('Deletion complete.');
}

deleteData();
