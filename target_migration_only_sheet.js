const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwtz2B3wl9Bk3AgoPEO9Jz3PkPRAJEq11N28YW8fZC4x3oVo0ls1p9rkUxMEnL7_ak5Hg/exec";

// 헬퍼: sleep 함수
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  console.log("=== 1. Supabase daily_logs 데이터 전체 삭제 ===");
  // RLS 및 보안 제약으로 인해 조건부 삭제 시 전체를 삭제하기 위해 team이 not null인 조건 설정
  const deleteRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs?team=not.is.null`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });

  if (!deleteRes.ok) {
     console.error("데이터 삭제 실패:", await deleteRes.text());
     return;
  }
  console.log("기존 수업 기록 삭제 완료!");

  console.log("\n=== 2. Supabase teachers 테이블에서 선생님 명단 로드 ===");
  const teachersRes = await fetch(`${SUPABASE_URL}/rest/v1/teachers?select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });

  if (!teachersRes.ok) {
     console.error("선생님 명단 로드 실패:", await teachersRes.text());
     return;
  }
  const teachersResJson = await teachersRes.json();
  const targetTeams = ['1팀', '2팀', '3팀', '취업팀'];
  const teachers = teachersResJson.filter(t => targetTeams.includes(t.team.trim()));
  console.log(`선생님 명단 로드 완료: 총 ${teachers.length}명`);

  const migratedRecords = [];

  console.log("\n=== 3. 구글 시트에서 기존 데이터 마이그레이션 ===");
  for (let i = 0; i < teachers.length; i++) {
     const t = teachers[i];
     const teacherName = t.name.trim();
     const team = t.team.trim();
     
     console.log(`[${i+1}/${teachers.length}] ${team} - ${teacherName} 선생님의 일정 가져오는 중...`);
     
     let schedule = {};
     let fetchSuccess = false;
     const queryTeacherName = teacherName.replace(/\r?\n|\r/g, "/");
     for (let attempt = 1; attempt <= 3; attempt++) {
       try {
         const controller = new AbortController();
         const timeoutId = setTimeout(() => controller.abort(), 30000); // 30초 타임아웃
 
         const schedRes = await fetch(`${GOOGLE_SCRIPT_URL}?action=getScheduleAll&team=${encodeURIComponent(team)}&teacher=${encodeURIComponent(queryTeacherName)}`, {
           signal: controller.signal
         });
         clearTimeout(timeoutId);
 
         if (schedRes.ok) {
            schedule = await schedRes.json();
            fetchSuccess = true;
            break;
         } else {
            console.warn(`  구글 시트 일정 가져오기 시도 ${attempt} 실패 (Status: ${schedRes.status})`);
         }
       } catch (err) {
          console.error(`  구글 시트 API 호출 시도 ${attempt} 에러:`, err.message);
       }
       if (attempt < 3) {
         console.log(`  1.5초 후 재시도합니다...`);
         await sleep(1500);
       }
     }

     if (!fetchSuccess) {
       console.error(`❌ ${teacherName} 선생님의 일정을 구글 시트에서 가져오는 데 실패했습니다.`);
       continue;
     }
     
     let teacherRecordCount = 0;
     for (const date in schedule) {
       for (const shift in schedule[date]) {
         const entry = schedule[date][shift];
         const hasData = entry.student || entry.location || entry.status;
         
         if (hasData) {
            let signature_url = null;
            let location = entry.location || "";
            
            if (team.includes("취업팀") && location.startsWith("http")) {
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
            teacherRecordCount++;
         }
       }
     }
     console.log(`  -> 수집된 실제 기록 수: ${teacherRecordCount}개`);

     // 구글 API 요청 간 딜레이 제공 (Rate Limit 방지)
     await sleep(100);
  }

  console.log(`\n구글 시트 데이터 마이그레이션 완료: 총 ${migratedRecords.length}개의 실제 기록 수집됨`);

  if (migratedRecords.length === 0) {
    console.log("가져온 실제 기록이 없습니다. 삽입 프로세스를 스킵합니다.");
    return;
  }

  console.log(`\n=== 4. Supabase에 전체 데이터 삽입 (총 ${migratedRecords.length}개) ===`);

  // 1000개 단위로 청크 분할하여 벌크 삽입 진행
  const chunkSize = 1000;
  for (let i = 0; i < migratedRecords.length; i += chunkSize) {
    const chunk = migratedRecords.slice(i, i + chunkSize);
    console.log(`Inserting chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(migratedRecords.length/chunkSize)} (${chunk.length} records)...`);
    
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
       console.error(`  청크 삽입 실패:`, await sbRes.text());
    } else {
       console.log(`  청크 삽입 성공!`);
    }
    await sleep(200); // 데이터베이스 부하 방지용 딜레이
  }

  console.log("\n마이그레이션 프로세스가 성공적으로 완료되었습니다!");
}

run();
