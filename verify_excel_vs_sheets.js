import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

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

  // [수정] 2번 요건: 불필요하게 시간을 잡아먹던 Supabase 선생님 명단 로드 부분 삭제 완료

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

    // Row 1 is the headers (Row 0 is title)
    const headers = sheetData[1];
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

    // Parse rows in groups of 3 (Row 2 to End)
    // 엑셀 구조: 한 선생님이 여러 시간대를 가질 경우, 첫 시간대만 B열(이름)이 채워지고
    // 이후 시간대는 B열이 비어있고 C열(시간대)만 채워짐 → carry-forward 방식 필요
    const numRows = sheetData.length;
    let rIdx = 2;
    let currentTeacherForCarry = ""; // 교사명 carry-forward용
    let googleSchedule = {}; // 캐시용
    let isTeacherFailed = false; // [수정] 1번 요건: API 호출 실패 여부 저장용 캐시

    while (rIdx < numRows) {
      // 마지막 3행 세트가 완전하지 않으면 중단
      if (rIdx + 2 >= numRows) break;

      const rowA = sheetData[rIdx];     // 대상 (Student)
      const rowB = sheetData[rIdx + 1]; // 장소 (Location)
      const rowC = sheetData[rIdx + 2]; // 진행 (Status)

      // B열(이름): 값이 있으면 carry-forward 갱신
      const rowTeacherRaw = String(rowA[1] || "").trim();
      if (rowTeacherRaw) {
        currentTeacherForCarry = rowTeacherRaw;
        // 새로운 선생님이면 캐시 초기화
        googleSchedule = {};
        isTeacherFailed = false; // [수정] 1번 요건: 선생님이 바뀌면 실패 상태도 초기화
      }

      const teacherName = currentTeacherForCarry;
      const shiftName = String(rowA[2] || "").trim();

      // 유효한 시간대가 없으면 다음 행으로
      if (!shiftName || !teacherName) {
        rIdx += 1;
        continue;
      }

      // [수정] 1번 요건: 이미 실패한 선생님인 경우 다음 시간대는 더 시도하지 않고 빠르게 건너뜀
      if (isTeacherFailed) {
        rIdx += 3;
        continue;
      }

      console.log(`  - 검증 중: ${teacherName} 선생님 (${shiftName})`);

      // 구글 시트에서 원본 일정 가져오기 (API 호출을 최소화하기 위해 캐시 확인)
      if (Object.keys(googleSchedule).length === 0) {
        const queryTeacherName = teacherName.replace(/\r?\n|\r/g, "/");
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
          isTeacherFailed = true; // [수정] 1번 요건: 실패 상태 저장
          rIdx += 3;
          continue;
        }

        // [수정] 3번 요건: 구글 API를 실제로 성공적으로 호출했을 때만, 과부하를 막기 위해 잠시 대기합니다.
        await sleep(100);
      }

      // Check dates
      dateColumns.forEach(dateCol => {
        const dateStr = dateCol.dateStr;
        const colIdx = dateCol.colIndex;

        // [추가] 띄어쓰기, 줄바꿈(엔터), 탭 등 모든 공백을 싹 지워주는 함수
        const removeSpaces = (str) => str.replace(/\s+/g, '');

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
        // 원본 글자에서 공백을 뺀(removeSpaces) 상태끼리만 비교합니다
        if (removeSpaces(excelStudent) !== removeSpaces(gStudent)) {
          console.error(`  ❌ [불일치] ${dateStr} [${shiftName}] 학생 정보 불일치!`);
          console.error(`    - 구글시트: "${gStudent}" vs 엑셀파일: "${excelStudent}"`);
          totalMismatches++;
        } else {
          totalMatches++;
        }

        // Compare Location
        totalChecked++;
        if (removeSpaces(excelLocation) !== removeSpaces(gLocation)) {
          console.error(`  ❌ [불일치] ${dateStr} [${shiftName}] 장소 정보 불일치!`);
          console.error(`    - 구글시트: "${gLocation}" vs 엑셀파일: "${excelLocation}"`);
          totalMismatches++;
        } else {
          totalMatches++;
        }

        // Compare Status
        totalChecked++;
        const cleanGStatus = gStatus === "1" ? "1" : gStatus;
        if (removeSpaces(excelStatus) !== removeSpaces(cleanGStatus)) {
          console.error(`  ❌ [불일치] ${dateStr} [${shiftName}] 진행/상태 정보 불일치!`);
          console.error(`    - 구글시트: "${cleanGStatus}" vs 엑셀파일: "${excelStatus}"`);
          totalMismatches++;
        } else {
          totalMatches++;
        }
      });

      rIdx += 3; // Move to next teacher block
      // [수정] 3번 요건: 모든 시간대마다 무조건 쉬게 만들었던 await sleep(100); 부분을 삭제 완료
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