const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';

const getWeekdaysInRange = (startStr, endStr) => {
  const list = [];
  let curr = new Date(startStr);
  const end = new Date(endStr);
  while (curr <= end) {
    const day = curr.getDay();
    if (day !== 0 && day !== 6) {
      const yyyy = curr.getFullYear();
      const mm = String(curr.getMonth() + 1).padStart(2, '0');
      const dd = String(curr.getDate()).padStart(2, '0');
      list.push(`${yyyy}-${mm}-${dd}`);
    }
    curr.setDate(curr.getDate() + 1);
  }
  return list;
};

async function test() {
  try {
    console.log("=== 1. Supabase에서 2팀 교사 목록 가져오기 ===");
    const tRes = await fetch(`${SUPABASE_URL}/rest/v1/teachers?team=eq.2%ED%8C%80&select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    if (!tRes.ok) {
       throw new Error(`Teachers fetch failed: ${await tRes.text()}`);
    }
    const teacherList = await tRes.json();
    const teacherNames = teacherList.map(t => t.name.trim());
    console.log(`선생님 목록 (${teacherList.length}명):`, teacherNames);

    console.log("\n=== 2. Supabase에서 공휴일(holidays) 목록 가져오기 ===");
    const hRes = await fetch(`${SUPABASE_URL}/rest/v1/holidays?select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    if (!hRes.ok) {
       throw new Error(`Holidays fetch failed: ${await hRes.text()}`);
    }
    const holidays = await hRes.json();
    console.log(`공휴일 목록 (${holidays.length}개):`, holidays.map(h => `${h.date}: ${h.name}`));

    // 테스트 기간 연장: 6월 1일부터 7월 20일까지로 지정 (평일 약 36일)
    const startDate = "2026-06-01";
    const endDate = "2026-07-20";
    const baseDates = ["2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29"]; // 5월 마지막주 기준 주간

    console.log(`\n=== 3. 기준 주간(${baseDates[0]} ~ ${baseDates[4]})의 daily_logs 가져오기 ===`);
    const logsRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs?team=eq.2%ED%8C%80&log_date=in.(${baseDates.join(',')})&select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    if (!logsRes.ok) {
       throw new Error(`Logs fetch failed: ${await logsRes.text()}`);
    }
    const baseLogs = await logsRes.json();
    console.log(`수업 로그 수: ${baseLogs.length}개`);

    // 템플릿 작성
    const templates = {};
    teacherNames.forEach(name => {
      templates[name] = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} };
    });

    const EXCLUDE_KEYWORDS = ["공휴일", "대체공휴일", "근로자의날", "어린이날", "현충일", "광복절", "개천절", "한글날", "석가탄신일", "부처님오신날", "성탄절", "제헌절", "추석", "설날", "신정", "선거일", "간담회", "소양교육", "자체학습", "휴가", "휴강", "준비", "자체학습"];

    teacherNames.forEach(teacherName => {
      const teacherObj = teacherList.find(t => t.name.trim() === teacherName);
      const shifts = [teacherObj.shift1, teacherObj.shift2, teacherObj.shift3].map(s => (s || "").trim()).filter(Boolean);

      for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek++) {
        const baseDate = baseDates.find(dateStr => {
          const d = new Date(dateStr);
          return d.getDay() === dayOfWeek;
        });
        if (!baseDate) continue;

        let dayRecords = baseLogs.filter(l => l.teacher.trim() === teacherName && l.log_date === baseDate);

        shifts.forEach(shift => {
          const match = dayRecords.find(r => r.shift.trim() === shift);
          const student = match ? (match.student || "") : "";
          const location = match ? (match.signature_url || match.location || "") : "";

          templates[teacherName][dayOfWeek][shift] = {
            student: student,
            location: location
          };
        });
      }
    });

    // 교사별 정상 근무 요일 판단 (실 수업 데이터 기준)
    const workingDaysOfWeek = {};
    teacherNames.forEach(name => {
      workingDaysOfWeek[name] = new Set();
      const teacherObj = teacherList.find(t => t.name.trim() === name);
      const shifts = [teacherObj.shift1, teacherObj.shift2, teacherObj.shift3].map(s => (s || "").trim()).filter(Boolean);

      for (let day = 1; day <= 5; day++) {
        const hasClass = shifts.some(shift => {
          const temp = templates[name][day]?.[shift];
          const student = temp ? (temp.student || "").trim() : "";
          return student && !EXCLUDE_KEYWORDS.some(kw => student.includes(kw));
        });
        if (hasClass) {
          workingDaysOfWeek[name].add(day);
        }
      }
    });

    const isHoliday = (dateStr) => {
      const [year, month, day] = dateStr.split('-');
      const mmdd = `${month}-${day}`;
      const m_d = `${parseInt(month)}/${parseInt(day)}`;
      const m_d_dash = `${parseInt(month)}-${parseInt(day)}`;

      return holidays.some(h => {
        const hDate = (h.date || "").trim();
        return hDate === dateStr || hDate === mmdd || hDate === m_d || hDate === m_d_dash;
      });
    };

    const getHolidayObj = (dateStr) => {
      const [year, month, day] = dateStr.split('-');
      const mmdd = `${month}-${day}`;
      const m_d = `${parseInt(month)}/${parseInt(day)}`;
      const m_d_dash = `${parseInt(month)}-${parseInt(day)}`;

      return holidays.find(h => {
        const hDate = (h.date || "").trim();
        return hDate === dateStr || hDate === mmdd || hDate === m_d || hDate === m_d_dash;
      });
    };

    const targetDates = getWeekdaysInRange(startDate, endDate);
    console.log(`\n대상 평일수 (주말 제외): ${targetDates.length}일`);

    const drafts = [];
    const teacherWorkDaysCount = {};
    teacherNames.forEach(name => {
      teacherWorkDaysCount[name] = 0;
    });

    targetDates.forEach(dateStr => {
      const d = new Date(dateStr);
      const dayOfWeek = d.getDay();
      const isHol = isHoliday(dateStr);
      const holidayObj = getHolidayObj(dateStr);

      teacherList.forEach(t => {
        const teacherName = t.name.trim();
        const shifts = [t.shift1, t.shift2, t.shift3].map(s => (s || "").trim()).filter(Boolean);
        const isMyWorkingDay = workingDaysOfWeek[teacherName]?.has(dayOfWeek);

        if (isMyWorkingDay) {
          teacherWorkDaysCount[teacherName] += 1;
        }

        const isOver20 = teacherWorkDaysCount[teacherName] > 20;

        shifts.forEach(shift => {
          let student = "";
          let location = "";
          let status = "";

          if (isMyWorkingDay) {
            if (isOver20) {
              student = "";
              location = "";
              status = "";
            } else if (isHol) {
              student = holidayObj ? holidayObj.name : "공휴일";
              location = holidayObj ? holidayObj.content1 : "";
              status = holidayObj ? holidayObj.content2 : "";
            } else {
              const temp = templates[teacherName][dayOfWeek]?.[shift];
              student = temp ? temp.student : "";
              const loc = temp ? temp.location : "";
              const isUrl = loc.startsWith("http");
              location = isUrl ? "" : (loc.trim() || "복지관");
              status = "";
            }
          }

          drafts.push({
            dateStr,
            teacherName,
            shift,
            isMyWorkingDay,
            workDaySeq: isMyWorkingDay ? teacherWorkDaysCount[teacherName] : 0,
            student,
            location,
            status
          });
        });
      });
    });

    console.log("\n=== 4. 시뮬레이션 결과 검증 ===");
    // 특정 선생님(예: '표영' 선생님)의 6월 일정 출력
    const sampleTeacher = "표영";
    const sampleTeacherLogs = drafts.filter(d => d.teacherName === sampleTeacher);
    console.log(`[${sampleTeacher}] 선생님의 일수별 스케줄 내역:`);
    
    const datesTracked = new Set();
    sampleTeacherLogs.forEach(log => {
      if (datesTracked.has(log.dateStr)) return;
      datesTracked.add(log.dateStr);

      const sameDayShifts = sampleTeacherLogs.filter(l => l.dateStr === log.dateStr);
      const dayStr = log.isMyWorkingDay ? `근무일 #${log.workDaySeq}` : "비근무요일";
      const shiftsDesc = sameDayShifts.map(s => `[${s.shift}] 학생: '${s.student || '(블랭크)'}', 장소: '${s.location || '(블랭크)'}', 메모: '${s.status || '(블랭크)'}'`).join(" / ");
      console.log(`- ${log.dateStr} (${dayStr}): ${shiftsDesc}`);
    });

    // 최종 요약
    console.log("\n=== 교사별 최종 근무일수 요약 ===");
    for (const name of teacherNames) {
       console.log(`- ${name} 선생님: 총 ${teacherWorkDaysCount[name]}일 근무 배정`);
    }
  } catch (err) {
    console.error("Error occurred during test script execution:", err);
  }
}

test();
