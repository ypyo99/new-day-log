import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwtz2B3wl9Bk3AgoPEO9Jz3PkPRAJEq11N28YW8fZC4x3oVo0ls1p9rkUxMEnL7_ak5Hg/exec";

// Helper to delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// [추가] 띄어쓰기, 줄바꿈(엔터), 탭 등 모든 공백을 싹 지워주는 함수
const removeSpaces = (str) => String(str).replace(/\s+/g, '');

async function main() {
  const args = process.argv.slice(2);
  let excelFilePath = args[0];

  if (!excelFilePath) {
    const files = fs.readdirSync('.').filter(f => f.startsWith('통합_시간표') && f.endsWith('.xlsx'));
    if (files.length === 0) {
      console.error("❌ 엑셀 파일을 찾을 수 없습니다. 파일명을 인자로 입력해주세요.");
      return;
    }
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

  let year = new Date().getFullYear();
  let fileMonth = new Date().getMonth() + 1;
  const dateMatch = excelFilePath.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    year = parseInt(dateMatch[1]);
    fileMonth = parseInt(dateMatch[2]);
  }
  console.log(`📅 대상 기준년월: ${year}년 ${fileMonth}월`);

  const teams = ["1팀", "2팀", "3팀", "취업팀"];
  let totalChecked = 0;
  let totalMatches = 0;
  let totalMismatches = 0;

  for (const team of teams) {
    console.log(`\n============================================`);
    console.log(`🏢 [${team}] 구글시트 기준 엑셀 검증 시작`);
    console.log(`============================================`);

    const sheet = workbook.Sheets[team];
    if (!sheet) {
      console.warn(`⚠️ 엑셀 파일 내에 '${team}' 시트가 존재하지 않습니다. 건너뜁니다.`);
      continue;
    }

    const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (sheetData.length < 2) continue;

    const headers = sheetData[1];
    const dateColumns = []; 

    for (let c = 3; c < headers.length; c++) {
      const headerVal = String(headers[c] || "").trim();
      const dm = headerVal.match(/(\d+)\/(\d+)/);
      if (dm) {
        const headerMonth = String(dm[1]).padStart(2, '0');
        const headerDay = String(dm[2]).padStart(2, '0');
        const dateStr = `${year}-${headerMonth}-${headerDay}`;
        dateColumns.push({ colIndex: c, dateStr });
      }
    }

    // 1. 엑셀 데이터를 메모리에 매핑: excelMap[teacher][date][shift] = { student, location, status }
    const excelMap = {};
    const teachersInExcel = new Set();
    
    let currentTeacherForCarry = "";
    for (let rIdx = 2; rIdx < sheetData.length - 2; rIdx += 3) {
      const rowA = sheetData[rIdx];     // 대상
      const rowB = sheetData[rIdx + 1]; // 싸인(장소)
      const rowC = sheetData[rIdx + 2]; // 진행여부

      const rowTeacherRaw = String(rowA[1] || "").trim();
      if (rowTeacherRaw) {
        currentTeacherForCarry = rowTeacherRaw;
      }
      
      const teacherName = currentTeacherForCarry;
      const shiftName = String(rowA[2] || "").trim();

      if (!teacherName) continue;
      
      teachersInExcel.add(teacherName);
      if (!excelMap[teacherName]) excelMap[teacherName] = {};

      if (shiftName) {
        dateColumns.forEach(dateCol => {
          const colIdx = dateCol.colIndex;
          const dateStr = dateCol.dateStr;
          
          if (!excelMap[teacherName][dateStr]) {
            excelMap[teacherName][dateStr] = {};
          }
          
          excelMap[teacherName][dateStr][shiftName] = {
            student: String(rowA[colIdx] || "").trim(),
            location: String(rowB[colIdx] || "").trim(),
            status: String(rowC[colIdx] || "").trim()
          };
        });
      }
    }

    // 2. 구글 시트에서 각 선생님의 데이터를 가져와 엑셀 맵과 대조 (구글시트 기준)
    let isFirstTeacher = true;
    for (const teacherName of Array.from(teachersInExcel)) {
      if (!isFirstTeacher) console.log("");
      isFirstTeacher = false;
      
      const queryTeacherName = teacherName.replace(/\r?\n|\r/g, "/");
      let googleSchedule = {};
      let fetchSuccess = false;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); 
          const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=getScheduleAll&team=${encodeURIComponent(team)}&teacher=${encodeURIComponent(queryTeacherName)}`, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            googleSchedule = await res.json();
            fetchSuccess = true;
            break;
          }
        } catch (err) {}
        if (attempt < 3) await sleep(1000);
      }

      if (!fetchSuccess) {
        console.error(`  ❌ [오류] ${teacherName} 선생님의 구글 시트 데이터를 가져오지 못했습니다.`);
        continue;
      }
      
      const verifiedShifts = new Set();

      // 3. 구글시트에 존재하는 모든 날짜와 시간대에 대해 검사
      for (const dateStr in googleSchedule) {
        // 엑셀의 날짜 범위(dateColumns)에 포함되는 날짜만 검사
        if (!dateColumns.find(d => d.dateStr === dateStr)) continue;
        
        for (const shiftName in googleSchedule[dateStr]) {
          if (!verifiedShifts.has(shiftName)) {
            console.log(`  - 검증 중: ${teacherName} 선생님 (${shiftName})`);
            verifiedShifts.add(shiftName);
          }
          const gData = googleSchedule[dateStr][shiftName];
          const gStudent = String(gData.student || "").trim();
          let gLocation = String(gData.location || "").trim();
          const gStatus = String(gData.status || "").trim();
          
          if (team === "취업팀" && gLocation.startsWith("http")) {
            gLocation = "";
          }
          
          const cleanGStatus = gStatus === "1" ? "1" : gStatus;

          // 엑셀 데이터 조회
          const eData = (excelMap[teacherName][dateStr] && excelMap[teacherName][dateStr][shiftName]) || { student: "", location: "", status: "" };
          const eStudent = eData.student;
          const eLocation = eData.location;
          const eStatus = eData.status;

          // 비교 (학생)
          totalChecked++;
          if (removeSpaces(gStudent) !== removeSpaces(eStudent)) {
            console.error(`  ❌ [불일치] ${dateStr} [${shiftName}] 학생 정보 불일치!`);
            console.error(`    - 구글시트: "${gStudent}" vs 엑셀파일: "${eStudent}"`);
            totalMismatches++;
          } else {
            totalMatches++;
          }

          // 비교 (장소)
          totalChecked++;
          if (removeSpaces(gLocation) !== removeSpaces(eLocation)) {
            console.error(`  ❌ [불일치] ${dateStr} [${shiftName}] 장소 정보 불일치!`);
            console.error(`    - 구글시트: "${gLocation}" vs 엑셀파일: "${eLocation}"`);
            totalMismatches++;
          } else {
            totalMatches++;
          }

          // 비교 (상태)
          totalChecked++;
          if (removeSpaces(cleanGStatus) !== removeSpaces(eStatus)) {
            console.error(`  ❌ [불일치] ${dateStr} [${shiftName}] 진행/상태 정보 불일치!`);
            console.error(`    - 구글시트: "${cleanGStatus}" vs 엑셀파일: "${eStatus}"`);
            totalMismatches++;
          } else {
            totalMatches++;
          }
        }
      }
      
      await sleep(100); // API Rate limit 방지
    }
  }

  console.log(`\n============================================`);
  console.log(`🏁 구글시트 기준 엑셀 파일 검증 완료!`);
  console.log(`============================================`);
  console.log(`- 총 검사한 셀 항목 수: ${totalChecked}개`);
  console.log(`- 원본과 완전히 일치하는 항목 수: ${totalMatches}개`);
  console.log(`- 불일치 항목 수: ${totalMismatches}개`);
  if (totalChecked > 0) {
    const accuracy = ((totalMatches / totalChecked) * 100).toFixed(2);
    console.log(`- 최종 데이터 일치율: ${accuracy}%`);
  }
  console.log(`============================================`);
}

main().catch(console.error);