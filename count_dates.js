const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';

async function run() {
  const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  if (sbRes.ok) {
     const data = await sbRes.json();
     console.log("Total records:", data.length);
     const months = {};
     data.forEach(r => {
        const month = r.log_date ? r.log_date.substring(0, 7) : 'no-date';
        months[month] = (months[month] || 0) + 1;
     });
     console.log("Records per month:", months);
  } else {
     console.log("Error:", await sbRes.text());
  }
}
run();
