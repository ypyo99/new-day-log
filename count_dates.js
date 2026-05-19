const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';

async function run() {
  const teams = ["1팀", "2팀", "3팀", "취업팀", "기타참여자"];
  
  for (const team of teams) {
    const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs?team=eq.${encodeURIComponent(team)}&student=neq.&student=not.is.null&select=count`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'count=exact'
      }
    });
    
    if (sbRes.ok) {
       const contentRange = sbRes.headers.get('content-range');
       console.log(`Team: ${team} (with student), Content-Range: ${contentRange}`);
    } else {
       console.log(`Error fetching ${team}:`, await sbRes.text());
    }
  }
}
run();
