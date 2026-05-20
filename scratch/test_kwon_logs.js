const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';

async function run() {
  const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs?teacher=eq.권오삼&select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  if (sbRes.ok) {
    const data = await sbRes.json();
    const activeLogs = data.filter(r => r.student);
    console.log(`Supabase daily_logs for 권오삼: 총 ${data.length}개 슬롯 (실제 수업: ${activeLogs.length}개)`);
  } else {
    console.error("Failed to load:", await sbRes.text());
  }
}
run();
