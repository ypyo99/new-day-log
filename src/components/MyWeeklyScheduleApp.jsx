import React, { useState, useEffect, useCallback } from 'react';
import { supabaseClient } from '../utils/supabase';
import {
  getLocalDateString,
  getTeacherShifts,
  getTeamDefaultShifts
} from '../utils/helpers';
import { User, MainCalendarIcon, Home, Clock } from './Icons';

export default function MyWeeklyScheduleApp({ team, teacher, onNavigateBack }) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    if (day === 0) d.setDate(d.getDate() + 1);
    else if (day === 6) d.setDate(d.getDate() + 2);
    const newDay = d.getDay();
    const diff = d.getDate() - newDay + (newDay === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  });

  const [scheduleData, setScheduleData] = useState(null);
  const [specialDays, setSpecialDays] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [supabaseRecords, setSupabaseRecords] = useState([]);
  const [noDataMessage, setNoDataMessage] = useState("");
  const [teamLeader, setTeamLeader] = useState(null);

  const weekDays = ['월', '화', '수', '목', '금'];
  const [timeSlots, setTimeSlots] = useState([]);

  const getCurrentWeekDays = useCallback(() => {
    const days = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(currentWeekStart);
      d.setDate(currentWeekStart.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentWeekStart]);

  const currentDays = getCurrentWeekDays();
  const startMonth = currentDays[0].getMonth() + 1;
  const startDay = currentDays[0].getDate();
  const endMonth = currentDays[4].getMonth() + 1;
  const endDay = currentDays[4].getDate();

  const checkDataExistsForWeek = async (weekStart) => {
    try {
      const days = [];
      for (let i = 0; i < 5; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        days.push(d);
      }
      const startStr = getLocalDateString(days[0]);
      const endStr = getLocalDateString(days[4]);

      let query = supabaseClient
        .from('daily_logs')
        .select('id')
        .eq('team', team)
        .gte('log_date', startStr)
        .lte('log_date', endStr);

      if (teacher !== "__ALL__") {
        query = query.eq('teacher', teacher);
      }

      const { data, error } = await query.limit(1);
      if (error) throw error;
      return data && data.length > 0;
    } catch (e) {
      console.error("데이터 체크 실패:", e);
      return false;
    }
  };

  const changeWeek = async (offsetWeeks) => {
    if (isLoading) return;
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + (offsetWeeks * 7));

    setIsLoading(true);
    const hasData = await checkDataExistsForWeek(newDate);
    setIsLoading(false);

    if (!hasData) {
      setNoDataMessage("더 이상 데이터가 없습니다.");
      setTimeout(() => {
        setNoDataMessage("");
      }, 2000);
      return;
    }
    setCurrentWeekStart(newDate);
  };

  const handleCurrentWeekClick = async () => {
    if (isLoading) return;
    const d = new Date();
    const day = d.getDay();
    if (day === 0) d.setDate(d.getDate() + 1);
    else if (day === 6) d.setDate(d.getDate() + 2);
    const newDay = d.getDay();
    const diff = d.getDate() - newDay + (newDay === 0 ? -6 : 1);
    const targetDate = new Date(d.setDate(diff));

    setIsLoading(true);
    const hasData = await checkDataExistsForWeek(targetDate);
    setIsLoading(false);

    if (!hasData) {
      setNoDataMessage("더 이상 데이터가 없습니다.");
      setTimeout(() => {
        setNoDataMessage("");
      }, 2000);
      return;
    }
    setCurrentWeekStart(targetDate);
  };

  // 1.5 주간 Supabase 데이터 페칭 (요일 범위나 팀, 선생님 변경 시)
  useEffect(() => {
    if (!team || !teacher || !currentWeekStart) return;

    const fetchWeeklySupabase = async () => {
      try {
        const days = getCurrentWeekDays();
        const startStr = getLocalDateString(days[0]);
        const endStr = getLocalDateString(days[4]);

        // 팀장(seq_num=1) 이름 가져오기
        const { data: leaderData } = await supabaseClient
          .from('teachers')
          .select('name')
          .eq('team', team)
          .eq('seq_num', 1)
          .limit(1);
        if (leaderData && leaderData.length > 0) {
          setTeamLeader(leaderData[0].name);
        }

        // 팀장 일정도 확인해야 하므로 teacher 필터 없이 팀 전체 스케줄 로드
        let query = supabaseClient
          .from('daily_logs')
          .select('*')
          .eq('team', team)
          .gte('log_date', startStr)
          .lte('log_date', endStr);

        const { data, error } = await query;
        if (error) throw error;
        setSupabaseRecords(data || []);
      } catch (e) {
        console.error("주간 Supabase 데이터 로드 실패:", e);
      }
    };

    fetchWeeklySupabase();
  }, [team, teacher, currentWeekStart]);

  // 2. Supabase에서 읽어온 주간 레코드를 바탕으로 시간대별, 요일별 데이터 구조화
  useEffect(() => {
    if (!teacher || !currentWeekStart) return;

    // 팀장의 스케줄을 확인하여 specialDays(공휴일/간담회/소양교육) 설정
    const newSpecialDays = {};
    if (teamLeader) {
      const days = getCurrentWeekDays();
      days.forEach(day => {
        const dateStr = getLocalDateString(day);
        const leaderRecords = supabaseRecords.filter(r => r.log_date === dateStr && r.teacher === teamLeader);
        const specialRec = leaderRecords.find(r => {
          const content = (r.student || "") + " " + (r.location || "");
          return content.includes("공휴일") || content.includes("간담회") || content.includes("소양교육");
        });
        if (specialRec) {
          newSpecialDays[dateStr] = {
            student: specialRec.student || "",
            location: specialRec.location || "",
            memo: specialRec.status || ""
          };
        }
      });
    }
    setSpecialDays(newSpecialDays);

    const defaultSlots = teacher && teacher !== "__ALL__"
      ? getTeacherShifts(team, teacher)
      : getTeamDefaultShifts(team);

    const extractedSlots = new Set();
    supabaseRecords.forEach(r => {
      // 해당 선생님의 시간대만 추출
      if (r.shift && (teacher === "__ALL__" || r.teacher === teacher)) {
        extractedSlots.add(r.shift);
      }
    });

    const finalSlots = extractedSlots.size > 0
      ? Array.from(extractedSlots).sort((a, b) => {
        const getT = (s) => {
          const m = s.match(/(\d+):(\d+)/) || s.match(/(\d+)\s*시/);
          return m ? parseInt(m[1]) * 60 + (m[2] ? parseInt(m[2]) : 0) : 9999;
        };
        return getT(a) - getT(b);
      })
      : (defaultSlots.length > 0 ? defaultSlots : getTeamDefaultShifts(team));

    setTimeSlots(finalSlots);

    const parsedData = {};
    finalSlots.forEach((slot, slotIdx) => {
      parsedData[slot] = {};
      currentDays.forEach(day => {
        const dateStr = getLocalDateString(day);
        const isSpecialDay = newSpecialDays[dateStr];

        // 첫 번째 슬롯에 팀장 일정 복사, 나머지는 빈칸 (특수한 날인 경우)
        if (isSpecialDay && slotIdx === 0) {
          parsedData[slot][dateStr] = {
            student: isSpecialDay.student,
            location: isSpecialDay.location,
            status: isSpecialDay.memo,
            isSpecial: true
          };
        } else if (isSpecialDay && slotIdx > 0) {
          parsedData[slot][dateStr] = { student: "", location: "", status: "", isSpecial: true };
        } else {
          const supRec = supabaseRecords.find(r => r.log_date === dateStr && r.shift === slot && (teacher === "__ALL__" || r.teacher === teacher));
          if (supRec) {
            parsedData[slot][dateStr] = {
              student: supRec.student || "",
              location: supRec.signature_url || supRec.location || "",
              status: supRec.status || "",
              isSpecial: false
            };
          } else {
            parsedData[slot][dateStr] = { student: "", location: "", status: "", isSpecial: false };
          }
        }
      });
    });

    setScheduleData(parsedData);
  }, [teacher, currentWeekStart, supabaseRecords, teamLeader]);

  const getStatusColorClass = (statusStr) => {
    if (!statusStr) return "text-gray-800";
    const parts = statusStr.split(',').map(s => s.trim().replace(/\s+/g, ''));
    if (parts.includes("결석") || parts.includes("취소")) return "text-red-600";
    if (parts.includes("휴가") || parts.includes("선생님휴가")) return "text-gray-500";
    return "text-blue-700";
  };

  const parseWeeklyStatus = (statusStr) => {
    if (!statusStr) return { tags: [], memo: "" };
    const parts = statusStr.split(',').map(s => s.trim()).filter(Boolean);
    let tags = [];
    let memos = [];

    const tagKeywords = ['출석', '결석', '취소', '선생님휴가', '휴가'];

    parts.forEach((part, i) => {
      const cleanPart = part.replace(/\s+/g, '');

      // 다인원 출석 패턴 처리 (/ 포함 시)
      if (cleanPart.includes('/')) {
        const subParts = cleanPart.split('/');
        if (subParts.length === 2) {
          const [p1, p2] = subParts;
          const isP1Tag = /^\d+$/.test(p1) || tagKeywords.includes(p1);
          const isP2Tag = /^\d+$/.test(p2) || tagKeywords.includes(p2);

          if (isP1Tag && isP2Tag) {
            let t1 = p1 === '1' ? '출석' : (/^\d+$/.test(p1) ? '출석' + p1 : p1);
            let t2 = p2 === '1' ? '출석' : (/^\d+$/.test(p2) ? '출석' + p2 : p2);

            tags.push(`${t1}/${t2}`);
            return;
          }
        }
      }

      const isNumber = /^\d+$/.test(cleanPart);
      const hasKeyword = tagKeywords.some(k => cleanPart === k);

      let isTag = false;
      if (hasKeyword) {
        isTag = true;
      } else if (isNumber) {
        isTag = (i === 0);
      }

      if (isTag) {
        let displayTag = part;
        if (part === '1') displayTag = '출석';
        else if (isNumber) displayTag = `출석${part}`;
        tags.push(displayTag);
      } else {
        memos.push(part);
      }
    });

    return { tags, memo: memos.join(', ') };
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gray-50 font-sans">
      <header className="bg-blue-600 text-white px-4 pb-4 pt-safe-4 shadow-lg z-40 flex justify-between items-center relative">
        <div className="flex items-center">
          <div className="flex flex-col">
            <div className="flex items-center mb-1">
              <img src="Logo_of_Seoul.jpg" alt="서울시 로고" className="h-7 bg-white px-2 py-1 rounded-md object-contain mr-2" onError={(e) => e.target.style.display = 'none'} />
              <h1 className="font-black text-xl leading-tight">성동노인종합복지관</h1>
            </div>
            <p className="text-lg font-bold text-yellow-300">디지털교육 서포터즈</p>
            <p className="text-base opacity-95 flex items-center mt-1 font-bold">
              <User className="w-4 h-4 mr-1" /> [{team}] {teacher.replace(/\n/g, ' ')} 선생님
            </p>
          </div>
        </div>
        <button onClick={onNavigateBack} className="text-xs flex flex-col items-center font-bold p-2 rounded-lg shadow-md transition-all touch-manipulation bg-blue-800 text-white opacity-90 active:scale-95">
          <Home className="w-5 h-5 mb-1" /> 처음으로
        </button>
      </header>

      <main className="flex-1 flex flex-col w-full mx-auto p-3 sm:p-5 lg:p-8">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 flex flex-col flex-1 overflow-hidden">
          <div className="shrink-0 bg-white px-4 sm:px-6 pt-5 pb-4 shadow-sm relative z-10 flex flex-col items-center border-b border-gray-100">
            <h2 className="text-[18px] sm:text-2xl font-black text-gray-900 mb-4 flex items-center gap-2">
              <MainCalendarIcon className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600" />
              나의 주간 일정 보기
            </h2>
            <div className="flex items-center gap-2 w-full max-w-sm md:max-w-md lg:max-w-lg mx-auto">
              <button onClick={() => changeWeek(-1)} className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center border-2 border-gray-300 rounded-xl bg-white shadow-sm hover:bg-gray-50 active:bg-gray-100 text-gray-700 shrink-0 transition-all touch-manipulation">
                <svg className="w-7 h-7 md:w-8 md:h-8" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" /></svg>
              </button>
              <div className="flex-1 h-12 md:h-14 flex items-center justify-center border-2 border-blue-400 rounded-xl bg-[#f0f7ff] text-center shadow-sm">
                <h2 className="font-extrabold text-[#1e3a8a] text-[18px] sm:text-[22px] md:text-[24px] tracking-tight">{startMonth}/{startDay} ~ {endMonth}/{endDay}</h2>
              </div>
              <button onClick={handleCurrentWeekClick} className="px-4 h-12 md:h-14 border-2 border-blue-600 rounded-xl font-bold bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 shrink-0 text-[16px] md:text-[18px] transition-all touch-manipulation">이번 주</button>
              <button onClick={() => changeWeek(1)} className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center border-2 border-gray-300 rounded-xl bg-white shadow-sm hover:bg-gray-50 active:bg-gray-100 text-gray-700 shrink-0 transition-all touch-manipulation">
                <svg className="w-7 h-7 md:w-8 md:h-8" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" /></svg>
              </button>
            </div>
            {noDataMessage && <div className="mt-2 text-red-600 font-bold text-base text-center animate-fadeIn">{noDataMessage}</div>}
            {notice && <div className="mt-2 text-red-600 font-bold text-center animate-fadeIn">{notice}</div>}
            {isLoading && <div className="mt-3 text-sm sm:text-base text-red-600 font-bold flex items-center animate-pulse"><Clock className="w-4 h-4 mr-1 animate-spin" />일정 데이터를 불러오는 중...</div>}
          </div>

          <div className="flex-1 overflow-x-auto overflow-y-auto bg-gray-50/50 p-0">
            <div className="min-w-[650px] w-full md:w-[92%] lg:w-[88%] max-w-[1600px] bg-white rounded-xl shadow-sm border-2 border-gray-300 overflow-hidden mx-auto my-2 sm:my-4">
              <table className="w-full table-fixed text-center border-collapse">
                <thead>
                  <tr className="bg-[#eef2ff] border-b-2 border-gray-300">
                    <th className="w-[12%] py-2 md:py-3 border-r-2 border-gray-300 font-black text-gray-800 text-[clamp(1rem,2.2vw,1.3rem)]">시간</th>
                    {currentDays.map((day, i) => {
                      const dateStr = getLocalDateString(day);
                      const isToday = dateStr === getLocalDateString(new Date());

                      return (
                        <th key={i} style={{ width: '17.6%' }} className={`py-2 md:py-3 font-black text-[clamp(1rem,2.2vw,1.3rem)] tracking-tight transition-all ${isToday ? 'border-l-4 border-r-4 border-t-4 border-blue-600 text-blue-700 bg-blue-50' : 'border-r-2 border-gray-300 text-blue-900 last:border-0'}`}>
                          {day.getMonth() + 1}/{day.getDate()} ({weekDays[i]})
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {timeSlots.map((time, idx) => (
                    <tr key={idx} className="border-b-2 border-gray-300 last:border-0">
                      <td className="py-3 md:py-5 px-1 border-r-2 border-gray-300 bg-[#f8fafc] font-black text-blue-800 text-[clamp(0.95rem,2.1vw,1.25rem)] whitespace-pre-line leading-tight">
                        {time.replace('~', '\n~\n')}
                      </td>
                      {currentDays.map((day, i) => {
                        const dateStr = getLocalDateString(day);
                        const isToday = dateStr === getLocalDateString(new Date());
                        const specialDayInfo = specialDays && specialDays[dateStr];

                        const isLastSlot = idx === timeSlots.length - 1;
                        const todayBorderClass = isToday ? `border-l-4 border-r-4 ${isLastSlot ? 'border-b-4' : ''} border-blue-600 z-10` : 'border-r-2 border-gray-300 last:border-0';

                        const cellData = scheduleData?.[time]?.[dateStr];

                        if (!cellData || (!cellData.student && !cellData.location && !cellData.status)) {
                          return (
                            <td key={i} className={`p-0 align-top hover:bg-gray-50 transition-colors overflow-hidden ${todayBorderClass} ${specialDayInfo ? 'bg-red-400' : ''}`}>
                              <div className="flex items-center justify-center h-full min-h-[110px] text-gray-400 font-bold text-[clamp(1rem,2vw,1.2rem)]">
                              </div>
                            </td>
                          );
                        }

                        const parsedStatus = parseWeeklyStatus(cellData.status);
                        const isAssistant = cellData.student && cellData.student.includes("보조강사");
                        const isKyungrodang = (cellData.student || "").includes("경로당") || (cellData.student || "").includes("복지관") || (cellData.location || "").includes("경로당") || ((cellData.location || "").includes("복지관") && (cellData.location || "").trim() !== "복지관");
                        const isHoliday = (cellData.student && /공휴일|근로자의날|어린이날|휴일|공휴/.test(cellData.student.replace(/\s/g, ''))) ||
                          (cellData.status && /공휴일|근로자의날|어린이날|휴일|공휴/.test(cellData.status.replace(/\s/g, ''))) ||
                          (cellData.location && /공휴일|근로자의날|어린이날|휴일|공휴/.test(cellData.location.replace(/\s/g, '')));
                        const cardBgClass = isAssistant ? "bg-[#FFFF00]" : isKyungrodang ? "bg-orange-100" : "bg-white";

                        let cellBgClass = cardBgClass;
                        if (specialDayInfo) {
                          cellBgClass = "bg-red-400";
                        }

                        return (
                          <td key={i} className={`${cellBgClass} p-0 align-middle transition-all overflow-hidden h-full hover:brightness-95 ${todayBorderClass}`}>
                            <div className={`flex flex-col gap-1 justify-center items-center h-full min-h-[110px] overflow-hidden w-full max-w-full ${isHoliday ? 'p-3 bg-red-400 text-white' : 'p-3'}`}>
                              {parsedStatus.tags.length > 0 && !cellData.student?.includes("간담회") && (
                                <div className="flex flex-wrap gap-1.5 justify-center w-full mb-1">
                                  {parsedStatus.tags.map((tag, tIdx) => {
                                    let tagStyle = "bg-blue-100 text-blue-700 border-blue-300";
                                    if (tag.includes('결석')) tagStyle = "bg-red-100 text-red-700 border-red-300";
                                    else if (tag.includes('취소')) tagStyle = "bg-orange-100 text-orange-700 border-orange-300";
                                    else if (tag.includes('휴가')) tagStyle = "bg-gray-200 text-gray-700 border-gray-400";
                                    else if (tag.includes('출석') || /^\d+/.test(tag)) tagStyle = "bg-blue-500 text-white border-blue-600 shadow-inner";
                                    return (
                                      <span key={tIdx} className={`px-2.5 py-1 rounded-lg text-[clamp(0.75rem,1.5vw,1rem)] font-extrabold border shadow-sm leading-none whitespace-nowrap overflow-hidden text-ellipsis max-w-full ${tagStyle}`}>
                                        {tag}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                              {cellData.student && <div className={`font-bold ${isHoliday ? 'text-white w-full' : (cellData.isSpecial ? 'text-red-700 w-full' : 'text-gray-900 w-full')} text-[clamp(1.1rem,2.6vw,1.7rem)] leading-tight break-all whitespace-pre-wrap text-center flex-shrink-0`}>{cellData.student.replace(/\n/g, ' ').replace(/부처님오신날/g, '부처님\n오신날').replace(/보조강사\s*/g, '보조강사\n').replace(/\//g, '/\n').trim()}</div>}
                              {cellData.location && cellData.location !== "복지관" && team !== '취업팀' && <div className={`${isHoliday ? 'text-yellow-200' : 'text-gray-600'} text-[clamp(0.9rem,2.1vw,1.35rem)] font-bold break-all whitespace-pre-wrap text-center max-w-full leading-tight mt-1`}>{cellData.location.replace(/대체공휴일/g, '대체\n공휴일')}</div>}
                              {parsedStatus.memo && <div className={`font-bold text-[clamp(0.9rem,2.1vw,1.35rem)] leading-snug break-words whitespace-pre-wrap text-center mt-1 w-full ${isHoliday ? 'text-white' : getStatusColorClass(cellData.status)}`}>{parsedStatus.memo.replace(/대체공휴일/g, '대체\n공휴일')}</div>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
