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
  const teachers = await teachersRes.json();
  console.log(`선생님 명단 로드 완료: 총 ${teachers.length}명`);

  let totalChecked = 0;
  let totalMatches = 0;
  let totalMismatches = 0;

  for (let i = 0; i < teachers.length; i++) {
    const t = teachers[i];
    const teacherName = t.name.trim();
    const team = t.team.trim();
    
    console.log(`\n[${i+1}/${teachers.length}] 검증 중: [${team}] ${teacherName} 선생님`);
    
    // Google Sheets 일정 가져오기
    let googleSchedule = {};
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

    // Supabase 일정 가져오기 (실제 값이 있는 것만)
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

    // Supabase 데이터를 { date_shift: record } 형태로 매핑
    const supabaseMap = {};
    supabaseRecords.forEach(r => {
      if (r.student || r.location || r.status) {
        supabaseMap[`${r.log_date}_${r.shift}`] = r;
      }
    });

    // Google Sheets 데이터와 비교
    for (const date in googleSchedule) {
      for (const shift in googleSchedule[date]) {
        const gEntry = googleSchedule[date][shift];
        const hasGoogleData = gEntry.student || gEntry.location || gEntry.status;
        if (!hasGoogleData) continue; // 데이터가 없는 슬롯은 건너뜀

        totalChecked++;
        const sbEntry = supabaseMap[`${date}_${shift}`];

        if (!sbEntry) {
          console.error(`❌ 누락 발견! [${date} ${shift}] 구글시트에는 데이터가 있으나 Supabase에 없습니다.`);
          console.error(`  - 구글시트 내용: 학생=${gEntry.student || ''}, 장소=${gEntry.location || ''}, 상태=${gEntry.status || ''}`);
          totalMismatches++;
        } else {
          // 값 비교
          const gStudent = (gEntry.student || "").trim();
          const gStatus = (gEntry.status || "").trim();
          
          let gLocation = (gEntry.location || "").trim();
          let gSignatureUrl = null;
          if (team.includes("취업팀") && gLocation.startsWith("http")) {
            gSignatureUrl = gLocation;
            gLocation = "";
          }

          const sbStudent = (sbEntry.student || "").trim();
          const sbLocation = (sbEntry.location || "").trim();
          const sbStatus = (sbEntry.status || "").trim();
          const sbSignature = (sbEntry.signature_url || "").trim();

          const studentMatches = gStudent === sbStudent;
          const locationMatches = gLocation === sbLocation;
          const statusMatches = gStatus === sbStatus;
          const signatureMatches = (gSignatureUrl || "") === sbSignature;

          if (studentMatches && locationMatches && statusMatches && signatureMatches) {
            totalMatches++;
          } else {
            console.error(`❌ 불일치 발견! [${date} ${shift}]`);
            if (!studentMatches) console.error(`  - 학생 불일치: (구글) "${gStudent}" vs (DB) "${sbStudent}"`);
            if (!locationMatches) console.error(`  - 장소 불일치: (구글) "${gLocation}" vs (DB) "${sbLocation}"`);
            if (!statusMatches) console.error(`  - 상태 불일치: (구글) "${gStatus}" vs (DB) "${sbStatus}"`);
            if (!signatureMatches) console.error(`  - 서명URL 불일치: (구글) "${gSignatureUrl || ''}" vs (DB) "${sbSignature}"`);
            totalMismatches++;
          }
        }
      }
    }
    // 구글 API Rate Limit 고려
    await sleep(200);
  }

  console.log(`\n============================================`);
  console.log(`[전수 검증] 최종 검증 결과 리포트:`);
  console.log(`- 검사한 총 슬롯 수: ${totalChecked}개`);
  console.log(`- 정확히 일치하는 수: ${totalMatches}개`);
  console.log(`- 불일치/누락 건수: ${totalMismatches}개`);
  if (totalChecked > 0) {
    const accuracy = ((totalMatches / totalChecked) * 100).toFixed(2);
    console.log(`- 데이터 정확도: ${accuracy}%`);
  } else {
    console.log(`- 데이터 정확도: 0.00% (검사할 슬롯이 없었습니다.)`);
  }
  console.log(`============================================`);
}

run();
