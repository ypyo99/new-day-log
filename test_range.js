const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';

async function run() {
  const team = '1팀';
  const month = '2026-02';
  const [year, monthStr] = month.split('-');
  const firstDay = `${month}-01`;
  const lastDay = new Date(parseInt(year), parseInt(monthStr), 0).getDate();
  const lastDayStr = `${month}-${String(lastDay).padStart(2, '0')}`;

  const url = `${SUPABASE_URL}/rest/v1/daily_logs?team=eq.${encodeURIComponent(team)}&log_date=gte.${firstDay}&log_date=lte.${lastDayStr}`;
  const sbRes = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  console.log("Status:", sbRes.status);
  const data = await sbRes.json();
  console.log("Response records count:", data.length);
}
run();
