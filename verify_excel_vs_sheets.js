const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwtz2B3wl9Bk3AgoPEO9Jz3PkPRAJEq11N28YW8fZC4x3oVo0ls1p9rkUxMEnL7_ak5Hg/exec";

// Helper to delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const args = process.argv.slice(2);
  let excelFilePath = args[0];

  if (!excelFilePath) {
    // Find files matching 통합_시간표*.xlsx
    const files = fs.readdirSync('.').filter(f => f.startsWith('통합_시간표') && f.endsWith('.xlsx'));
    if (files.length === 0) {
      console.error("❌ 엑셀 파일을 찾을 수 없습니다. 파일명을 인자로 입력해주세요.");
      console.error("예: node verify_excel_vs_sheets.js 통합_시간표-2026-05-20.xlsx");
      return;
    }
    // Pick the latest one
    files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    excelFilePath = files[0];
    console.log(`🔍 지정된 파일이 없어 가장 최근에 생성된 엑셀 파일을 선택했습니다: ${excelFilePath}`);
  }

  if (!fs.existsSync(excelFilePath)) {
    console.error(`❌ 파일을 찾을 수 없습니다: ${excelFilePath}`);
    return;
  }

  console.log(`📖 엑셀 파일 로드 중: ${excelFilePath}`);
  const workbook = XLSX.readFile(excelFilePath);

  // Extract year/month from filename
  let year = new Date().getFullYear();
  let fileMonth = new Date().getMonth() + 1;
  const dateMatch = excelFilePath.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    year = parseInt(dateMatch[1]);
    fileMonth = parseInt(dateMatch[2]);
  }
  console.log(`📅 대상 기준년월: ${year}년 ${fileMonth}월`);

  // Load teachers list from Supabase
  console.log("👥 Supabase에서 선생님 명단 로드 중...");
  const teachersRes = await fetch(`${SUPABASE_URL}/rest/v1/teachers?select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });

  if (!teachersRes.ok) {
     console.error("❌ 선생님 명단 로드 실패:", await teachersRes.text());
     return;
  }
  const teachers = await teachersRes.json();
  console.log(`교사 수: 총 ${teachers.length}명`);

  const teams = ["1팀", "2팀", "3팀", "취업팀"];
  let totalChecked = 0;
  let totalMatches = 0;
  let totalMismatches = 0;

  for (const team of teams) {
    console.log(`\n============================================`);
    console.log(`🏢 [${team}] 시트 검증 시작`);
    console.log(`============================================`);

    const sheet = workbook.Sheets[team];
    if (!sheet) {
      console.warn(`⚠️ 엑셀 파일 내에 '${team}' 시트가 존재하지 않습니다. 건너뜁니다.`);
      continue;
    }

    // Convert sheet to JSON array of arrays
    const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (sheetData.length < 2) {
      console.warn(`⚠️ '${team}' 시트에 데이터가 너무 부족합니다. 건너뜁니다.`);
      continue;
    }

    // Row 0 is the headers
    const headers = sheetData[0];
    const dateColumns = []; // [{ colIndex, dateStr }]

    for (let c = 3; c < headers.length; c++) {
      const headerVal = String(headers[c] || "").trim();
      const dm = headerVal.match(/(\d+)\/(\d+)/);
      if (dm) {
        const headerMonth = String(dm[1]).padStart(2, '0');
        const headerDay = String(dm[2]).padStart(2, '0');
        const dateStr = `${year}-${headerMonth}-${headerDay}`;
        dateColumns.push({ colIndex: c, dateStr, label: headerVal });
      }
    }

    console.log(`📅 검사할 날짜 열 개수: ${dateColumns.length}개 (${dateColumns[0]?.dateStr} ~ ${dateColumns[dateColumns.length - 1]?.dateStr})`);

    // Parse rows in groups of 3 (Row 1 to End)
    const numRows = sheetData.length;
    let rIdx = 1;

    while (rIdx < numRows) {
      if (rIdx + 2 >= numRows) break;

      const rowA = sheetData[rIdx];     // 대상 (Student)
      const rowB = sheetData[rIdx + 1]; // 장소 (Location)
      const rowC = sheetData[rIdx + 2]; // 진행 (Status)

      const teacherName = String(rowA[1] || "").trim();
      const shiftName = String(rowA[2] || "").trim();

      if (!teacherName || !shiftName) {
        // Not a valid teacher block, skip this row and increment by 1
        rIdx += 1;
        continue;
      }

      console.log(`  - 검증 중: ${teacherName} 선생님 (${shiftName})`);

      // Google Sheets에서 원본 일정 가져오기 (재시도 및 타임아웃, 줄바꿈 보정 적용)
      const queryTeacherName = teacherName.replace(/\r?\n|\r/g, "/");
      let googleSchedule = {};
      let fetchSuccess = false;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // 30초 타임아웃

          const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=getScheduleAll&team=${encodeURIComponent(team)}&teacher=${encodeURIComponent(queryTeacherName)}`, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            googleSchedule = await res.json();
            fetchSuccess = true;
            break;
          } else {
            console.warn(`    [시도 ${attempt}] 구글시트 API 응답 에러 (Status: ${res.status})`);
          }
        } catch (err) {
          console.error(`    [시도 ${attempt}] 구글시트 로드 에러:`, err.message);
        }
        if (attempt < 5) await sleep(1000);
      }

      if (!fetchSuccess) {
        console.error(`  ❌ [오류] ${teacherName} 선생님의 구글 시트 원본 데이터를 가져오지 못했습니다. 이 선생님은 건너뜁니다.`);
        rIdx += 3;
        continue;
      }

      // Check dates
      dateColumns.forEach(dateCol => {
        const dateStr = dateCol.dateStr;
        const colIdx = dateCol.colIndex;

        // Excel values
        const excelStudent = String(rowA[colIdx] || "").trim();
        const excelLocation = String(rowB[colIdx] || "").trim();
        const excelStatus = String(rowC[colIdx] || "").trim();

        // Google Sheets values
        const gDayData = (googleSchedule[dateStr] && googleSchedule[dateStr][shiftName]) || {};
        const gStudent = String(gDayData.student || "").trim();
        const gStatus = String(gDayData.status || "").trim();
        
        let gLocation = String(gDayData.location || "").trim();
        // Handle employment team signature URL mapping
        if (team === "취업팀" && gLocation.startsWith("http")) {
          gLocation = "";
        }

        // Compare Student
        totalChecked++;
        if (excelStudent !== gStudent) {
          console.error(`  ❌ [불일치] ${dateStr} [${shiftName}] 학생 정보 불일치!`);
          console.error(`    - 구글시트: "${gStudent}" vs 엑셀파일: "${excelStudent}"`);
          totalMismatches++;
        } else {
          totalMatches++;
        }

        // Compare Location
        totalChecked++;
        if (excelLocation !== gLocation) {
          console.error(`  ❌ [불일치] ${dateStr} [${shiftName}] 장소 정보 불일치!`);
          console.error(`    - 구글시트: "${gLocation}" vs 엑셀파일: "${excelLocation}"`);
          totalMismatches++;
        } else {
          totalMatches++;
        }

        // Compare Status
        totalChecked++;
        const cleanGStatus = gStatus === "1" ? "1" : gStatus;
        if (excelStatus !== cleanGStatus) {
          console.error(`  ❌ [불일치] ${dateStr} [${shiftName}] 진행/상태 정보 불일치!`);
          console.error(`    - 구글시트: "${cleanGStatus}" vs 엑셀파일: "${excelStatus}"`);
          totalMismatches++;
        } else {
          totalMatches++;
        }
      });

      rIdx += 3; // Move to next teacher block
      await sleep(100); // Prevent hitting API limits too fast
    }
  }

  console.log(`\n============================================`);
  console.log(`🏁 엑셀 파일 vs 구글 시트 검증 완료!`);
  console.log(`============================================`);
  console.log(`- 총 검사한 셀 항목 수: ${totalChecked}개`);
  console.log(`- 원본과 완전히 일치하는 항목 수: ${totalMatches}개`);
  console.log(`- 불일치 항목 수: ${totalMismatches}개`);
  if (totalChecked > 0) {
    const accuracy = ((totalMatches / totalChecked) * 100).toFixed(2);
    console.log(`- 최종 엑셀 정합성 정확도: ${accuracy}%`);
  }
  console.log(`============================================`);
}

main().catch(console.error);
