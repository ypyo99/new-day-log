const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';

async function run() {
  console.log("Fetching teachers from Supabase...");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/teachers?select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  if (!res.ok) {
    console.error("Failed to fetch teachers:", await res.text());
    return;
  }
  const teachers = await res.json();
  console.log(`Total teachers: ${teachers.length}`);
  const teams = {};
  teachers.forEach(t => {
    teams[t.team] = (teams[t.team] || 0) + 1;
  });
  console.log("Teachers by team:", teams);
  console.log("Teacher details:", teachers.map(t => ({name: t.name, team: t.team, shifts: [t.shift1, t.shift2, t.shift3].filter(Boolean)})));
}
run();
