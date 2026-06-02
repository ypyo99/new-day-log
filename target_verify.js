const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwtz2B3wl9Bk3AgoPEO9Jz3PkPRAJEq11N28YW8fZC4x3oVo0ls1p9rkUxMEnL7_ak5Hg/exec";

// 헬퍼: sleep 함수
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  console.log("=== [전수 검증] 마이그레이션 교차 검증 (Cross-Validation) 시작 ===");
  
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

  let totalChecked = 0;
  let totalMatches = 0;
  let totalMismatches = 0;
  let totalGoogleRecordsCount = 0;
  let totalSupabaseRecordsCount = 0;

  let isFirstTeacher = true;
  for (let i = 0; i < teachers.length; i++) {
    if (!isFirstTeacher) console.log("");
    isFirstTeacher = false;
    
    const t = teachers[i];
    const teacherName = t.name.trim();
    const team = t.team.trim();
    
    console.log(`[${i+1}/${teachers.length}] ${team} - ${teacherName} 선생님 검증 시작...`);

    const queryTeacherName = teacherName.replace(/\r?\n|\r/g, "/");
    let googleSchedule = {};
    let fetchSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30초 타임아웃
        const schedRes = await fetch(`${GOOGLE_SCRIPT_URL}?action=getScheduleAll&team=${encodeURIComponent(team)}&teacher=${encodeURIComponent(queryTeacherName)}`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (schedRes.ok) {
          googleSchedule = await schedRes.json();
          fetchSuccess = true;
          break;
        } else {
          console.warn(`  구글 시트 일정 가져오기 시도 ${attempt} 실패 (Status: ${schedRes.status})`);
        }
      } catch (err) {
         console.error(`  구글 시트 API 호출 시도 ${attempt} 에러:`, err.message);
      }
      if (attempt < 3) {
        await sleep(1500);
      }
    }

    if (!fetchSuccess) {
      console.error(`❌ [${teacherName}] 구글 시트 데이터를 가져오지 못했습니다. 이 선생님은 검증에서 건너뜁니다.`);
      totalMismatches++;
      continue;
    }

    // Google Sheets 데이터에서 실제 데이터가 있는 것만 googleMap에 매핑
    const googleMap = {};
    for (const date in googleSchedule) {
      for (const shift in googleSchedule[date]) {
        const gEntry = googleSchedule[date][shift];
        const hasGoogleData = gEntry.student || gEntry.location || gEntry.status;
        if (hasGoogleData) {
          let gLocation = (gEntry.location || "").trim();
          let gSignatureUrl = null;
          if (team.includes("취업팀") && gLocation.startsWith("http")) {
            gSignatureUrl = gLocation;
            gLocation = "";
          }
          googleMap[`${date}_${shift}`] = {
            student: (gEntry.student || "").trim(),
            location: gLocation,
            status: (gEntry.status || "").trim(),
            signature_url: gSignatureUrl ? gSignatureUrl.trim() : null
          };
        }
      }
    }

    // Supabase 일정 가져오기
    let supabaseRecords = [];
    try {
      const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs?teacher=eq.${encodeURIComponent(teacherName)}&team=eq.${encodeURIComponent(team)}&select=*`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      if (sbRes.ok) {
        supabaseRecords = await sbRes.json();
      } else {
        console.error(`  Supabase 일정 로드 실패:`, await sbRes.text());
        continue;
      }
    } catch (err) {
       console.error(`  Supabase 일정 로드 에러:`, err);
       continue;
     }

    // Supabase 데이터를 { date_shift: record } 형태로 매핑 (실제 값이 있는 것만)
    const supabaseMap = {};
    supabaseRecords.forEach(r => {
      if (r.student || r.location || r.status || r.signature_url) {
        supabaseMap[`${r.log_date}_${r.shift}`] = {
          student: (r.student || "").trim(),
          location: (r.location || "").trim(),
          status: (r.status || "").trim(),
          signature_url: r.signature_url ? r.signature_url.trim() : null
        };
      }
    });

    const googleKeys = Object.keys(googleMap);
    const supabaseKeys = Object.keys(supabaseMap);
    
    totalGoogleRecordsCount += googleKeys.length;
    totalSupabaseRecordsCount += supabaseKeys.length;

    console.log(`  -> 구글시트 실제 기록 수: ${googleKeys.length}개 / Supabase DB 실제 기록 수: ${supabaseKeys.length}개`);

    // 1. 정방향 검증: 구글 시트 -> Supabase DB
    googleKeys.forEach(key => {
      totalChecked++;
      const gRecord = googleMap[key];
      const sbRecord = supabaseMap[key];

      if (!sbRecord) {
        console.error(`❌ [누락] DB에 없음! 키: ${key}`);
        console.error(`  - 구글시트 내용: 학생="${gRecord.student}", 장소="${gRecord.location}", 상태="${gRecord.status}", 서명="${gRecord.signature_url || ''}"`);
        totalMismatches++;
      } else {
        const studentMatches = gRecord.student === sbRecord.student;
        const locationMatches = gRecord.location === sbRecord.location;
        const statusMatches = gRecord.status === sbRecord.status;
        const signatureMatches = (gRecord.signature_url || "") === (sbRecord.signature_url || "");

        if (studentMatches && locationMatches && statusMatches && signatureMatches) {
          totalMatches++;
        } else {
          console.error(`❌ [불일치] 값 다름! 키: ${key}`);
          if (!studentMatches) console.error(`  - 학생 불일치: (구글) "${gRecord.student}" vs (DB) "${sbRecord.student}"`);
          if (!locationMatches) console.error(`  - 장소 불일치: (구글) "${gRecord.location}" vs (DB) "${sbRecord.location}"`);
          if (!statusMatches) console.error(`  - 상태 불일치: (구글) "${gRecord.status}" vs (DB) "${sbRecord.status}"`);
          if (!signatureMatches) console.error(`  - 서명URL 불일치: (구글) "${gRecord.signature_url || ''}" vs (DB) "${sbRecord.signature_url || ''}"`);
          totalMismatches++;
        }
      }
    });

    // 2. 역방향 검증: Supabase DB -> 구글 시트 (초과 데이터가 있는지 확인)
    supabaseKeys.forEach(key => {
      const gRecord = googleMap[key];
      const sbRecord = supabaseMap[key];

      if (!gRecord) {
        console.error(`❌ [초과 데이터] 구글시트에는 없으나 DB에 존재! 키: ${key}`);
        console.error(`  - DB 내용: 학생="${sbRecord.student}", 장소="${sbRecord.location}", 상태="${sbRecord.status}", 서명="${sbRecord.signature_url || ''}"`);
        totalMismatches++;
      }
    });

    // 구글 API Rate Limit 고려
    await sleep(200);
  }

  console.log(`\n============================================`);
  console.log(`[전수 검증] 최종 검증 결과 리포트:`);
  console.log(`- 구글시트 총 실제 레코드 수: ${totalGoogleRecordsCount}개`);
  console.log(`- Supabase DB 총 실제 레코드 수: ${totalSupabaseRecordsCount}개`);
  console.log(`- 정방향 검사한 슬롯 수: ${totalChecked}개`);
  console.log(`- 정확히 일치하는 슬롯 수: ${totalMatches}개`);
  console.log(`- 불일치/누락/초과 건수: ${totalMismatches}개`);
  
  const isCountMatch = totalGoogleRecordsCount === totalSupabaseRecordsCount;
  console.log(`- 총 레코드 개수 일치 여부: ${isCountMatch ? "일치 (OK)" : "❌ 불일치"}`);
  
  if (totalChecked > 0) {
    const accuracy = ((totalMatches / totalChecked) * 100).toFixed(2);
    console.log(`- 데이터 정확도: ${accuracy}%`);
  } else {
    console.log(`- 데이터 정확도: 0.00% (검사할 슬롯이 없었습니다.)`);
  }
  
  if (totalMismatches === 0 && isCountMatch) {
    console.log(`🎉 100% 교차 검증 통과! 데이터가 완벽하게 일치합니다.`);
  } else {
    console.log(`⚠️ 검증 실패! 불일치 또는 누락 건을 확인하세요.`);
  }
  console.log(`============================================`);
}

run();
