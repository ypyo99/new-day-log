const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwtz2B3wl9Bk3AgoPEO9Jz3PkPRAJEq11N28YW8fZC4x3oVo0ls1p9rkUxMEnL7_ak5Hg/exec";

// ???: sleep ???
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  console.log("=== 1. Supabase daily_logs ???????? ??? ===");
  // RLS ????? ?????? ??? ????? ??? ????????????? ??? team??not null????? ???
  const deleteRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs?team=not.is.null`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });

  if (!deleteRes.ok) {
     console.error("???????? ???:", await deleteRes.text());
     return;
  }
  console.log("??? ??? ??? ??? ???!");

  console.log("\n=== 2. Supabase teachers ???????????????? ??? ===");
  const teachersRes = await fetch(`${SUPABASE_URL}/rest/v1/teachers?select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });

  if (!teachersRes.ok) {
     console.error("???????? ??? ???:", await teachersRes.text());
     return;
  }
  let teachers = await teachersRes.json();
  console.log(`전체 선생님 명단 로드 완료: 총 ${teachers.length}명`);
  
  const targetTeams = ["1팀", "2팀", "3팀", "취업팀"];
  teachers = teachers.filter(t => targetTeams.includes(t.team.trim()));
  console.log(`타겟 선생님 명단 필터링 완료: 총 ${teachers.length}명`);

  const migratedRecords = [];
  const teacherActiveDays = {}; // 각 교사별 근무 요일 (0:일, 1:월, ..., 6:토)

  console.log("\n=== 3. 구글 시트에서 기존 데이터 마이그레이션 및 근무 요일 분석 ===");
  for (let i = 0; i < teachers.length; i++) {
     const t = teachers[i];
     const teacherName = t.name.trim();
     const team = t.team.trim();
     
     console.log(`[${i+1}/${teachers.length}] ${team} - ${teacherName} ?????? ??? ?????????..`);
     
     let schedule = {};
     let fetchSuccess = false;
     const queryTeacherName = teacherName.replace(/\r?\n|\r/g, "/");
     for (let attempt = 1; attempt <= 3; attempt++) {
       try {
         const controller = new AbortController();
         const timeoutId = setTimeout(() => controller.abort(), 30000); // 30?????????
         const schedRes = await fetch(`${GOOGLE_SCRIPT_URL}?action=getScheduleAll&team=${encodeURIComponent(team)}&teacher=${encodeURIComponent(queryTeacherName)}`, {
           signal: controller.signal
         });
         clearTimeout(timeoutId);

         if (schedRes.ok) {
            schedule = await schedRes.json();
            fetchSuccess = true;
            break;
         } else {
            console.warn(`  ??? ??? ??? ?????????? ${attempt} ??? (Status: ${schedRes.status})`);
         }
       } catch (err) {
          console.error(`  ??? ??? API ??? ??? ${attempt} ???:`, err.message);
       }
       if (attempt < 3) {
         console.log(`  1.5?????????????...`);
         await sleep(1500);
       }
     }

     const activeDays = new Set();
     
     for (const date in schedule) {
       const day = new Date(date).getDay();
       
       for (const shift in schedule[date]) {
         const entry = schedule[date][shift];
         const hasData = entry.student || entry.location || entry.status;
         
         if (hasData) {
            // ??? ?????? ??? ??? ???
            activeDays.add(day);
            
            let signature_url = null;
            let location = entry.location || "";
            
            if (team.includes("?????") && location.startsWith("http")) {
              signature_url = location; 
              location = "";
            }

            migratedRecords.push({
              team,
              log_date: date,
              teacher: teacherName,
              shift,
              student: entry.student || "",
              location,
              status: entry.status || "",
              signature_url
            });
         }
       }
     }

     // ??? ??? ??? ???????? ??????????????? ??? ???(????????? ?????? ???
     if (activeDays.size === 0) {
        teacherActiveDays[teacherName] = [1, 2, 3, 4, 5];
        console.log(`  -> ??? ??? ???. ???????? ???: ?? ?? ?? ?? ??);
     } else {
        teacherActiveDays[teacherName] = Array.from(activeDays).sort();
        const dayNames = ['??, '??, '??, '??, '??, '??, '??];
        const dayNamesStr = teacherActiveDays[teacherName].map(d => dayNames[d]).join(', ');
        console.log(`  -> ???????? ???: ${dayNamesStr}`);
     }

     // ??? API ??? ?????????? (Rate Limit ???)
     await sleep(100);
  }

  console.log(`\n??? ??? ?????????????? ???: ??${migratedRecords.length}??? ??? ??? ?????);

  console.log("\n=== 4. 2026??11??30????? ?????(???????) ??? ===");
  // ??? ??? ???: 2026-02-23 ~ 2026-11-30
  const startDate = new Date("2026-02-23");
  const endDate = new Date("2026-11-30");

  const dateList = [];
  let curr = new Date(startDate);
  while (curr <= endDate) {
    const day = curr.getDay();
    if (day !== 0 && day !== 6) { // ??? ???
      const yyyy = curr.getFullYear();
      const mm = String(curr.getMonth() + 1).padStart(2, '0');
      const dd = String(curr.getDate()).padStart(2, '0');
      dateList.push(`${yyyy}-${mm}-${dd}`);
    }
    curr.setDate(curr.getDate() + 1);
  }

  console.log(`??????? ??? ?? ??${dateList.length}??);

  // ????????????????? { teacher, date, shift } ??? ????? Set
  const existingKeys = new Set(migratedRecords.map(r => `${r.teacher.trim()}_${r.log_date}_${r.shift.trim()}`));
  const prepRecords = [];

  for (const t of teachers) {
    const teacherName = t.name.trim();
    const activeDays = teacherActiveDays[teacherName] || [1, 2, 3, 4, 5];
    
    // ?????? ??? ????? ???
    const shifts = [t.shift1, t.shift2, t.shift3].map(s => (s || "").trim()).filter(Boolean);
    if (shifts.length === 0) continue;

    for (const date of dateList) {
      const day = new Date(date).getDay();
      if (activeDays.includes(day)) {
        for (const shift of shifts) {
          const key = `${teacherName}_${date}_${shift}`;
          if (!existingKeys.has(key)) {
             prepRecords.push({
               team: t.team.trim(),
               log_date: date,
               teacher: teacherName,
               shift,
               student: "",
               location: "",
               status: "",
               signature_url: null
             });
          }
        }
      }
    }
  }

  console.log(`??????????(???????) ??????? ??${prepRecords.length}??);

  const allRecordsToInsert = [...migratedRecords, ...prepRecords];
  console.log(`\n=== 5. Supabase????? ???????? (??${allRecordsToInsert.length}?? ===`);

  // 1000?????????? ?????? ??? ??? ???
  const chunkSize = 1000;
  for (let i = 0; i < allRecordsToInsert.length; i += chunkSize) {
    const chunk = allRecordsToInsert.slice(i, i + chunkSize);
    console.log(`Inserting chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(allRecordsToInsert.length/chunkSize)} (${chunk.length} records)...`);
    
    const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(chunk)
    });

    if (!sbRes.ok) {
       console.error(`  ??? ??? ???:`, await sbRes.text());
    } else {
       console.log(`  ??? ??? ???!`);
    }
    await sleep(200); // ????????? ??????????????  }

  console.log("\n??? ????????? ??11??30?????????? ??? ???????? ???????????????????");
}

r u n ( ) ;  
 