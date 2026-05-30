const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwtz2B3wl9Bk3AgoPEO9Jz3PkPRAJEq11N28YW8fZC4x3oVo0ls1p9rkUxMEnL7_ak5Hg/exec";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  console.log("=== [양방향 전수 검증] 마이그레이션 교차 검증 시작 ===");
  
  // 1. Supabase에서 선생님 명단 로드
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

  // 구글 시트에서 모든 선생님의 실제 데이터를 가져와 맵으로 매핑
  const googleDataMap = {}; // key: `${teacherName}_${date}_${shift}` => entry
  let totalGoogleRecords = 0;

  console.log("\n=== 1. 구글 시트에서 원본 데이터 수집 및 맵 구축 ===");
  for (let i = 0; i < teachers.length; i++) {
    const t = teachers[i];
    const teacherName = t.name.trim();
    const team = t.team.trim();
    const queryTeacherName = teacherName.replace(/\r?\n|\r/g, "/");

    let googleSchedule = {};
    let fetchSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const schedRes = await fetch(`${GOOGLE_SCRIPT_URL}?action=getScheduleAll&team=${encodeURIComponent(team)}&teacher=${encodeURIComponent(queryTeacherName)}`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (schedRes.ok) {
          googleSchedule = await schedRes.json();
          fetchSuccess = true;
          break;
        }
      } catch (err) {
         console.error(`  구글 시트 API 호출 시도 ${attempt} 에러:`, err.message);
      }
      if (attempt < 3) await sleep(1500);
    }

    if (!fetchSuccess) {
      console.error(`❌ [${teacherName}] 구글 시트 데이터를 가져오지 못했습니다.`);
      continue;
    }

    for (const date in googleSchedule) {
      for (const shift in googleSchedule[date]) {
        const entry = googleSchedule[date][shift];
        const hasGoogleData = entry.student || entry.location || entry.status;
        if (!hasGoogleData) continue; // 데이터가 없는 슬롯 건너뜀

        const key = `${teacherName}_${date}_${shift}`;
        googleDataMap[key] = {
          team,
          teacher: teacherName,
          date,
          shift,
          student: (entry.student || "").trim(),
          location: (entry.location || "").trim(),
          status: (entry.status || "").trim()
        };
        totalGoogleRecords++;
      }
    }
    await sleep(100);
  }

  console.log(`구글 시트에서 총 ${totalGoogleRecords}개의 실제 레코드 수집 완료.`);

  // 2. Supabase에서 모든 daily_logs 데이터 로드
  console.log("\n=== 2. Supabase daily_logs 전체 데이터 로드 ===");
  const allSupabaseRecords = [];
  let from = 0;
  const step = 1000;
  let hasMore = true;

  while (hasMore) {
    const to = from + step - 1;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs?select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Range': `${from}-${to}`
      }
    });

    if (!res.ok) {
      console.error("Supabase 데이터 로드 실패:", await res.text());
      return;
    }

    const data = await res.json();
    allSupabaseRecords.push(...data);
    if (data.length < step) {
      hasMore = false;
    } else {
      from += step;
    }
  }

  console.log(`Supabase에서 총 ${allSupabaseRecords.length}개의 레코드 로드 완료.`);

  // Supabase 데이터를 맵으로 변환
  const supabaseDataMap = {}; // key: `${teacherName}_${date}_${shift}` => record
  allSupabaseRecords.forEach(r => {
    const key = `${r.teacher.trim()}_${r.log_date}_${r.shift.trim()}`;
    supabaseDataMap[key] = r;
  });

  let mismatchCount = 0;
  let matchCount = 0;

  console.log("\n=== 3. 양방향 정합성 대조 검증 ===");

  // 검증 A: Google Sheets -> Supabase (구글 시트에 있는 데이터가 Supabase에 잘 들어갔는지)
  console.log("-> 검증 A: 구글 시트 데이터가 Supabase에 존재하는가 & 값이 일치하는가...");
  for (const key in googleDataMap) {
    const g = googleDataMap[key];
    const sb = supabaseDataMap[key];

    if (!sb) {
      console.error(`❌ 누락 발견! 구글시트에는 존재하나 Supabase에 없음: [${g.team}] ${g.teacher} - ${g.date} ${g.shift}`);
      console.error(`  - 구글시트 내용: 학생='${g.student}', 장소='${g.location}', 상태='${g.status}'`);
      mismatchCount++;
      continue;
    }

    // 값 대조
    const gStudent = g.student;
    const gStatus = g.status;
    let gLocation = g.location;
    let gSignatureUrl = null;

    if (g.team.includes("취업팀") && gLocation.startsWith("http")) {
      gSignatureUrl = gLocation;
      gLocation = "";
    }

    const sbStudent = (sb.student || "").trim();
    const sbLocation = (sb.location || "").trim();
    const sbStatus = (sb.status || "").trim();
    const sbSignatureUrl = (sb.signature_url || "").trim();

    const studentMatch = gStudent === sbStudent;
    const locationMatch = gLocation === sbLocation;
    const statusMatch = gStatus === sbStatus;
    const signatureMatch = (gSignatureUrl || "") === sbSignatureUrl;

    if (studentMatch && locationMatch && statusMatch && signatureMatch) {
      matchCount++;
    } else {
      console.error(`❌ 값 불일치 발견! 키: ${key}`);
      if (!studentMatch) console.error(`  - 학생: (구글) "${gStudent}" vs (DB) "${sbStudent}"`);
      if (!locationMatch) console.error(`  - 장소: (구글) "${gLocation}" vs (DB) "${sbLocation}"`);
      if (!statusMatch) console.error(`  - 상태: (구글) "${gStatus}" vs (DB) "${sbStatus}"`);
      if (!signatureMatch) console.error(`  - 서명URL: (구글) "${gSignatureUrl || ''}" vs (DB) "${sbSignatureUrl}"`);
      mismatchCount++;
    }
  }

  // 검증 B: Supabase -> Google Sheets (Supabase에 구글 시트에 없는 잉여 데이터가 있는지)
  console.log("-> 검증 B: Supabase에 존재하는 데이터가 구글 시트에도 존재하는가...");
  for (const key in supabaseDataMap) {
    const g = googleDataMap[key];
    const sb = supabaseDataMap[key];

    // 만약 targetTeams에 포함되지 않는 팀의 데이터가 있다면, 마이그레이션 대상 외 DB가 수정된 것임
    if (!targetTeams.includes(sb.team.trim())) {
      console.error(`❌ 경고! 마이그레이션 대상 외 팀 데이터 발견: [${sb.team}] ${sb.teacher} - ${sb.log_date}`);
      mismatchCount++;
      continue;
    }

    if (!g) {
      // Supabase에는 있으나 구글시트에는 없는 경우 (실데이터 마이그레이션인데 빈 슬롯 등이 삽입되었을 때 감지됨)
      console.error(`❌ 초과/잉여 데이터 발견! 구글시트에는 없으나 Supabase에 존재: [${sb.team}] ${sb.teacher} - ${sb.log_date} ${sb.shift}`);
      console.error(`  - Supabase 내용: 학생='${sb.student || ''}', 장소='${sb.location || ''}', 상태='${sb.status || ''}'`);
      mismatchCount++;
    }
  }

  console.log(`\n============================================`);
  console.log(`[양방향 검증] 최종 검증 결과 리포트:`);
  console.log(`- 구글 시트 원본 실데이터 수: ${totalGoogleRecords}개`);
  console.log(`- Supabase daily_logs 데이터 수: ${allSupabaseRecords.length}개`);
  console.log(`- 정확히 매칭 및 일치하는 레코드 수: ${matchCount}개`);
  console.log(`- 불일치/누락/초과 건수: ${mismatchCount}개`);
  
  if (totalGoogleRecords > 0) {
    const accuracy = ((matchCount / totalGoogleRecords) * 100).toFixed(2);
    console.log(`- 데이터 정확도: ${accuracy}%`);
  } else {
    console.log(`- 데이터 정확도: 0.00%`);
  }
  console.log(`============================================`);

  if (mismatchCount === 0 && totalGoogleRecords === allSupabaseRecords.length && matchCount === totalGoogleRecords) {
    console.log("🎉 100% 양방향 데이터 검증 완료! 정합성이 완벽하게 일치합니다.");
  } else {
    console.error("⚠️ 검증 오류가 발견되었습니다. 결과를 분석하여 마이그레이션을 다시 검토하십시오.");
  }
}

run();
