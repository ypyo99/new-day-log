const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwtz2B3wl9Bk3AgoPEO9Jz3PkPRAJEq11N28YW8fZC4x3oVo0ls1p9rkUxMEnL7_ak5Hg/exec";

const teams = ["1팀", "2팀", "3팀", "취업팀", "기타참여자"];

async function run() {
  console.log("Migration started...");
  for (const team of teams) {
    console.log(`\n--- Fetching teachers for ${team} ---`);
    const teacherRes = await fetch(`${GOOGLE_SCRIPT_URL}?action=getTeachers&team=${encodeURIComponent(team)}`);
    if (!teacherRes.ok) {
       console.log("Failed to fetch teachers for", team);
       continue;
    }
    const { teachers } = await teacherRes.json();
    if (!teachers || teachers.length === 0) {
      console.log("No teachers found for", team);
      continue;
    }
    console.log(`Found ${teachers.length} teachers:`, teachers);

    for (const teacher of teachers) {
      console.log(`Fetching schedule for ${teacher} in ${team}...`);
      const schedRes = await fetch(`${GOOGLE_SCRIPT_URL}?action=getScheduleAll&team=${encodeURIComponent(team)}&teacher=${encodeURIComponent(teacher)}`);
      if (!schedRes.ok) {
         console.log(`Failed to fetch schedule for ${teacher}`);
         continue;
      }
      let schedule;
      try {
        schedule = await schedRes.json();
      } catch (e) {
        console.log(`Failed to parse json for ${teacher}`, e);
        continue;
      }
      
      const upsertData = [];
      for (const date in schedule) {
        for (const shift in schedule[date]) {
          const entry = schedule[date][shift];
          if (!entry.student && !entry.location && !entry.status) continue;
          
          let signature_url = null;
          let location = entry.location || "";
          
          if (team.includes("취업팀") && location.startsWith("http")) {
            signature_url = location; 
            location = "";
          }

          upsertData.push({
            team,
            log_date: date,
            teacher,
            shift,
            student: entry.student || "",
            location,
            status: entry.status || "",
            signature_url
          });
        }
      }

      if (upsertData.length > 0) {
        console.log(`Upserting ${upsertData.length} records for ${teacher}...`);
        
        const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify(upsertData)
        });
        
        if (!sbRes.ok) {
          const errText = await sbRes.text();
          console.error("Upsert failed:", errText);
        } else {
          console.log("Upsert success!");
        }
      }
    }
  }
  console.log("\nMigration completed!");
}
run();
