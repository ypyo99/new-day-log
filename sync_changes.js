const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwtz2B3wl9Bk3AgoPEO9Jz3PkPRAJEq11N28YW8fZC4x3oVo0ls1p9rkUxMEnL7_ak5Hg/exec";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  console.log("=== 변경된 데이터만 동기화 (Sync) 시작 ===");

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

  let totalUpdated = 0;
  let totalInserted = 0;

  for (let i = 0; i < teachers.length; i++) {
    const t = teachers[i];
    const teacherName = t.name.trim();
    const team = t.team.trim();
    
    console.log(`[${i+1}/${teachers.length}] ${team} - ${teacherName} 선생님 데이터 대조 및 동기화 중...`);

    // Google Sheets 일정 가져오기
    const queryTeacherName = teacherName.replace(/\r?\n|\r/g, "/");
    let googleSchedule = {};
    let fetchSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const schedRes = await fetch(`${GOOGLE_SCRIPT_URL}?action=getScheduleAll&team=${encodeURIComponent(team)}&teacher=${encodeURIComponent(queryTeacherName)}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (schedRes.ok) {
          googleSchedule = await schedRes.json();
          fetchSuccess = true;
          break;
        }
      } catch (err) {}
      if (attempt < 3) await sleep(1500);
    }

    if (!fetchSuccess) {
       console.error(`  -> 구글 시트 일정 로드 실패 (건너뜀)`);
       continue;
    }

    // Supabase에서 현재 이 선생님의 모든 레코드 로드
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
      }
    } catch (err) {
       console.error(`  -> Supabase 일정 로드 실패:`, err);
       continue;
    }

    // Map for quick lookup: "date_shift" -> record
    const sbMap = {};
    for (const r of supabaseRecords) {
      sbMap[`${r.log_date}_${r.shift.trim()}`] = r;
    }

    // 변경된 내역을 찾아서 패치
    for (const date in googleSchedule) {
      for (const shift in googleSchedule[date]) {
        const gEntry = googleSchedule[date][shift];
        const hasGoogleData = gEntry.student || gEntry.location || gEntry.status;
        if (!hasGoogleData) continue;

        const gStudent = (gEntry.student || "").trim();
        const gStatus = (gEntry.status || "").trim();
        let gLocation = (gEntry.location || "").trim();
        let gSignatureUrl = null;
        if (team.includes("취업팀") && gLocation.startsWith("http")) {
          gSignatureUrl = gLocation;
          gLocation = "";
        }

        const cleanGStatus = gStatus === "1" ? "1" : gStatus;
        const sbRecord = sbMap[`${date}_${shift}`];

        if (sbRecord) {
          const sbStudent = (sbRecord.student || "").trim();
          const sbLocation = (sbRecord.location || "").trim();
          const sbStatus = (sbRecord.status || "").trim();
          const sbSignature = (sbRecord.signature_url || "").trim();

          if (gStudent !== sbStudent || gLocation !== sbLocation || cleanGStatus !== sbStatus || (gSignatureUrl || "") !== sbSignature) {
            console.log(`  -> 🔄 [업데이트] ${date} ${shift}: (구글) ${gStudent}/${gLocation}/${cleanGStatus} vs (DB) ${sbStudent}/${sbLocation}/${sbStatus}`);
            
            const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs?id=eq.${sbRecord.id}`, {
              method: 'PATCH',
              headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({
                student: gStudent,
                location: gLocation,
                status: cleanGStatus,
                signature_url: gSignatureUrl
              })
            });
            if (updateRes.ok) {
              totalUpdated++;
            } else {
              console.error(`  -> ❌ 업데이트 실패:`, await updateRes.text());
            }
          }
        } else {
          console.log(`  -> ➕ [새로추가] ${date} ${shift}: ${gStudent} / ${gLocation}`);
          const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs`, {
              method: 'POST',
              headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify([{
                team,
                teacher: teacherName,
                log_date: date,
                shift,
                student: gStudent,
                location: gLocation,
                status: cleanGStatus,
                signature_url: gSignatureUrl
              }])
          });
          if (insertRes.ok) {
             totalInserted++;
          } else {
             console.error(`  -> ❌ 삽입 실패:`, await insertRes.text());
          }
        }
      }
    }
    await sleep(100);
  }

  console.log(`\n============================================`);
  console.log(`✅ 동기화 완료!`);
  console.log(`- 업데이트된 기존 레코드: ${totalUpdated}건`);
  console.log(`- 새롭게 추가된 레코드: ${totalInserted}건`);
  console.log(`============================================`);
}

run().catch(console.error);
