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
  const teachers = await teachersRes.json();
  console.log(`선생님 명단 로드 완료: 총 ${teachers.length}명`);

  const migratedRecords = [];
  const teacherActiveDays = {}; // 각 교사별 근무 요일 (0:일, 1:월, ..., 6:토)

  console.log("\n=== 3. 구글 시트에서 기존 데이터 마이그레이션 및 근무 요일 분석 ===");
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

     const activeDays = new Set();
     
     for (const date in schedule) {
       const day = new Date(date).getDay();
       
       for (const shift in schedule[date]) {
         const entry = schedule[date][shift];
         const hasData = entry.student || entry.location || entry.status;
         
         if (hasData) {
            // 실제 데이터가 있는 요일 수집
            activeDays.add(day);
            
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
         }
       }
     }

     // 만약 실제 입력 기록이 없어 수집된 요일이 없다면, 평일 전체(월~금)를 기본 근무일로 설정
     if (activeDays.size === 0) {
        teacherActiveDays[teacherName] = [1, 2, 3, 4, 5];
        console.log(`  -> 근무 이력 없음. 디폴트 요일 설정: 월, 화, 수, 목, 금`);
     } else {
        teacherActiveDays[teacherName] = Array.from(activeDays).sort();
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        const dayNamesStr = teacherActiveDays[teacherName].map(d => dayNames[d]).join(', ');
        console.log(`  -> 분석된 근무 요일: ${dayNamesStr}`);
     }

     // 구글 API 요청 간 딜레이 제공 (Rate Limit 방지)
     await sleep(100);
  }

  console.log(`\n구글 시트 데이터 마이그레이션 완료: 총 ${migratedRecords.length}개의 실제 기록 수집됨`);

  console.log("\n=== 4. 2026년 11월 30일까지 빈 공간(저장 슬롯) 생성 ===");
  // 날짜 범위 설정: 2026-02-23 ~ 2026-11-30
  const startDate = new Date("2026-02-23");
  const endDate = new Date("2026-11-30");

  const dateList = [];
  let curr = new Date(startDate);
  while (curr <= endDate) {
    const day = curr.getDay();
    if (day !== 0 && day !== 6) { // 주말 제외
      const yyyy = curr.getFullYear();
      const mm = String(curr.getMonth() + 1).padStart(2, '0');
      const dd = String(curr.getDate()).padStart(2, '0');
      dateList.push(`${yyyy}-${mm}-${dd}`);
    }
    curr.setDate(curr.getDate() + 1);
  }

  console.log(`대상 평일 날짜 수: 총 ${dateList.length}일`);

  // 마이그레이션된 기록들의 { teacher, date, shift } 중복 검사용 Set
  const existingKeys = new Set(migratedRecords.map(r => `${r.teacher.trim()}_${r.log_date}_${r.shift.trim()}`));
  const prepRecords = [];

  for (const t of teachers) {
    const teacherName = t.name.trim();
    const activeDays = teacherActiveDays[teacherName] || [1, 2, 3, 4, 5];
    
    // 선생님의 정규 시간대 목록
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

  console.log(`생성할 빈 공간(저장 슬롯) 레코드 수: 총 ${prepRecords.length}개`);

  const allRecordsToInsert = [...migratedRecords, ...prepRecords];
  console.log(`\n=== 5. Supabase에 전체 데이터 삽입 (총 ${allRecordsToInsert.length}개) ===`);

  // 1000개 단위로 청크 분할하여 벌크 삽입 진행
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
       console.error(`  청크 삽입 실패:`, await sbRes.text());
    } else {
       console.log(`  청크 삽입 성공!`);
    }
    await sleep(200); // 데이터베이스 부하 방지용 딜레이
  }

  console.log("\n전체 마이그레이션 및 11월 30일까지의 공간 생성 프로세스가 성공적으로 완료되었습니다!");
}

run();
