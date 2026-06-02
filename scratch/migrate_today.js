import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwtz2B3wl9Bk3AgoPEO9Jz3PkPRAJEq11N28YW8fZC4x3oVo0ls1p9rkUxMEnL7_ak5Hg/exec";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const TODAY_STR = '2026-06-02'; // 오늘 날짜

async function run() {
  console.log(`=== 1. 오늘 날짜(${TODAY_STR}) 데이터 백업 ===`);
  const backupRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs?log_date=eq.${TODAY_STR}&select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });

  if (!backupRes.ok) {
    console.error("백업 로드 실패:", await backupRes.text());
    return;
  }
  const backupData = await backupRes.json();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilename = `daily_logs_today_backup_${timestamp}.json`;
  const backupPath = path.join(process.cwd(), 'scratch', backupFilename);
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`백업 완료: 총 ${backupData.length}개 백업됨 -> ${backupPath}`);

  console.log(`\n=== 2. Supabase daily_logs에서 오늘 날짜(${TODAY_STR}) 데이터 삭제 ===`);
  const deleteRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs?log_date=eq.${TODAY_STR}`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });

  if (!deleteRes.ok) {
     console.error("오늘 날짜 데이터 삭제 실패:", await deleteRes.text());
     return;
  }
  console.log(`오늘 날짜(${TODAY_STR}) 수업 기록 삭제 완료!`);

  console.log("\n=== 3. Supabase teachers 테이블에서 선생님 명단 로드 ===");
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

  console.log(`\n=== 4. 구글 시트에서 오늘 날짜(${TODAY_STR}) 데이터만 수집 ===`);
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
       if (date !== TODAY_STR) continue; // 오늘 날짜가 아니면 패스

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
     console.log(`  -> 수집된 오늘 날짜 실제 기록 수: ${teacherRecordCount}개`);

     // 구글 API 요청 간 딜레이 제공 (Rate Limit 방지)
     await sleep(100);
  }

  console.log(`\n오늘 날짜 데이터 수집 완료: 총 ${migratedRecords.length}개의 실제 기록 수집됨`);

  if (migratedRecords.length === 0) {
    console.log("오늘 날짜에 기입된 구글 시트 실제 기록이 없습니다. 삽입을 완료하고 검증으로 넘어갑니다.");
  } else {
    console.log(`\n=== 5. Supabase에 오늘 날짜 데이터 삽입 (총 ${migratedRecords.length}개) ===`);
    const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(migratedRecords)
    });

    if (!sbRes.ok) {
       console.error(`  오늘 날짜 데이터 삽입 실패:`, await sbRes.text());
       return;
    } else {
       console.log(`  오늘 날짜 데이터 삽입 성공!`);
    }
  }

  console.log(`\n=== 6. 오늘 날짜(${TODAY_STR}) 교차 검증 시작 ===`);
  
  // Supabase 오늘 날짜 데이터 로드
  const sbVerifyRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs?log_date=eq.${TODAY_STR}&select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });

  if (!sbVerifyRes.ok) {
    console.error("검증을 위한 DB 데이터 로드 실패:", await sbVerifyRes.text());
    return;
  }
  const sbVerifyRecords = await sbVerifyRes.json();
  const supabaseMap = {};
  sbVerifyRecords.forEach(r => {
    if (r.student || r.location || r.status || r.signature_url) {
      supabaseMap[`${r.teacher}_${r.shift}`] = {
        student: (r.student || "").trim(),
        location: (r.location || "").trim(),
        status: (r.status || "").trim(),
        signature_url: r.signature_url ? r.signature_url.trim() : null
      };
    }
  });

  // 수집된 구글 시트 데이터를 Map으로
  const googleMap = {};
  migratedRecords.forEach(r => {
    googleMap[`${r.teacher}_${r.shift}`] = {
      student: r.student.trim(),
      location: r.location.trim(),
      status: r.status.trim(),
      signature_url: r.signature_url ? r.signature_url.trim() : null
    };
  });

  const googleKeys = Object.keys(googleMap);
  const supabaseKeys = Object.keys(supabaseMap);
  
  let matches = 0;
  let mismatches = 0;

  console.log(`- 오늘 날짜 구글시트 실제 기록 수: ${googleKeys.length}개`);
  console.log(`- 오늘 날짜 Supabase DB 실제 기록 수: ${supabaseKeys.length}개`);

  // 정방향 검증
  googleKeys.forEach(key => {
    const g = googleMap[key];
    const sb = supabaseMap[key];
    if (!sb) {
      console.error(`❌ [누락] DB에 없음! 키: ${key}`);
      mismatches++;
    } else {
      const studentMatches = g.student === sb.student;
      const locationMatches = g.location === sb.location;
      const statusMatches = g.status === sb.status;
      const signatureMatches = (g.signature_url || "") === (sb.signature_url || "");

      if (studentMatches && locationMatches && statusMatches && signatureMatches) {
        matches++;
      } else {
        console.error(`❌ [불일치] 값 다름! 키: ${key}`);
        if (!studentMatches) console.error(`  - 학생 불일치: (구글) "${g.student}" vs (DB) "${sb.student}"`);
        if (!locationMatches) console.error(`  - 장소 불일치: (구글) "${g.location}" vs (DB) "${sb.location}"`);
        if (!statusMatches) console.error(`  - 상태 불일치: (구글) "${g.status}" vs (DB) "${sb.status}"`);
        if (!signatureMatches) console.error(`  - 서명URL 불일치: (구글) "${g.signature_url || ''}" vs (DB) "${sb.signature_url || ''}"`);
        mismatches++;
      }
    }
  });

  // 역방향 검증
  supabaseKeys.forEach(key => {
    if (!googleMap[key]) {
      console.error(`❌ [초과 데이터] 구글시트에는 없으나 DB에 존재! 키: ${key}`);
      mismatches++;
    }
  });

  const countMatches = googleKeys.length === supabaseKeys.length;
  if (mismatches === 0 && countMatches) {
     console.log(`\n🎉 오늘 날짜(${TODAY_STR}) 데이터 100% 마이그레이션 검증 완료! 일치율 100%`);
  } else {
     console.error(`\n⚠️ 오늘 날짜 검증 실패! 불일치 건들을 수동 점검하세요.`);
  }
}

run();
