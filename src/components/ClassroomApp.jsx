// 지하1층 평생교육실2 사용 보기

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabaseClient } from '../utils/supabase';
import { getSavedItem, getLocalDateString } from '../utils/helpers';
import { LucideCalendar, Home } from './Icons';

const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id';

export default function ClassroomApp({ onNavigateBack }) {
  const [saveErrorMsg, setSaveErrorMsg] = useState("");
  const [supabaseTableMissing, setSupabaseTableMissing] = useState(false);
  const [holidayDates, setHolidayDates] = useState(new Map());

  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    if (day === 0) d.setDate(d.getDate() + 1);
    else if (day === 6) d.setDate(d.getDate() + 2);

    const newDay = d.getDay();
    const diff = d.getDate() - newDay + (newDay === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  });

  const adjustedTodayStr = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    if (day === 0) d.setDate(d.getDate() + 1);
    else if (day === 6) d.setDate(d.getDate() + 2);
    return getLocalDateString(d);
  }, []);

  const [schedule, setSchedule] = useState(() => {
    try {
      const cached = window.localStorage.getItem('classroom_schedule_backup');
      return cached ? JSON.parse(cached) : {};
    } catch (e) { return {}; }
  });

  const [memo, setMemo] = useState(() => {
    return window.localStorage.getItem('classroom_memo_backup') || "";
  });

  const [isTyping, setIsTyping] = useState(false);
  const isTypingRef = useRef(false);
  const [isManagerMode, setIsManagerMode] = useState(false);
  const isManagerModeRef = useRef(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdInput, setPwdInput] = useState("");
  const [pwdError, setPwdError] = useState(false);
  const pwdInputRef = useRef(null);

  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  useEffect(() => {
    document.documentElement.style.overscrollBehaviorY = 'none';
    document.body.style.overscrollBehaviorY = 'none';
    return () => {
      document.documentElement.style.overscrollBehaviorY = 'auto';
      document.body.style.overscrollBehaviorY = 'auto';
    };
  }, []);

  useEffect(() => {
    if (showPwdModal && pwdInputRef.current) {
      pwdInputRef.current.focus();
    }
  }, [showPwdModal]);

  useEffect(() => {
    isManagerModeRef.current = isManagerMode;
  }, [isManagerMode]);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchStartX.current - touchEndX;
    const deltaY = touchStartY.current - touchEndY;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 150) {
      if (deltaX > 0) changeWeek(1);
      else changeWeek(-1);
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const timeSlots = [
    "09:30 - 10:30", "10:30 - 11:30", "11:30 - 12:30",
    "13:00 - 14:00", "14:00 - 15:00", "15:00 - 16:00"
  ];
  const weekDays = ['월', '화', '수', '목', '금'];

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const { data: hData } = await supabaseClient.from('holidays').select('date, name, content1, content2');
        if (hData) {
          const hMap = new Map();
          hData.forEach(h => {
            if (h.date) {
              hMap.set(h.date, {
                name: h.name || '공휴일',
                content1: h.content1 || '',
                content2: h.content2 || ''
              });
            }
          });
          setHolidayDates(hMap);
        }

        const { data, error } = await supabaseClient
          .from('classroom_schedules')
          .select('data, memo')
          .eq('id', appId)
          .maybeSingle();

        if (error) {
          if (error.code === '42P01' || error.code === 'PGRST205' || (error.message && error.message.includes('classroom_schedules'))) {
            setSupabaseTableMissing(true);
          }
          console.error("Supabase load error:", error);
        } else if (data) {
          setSchedule(data.data || {});
          setMemo(data.memo || "");
          window.localStorage.setItem('classroom_schedule_backup', JSON.stringify(data.data || {}));
          window.localStorage.setItem('classroom_memo_backup', data.memo || "");
        }
      } catch (err) {
        console.error("Supabase exception:", err);
      }
    };

    loadInitialData();

    const channel = supabaseClient
      .channel('classroom_schedules_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'classroom_schedules', filter: `id=eq.${appId}` },
        (payload) => {
          const newData = payload.new;
          if (newData && !isManagerModeRef.current) {
            setSchedule(newData.data || {});
            setMemo(newData.memo || "");
          }
        }
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, []);

  const saveBulkChanges = (changes) => {
    if (Object.keys(changes).length === 0) return;
    const optimisticData = {};
    Object.keys(changes).forEach(k => {
      const cleanKey = k.replace('data.', '');
      optimisticData[cleanKey] = changes[k];
    });
    const newSchedule = { ...schedule, ...optimisticData };
    setSchedule(newSchedule);
    window.localStorage.setItem('classroom_schedule_backup', JSON.stringify(newSchedule));
  };

  const getScheduleKey = (dateStr, timeSlot) => {
    return `${dateStr}_${timeSlot.replace(/\s+/g, '').replace(/~/g, '-').replace(/:/g, '')}`;
  };

  const toggleAvailability = (dateStr, timeSlot) => {
    if (!isManagerMode) return;
    const key = getScheduleKey(dateStr, timeSlot);
    const currentValue = schedule[key];

    let newValue;
    if (currentValue !== '평생교육실' && currentValue !== '낭만스튜디오' && currentValue !== '평생교육실/낭만스튜디오') {
      newValue = '평생교육실';
    } else if (currentValue === '평생교육실') {
      newValue = '낭만스튜디오';
    } else if (currentValue === '낭만스튜디오') {
      newValue = '평생교육실/낭만스튜디오';
    } else {
      newValue = '   ';
    }
    const newSchedule = { ...schedule, [key]: newValue };
    setSchedule(newSchedule);
    window.localStorage.setItem('classroom_schedule_backup', JSON.stringify(newSchedule));
  };

  const toggleAll = () => {
    if (!isManagerMode) return;
    const currentDays = getCurrentWeekDays();
    const allKeys = [];
    currentDays.forEach(day => {
      const ds = formatDateString(day);
      const mmdd = ds.substring(5);
      if (holidayDates.has(mmdd)) return; // 공휴일은 건너뜀
      timeSlots.forEach(slot => allKeys.push(getScheduleKey(ds, slot)));
    });

    const allEdu = allKeys.every(k => schedule[k] === '평생교육실');
    const allNangman = allKeys.every(k => schedule[k] === '낭만스튜디오');
    const allBoth = allKeys.every(k => schedule[k] === '평생교육실/낭만스튜디오');

    let newValue;
    if (allEdu) newValue = '낭만스튜디오';
    else if (allNangman) newValue = '평생교육실/낭만스튜디오';
    else if (allBoth) newValue = '   ';
    else newValue = '평생교육실';

    const changes = {};
    allKeys.forEach(k => { changes[`data.${k}`] = newValue; });
    saveBulkChanges(changes);
  };

  const toggleWholeDay = (dateStr) => {
    if (!isManagerMode) return;
    const mmdd = dateStr.substring(5);
    if (holidayDates.has(mmdd)) return; // 공휴일 일괄 토글 차단

    const dayKeys = timeSlots.map(slot => getScheduleKey(dateStr, slot));
    const allEdu = dayKeys.every(k => schedule[k] === '평생교육실');
    const allNangman = dayKeys.every(k => schedule[k] === '낭만스튜디오');
    const allBoth = dayKeys.every(k => schedule[k] === '평생교육실/낭만스튜디오');

    let newValue;
    if (allEdu) newValue = '낭만스튜디오';
    else if (allNangman) newValue = '평생교육실/낭만스튜디오';
    else if (allBoth) newValue = '   ';
    else newValue = '평생교육실';

    const changes = {};
    dayKeys.forEach(k => { changes[`data.${k}`] = newValue; });
    saveBulkChanges(changes);
  };

  const toggleWholeWeek = (timeSlot) => {
    if (!isManagerMode) return;
    const currentDays = getCurrentWeekDays();
    const weekKeys = [];
    currentDays.forEach(day => {
      const ds = formatDateString(day);
      const mmdd = ds.substring(5);
      if (!holidayDates.has(mmdd)) {
        weekKeys.push(getScheduleKey(ds, timeSlot));
      }
    });

    const allEdu = weekKeys.every(k => schedule[k] === '평생교육실');
    const allNangman = weekKeys.every(k => schedule[k] === '낭만스튜디오');
    const allBoth = weekKeys.every(k => schedule[k] === '평생교육실/낭만스튜디오');

    let newValue;
    if (allEdu) newValue = '낭만스튜디오';
    else if (allNangman) newValue = '평생교육실/낭만스튜디오';
    else if (allBoth) newValue = '   ';
    else newValue = '평생교육실';

    const changes = {};
    weekKeys.forEach(k => { changes[`data.${k}`] = newValue; });
    saveBulkChanges(changes);
  };

  useEffect(() => {
    if (!isTyping) return;
    const timer = setTimeout(() => {
      window.localStorage.setItem('classroom_memo_backup', memo);
      setIsTyping(false);
      isTypingRef.current = false;
    }, 1000);
    return () => clearTimeout(timer);
  }, [memo, isTyping]);

  const formatDateString = (date) => getLocalDateString(date);

  const getCurrentWeekDays = () => {
    const days = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(currentWeekStart);
      d.setDate(currentWeekStart.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const changeWeek = (offsetWeeks) => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + (offsetWeeks * 7));
    setCurrentWeekStart(newDate);
  };

  const handleCurrentWeekClick = () => {
    const d = new Date();
    const day = d.getDay();
    if (day === 0) d.setDate(d.getDate() + 1);
    else if (day === 6) d.setDate(d.getDate() + 2);

    const newDay = d.getDay();
    const diff = d.getDate() - newDay + (newDay === 0 ? -6 : 1);
    setCurrentWeekStart(new Date(d.setDate(diff)));
  };

  const handleManagerClick = async () => {
    if (navigator.vibrate) navigator.vibrate(50);

    if (isManagerMode) {
      try {
        const { error } = await supabaseClient
          .from('classroom_schedules')
          .upsert({
            id: appId,
            data: schedule,
            memo: memo,
            updated_at: new Date().toISOString()
          });

        if (error) {
          if (error.code === '42P01' || error.code === 'PGRST205' || (error.message && error.message.includes('classroom_schedules'))) {
            setSupabaseTableMissing(true);
          }
          throw error;
        }

        setSaveErrorMsg("");
        setSupabaseTableMissing(false);
      } catch (error) {
        console.error("⚠️ 데이터 저장 오류:", error);
        setSaveErrorMsg(`⚠️ 저장 실패: 슈파베이스 권한이나 테이블 설정이 잘못되었습니다. (${error.message})`);
        return;
      }
      setIsManagerMode(false);
    }
    else { setShowPwdModal(true); setPwdInput(""); setPwdError(false); }
  };

  const checkPassword = () => {
    if (pwdInput === import.meta.env.VITE_ADMIN_PASSWORD) { setIsManagerMode(true); setShowPwdModal(false); }
    else setPwdError(true);
  };

  const currentDays = getCurrentWeekDays();
  const startMonth = currentDays[0].getMonth() + 1;
  const startDay = currentDays[0].getDate();
  const endMonth = currentDays[4].getMonth() + 1;
  const endDay = currentDays[4].getDate();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-transparent font-sans text-gray-800">
      <div className="shrink-0 bg-blue-600 text-white px-4 pt-4 pb-7 shadow-md z-20 relative flex items-start justify-center min-h-[96px]">
        <h1 className="text-lg md:text-xl font-bold flex items-center gap-2 mt-1">
          <LucideCalendar className="w-6 h-6 md:w-8 md:h-8" /> 지하1층 공간 사용 현황
        </h1>
        <div className="absolute left-1/2 bottom-1.5 transform -translate-x-1/2 z-50">
          <button onClick={handleManagerClick} className={`px-6 py-1.5 md:px-10 md:py-2 rounded-lg border border-blue-900 font-bold transition-all active:scale-90 text-sm md:text-base touch-manipulation ${isManagerMode ? 'bg-white text-blue-800 shadow' : 'bg-blue-800 text-white hover:bg-blue-900 shadow-md'}`}>
            {isManagerMode ? '저장/담당자 모드 종료' : '담당자 로그인'}
          </button>
        </div>
        <button onClick={onNavigateBack} className="absolute right-4 top-3 text-xs flex flex-col items-center font-bold p-2 rounded-lg shadow-md transition-all touch-manipulation bg-blue-800 text-white opacity-90 active:scale-95">
          <Home className="w-5 h-5 mb-1" /> 처음으로
        </button>
      </div>

      <div className="flex-1 flex flex-col p-3 md:p-8 pb-10">
        <div className="max-w-5xl w-full mx-auto bg-white rounded-xl shadow-lg overflow-hidden border flex flex-col">
          <div className="shrink-0 z-10 bg-white px-4 pt-4 pb-2 md:px-6 md:pt-6 md:pb-3 shadow-sm relative">
            <div className="bg-white rounded-xl p-3 md:p-4 border border-gray-200 flex flex-col items-center shadow-sm">
              {saveErrorMsg && (
                <div className="w-full mb-3 p-3 bg-red-100 text-red-700 font-bold rounded-lg border border-red-300 text-[14px] md:text-sm text-center">
                  🚨 {saveErrorMsg}
                </div>
              )}

              {supabaseTableMissing && (
                <div className="w-full mb-4 p-4 bg-amber-50 text-amber-900 rounded-xl border border-amber-300 shadow-sm text-xs sm:text-sm flex flex-col gap-2 text-left">
                  <div className="flex items-center gap-2 font-bold text-amber-800 text-[14px] sm:text-base">
                    ⚠️ 슈파베이스(Supabase) 테이블 생성이 필요합니다!
                  </div>
                  <p className="leading-relaxed">
                    평생교육실 예약 데이터를 Supabase에 완전히 이전하여 활성화하려면 아래 SQL 쿼리를 복사하여 <b>Supabase Dashboard ➡️ SQL Editor</b>에 붙여넣고 실행(Run)해 주세요.
                  </p>
                  <pre className="bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto font-mono text-[10px] sm:text-xs max-h-40 border border-gray-800 select-all">
                    {`CREATE TABLE IF NOT EXISTS public.classroom_schedules (
    id text NOT NULL DEFAULT 'default-app-id'::text,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    memo text NOT NULL DEFAULT ''::text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT classroom_schedules_pkey PRIMARY KEY (id)
);

ALTER TABLE public.classroom_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON public.classroom_schedules FOR SELECT USING (true);
CREATE POLICY "Allow public all access" ON public.classroom_schedules FOR ALL USING (true) WITH CHECK (true);`}
                  </pre>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`CREATE TABLE IF NOT EXISTS public.classroom_schedules (
    id text NOT NULL DEFAULT 'default-app-id'::text,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    memo text NOT NULL DEFAULT ''::text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT classroom_schedules_pkey PRIMARY KEY (id)
);

ALTER TABLE public.classroom_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON public.classroom_schedules FOR SELECT USING (true);
CREATE POLICY "Allow public all access" ON public.classroom_schedules FOR ALL USING (true) WITH CHECK (true);`);
                      alert("SQL 쿼리가 클립보드에 복사되었습니다!");
                    }}
                    className="bg-amber-600 text-white font-bold py-1.5 px-4 rounded-lg hover:bg-amber-700 active:scale-95 transition-all self-start text-xs shadow-sm"
                  >
                    SQL 쿼리 복사하기
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1.5 sm:gap-2 w-full max-w-md mx-auto mb-2">
                <button onClick={() => changeWeek(-1)} className="w-10 sm:w-12 h-10 sm:h-12 flex items-center justify-center border-[1.5px] border-gray-300 rounded-xl bg-white shadow-sm hover:bg-gray-50 active:bg-gray-100 active:scale-95 touch-manipulation text-gray-700 shrink-0 transition-all">
                  <svg className="w-6 h-6 sm:w-7 sm:h-7" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" /></svg>
                </button>
                <div className="flex-1 h-10 sm:h-12 flex items-center justify-center border-[1.5px] border-blue-400 rounded-xl bg-[#f0f7ff] text-center shadow-sm overflow-hidden px-1 transition-all">
                  <h2 className="font-extrabold text-[#1e3a8a] text-[16px] min-[360px]:text-[18px] sm:text-[20px] tracking-tighter whitespace-nowrap text-center -translate-y-[1px]">{startMonth}/{startDay} ~ {endMonth}/{endDay}</h2>
                </div>
                <button onClick={handleCurrentWeekClick} className="text-[13px] sm:text-[15px] px-3 sm:px-4 h-10 sm:h-12 border border-blue-600 rounded-xl font-bold bg-blue-600 text-white shadow-sm flex items-center justify-center hover:bg-blue-700 active:bg-blue-800 active:scale-95 touch-manipulation whitespace-nowrap shrink-0 transition-all">이번 주</button>
                <button onClick={() => changeWeek(1)} className="w-10 sm:w-12 h-10 sm:h-12 flex items-center justify-center border-[1.5px] border-gray-300 rounded-xl bg-white shadow-sm hover:bg-gray-50 active:bg-gray-100 active:scale-95 touch-manipulation text-gray-700 shrink-0 transition-all">
                  <svg className="w-6 h-6 sm:w-7 sm:h-7" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" /></svg>
                </button>
              </div>
              <p className="text-[14px] landscape:text-xl md:text-2xl text-gray-600 text-center mt-2 font-medium">
                각 셀을 클릭하면 사용 가능한 장소를 변경가능합니다.
              </p>
            </div>
          </div>

          <div
            className="flex-1 px-2 min-[360px]:px-4 pb-4 pt-2 md:px-6 md:pb-6 md:pt-3 bg-gray-50/30"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="border-2 border-gray-400 rounded-lg shadow-sm overflow-hidden">
              <table className="w-full table-fixed text-center border-collapse">
                <thead>
                  <tr className="bg-sky-100 border-b-2 border-gray-400">
                    <th
                      onClick={toggleAll}
                      title={isManagerMode ? "클릭 시 이번 주 전체 선택/해제" : ""}
                      className={`pt-1 pb-1.5 px-0 border-r border-gray-400 font-extrabold text-gray-700 w-[14%] sm:w-28 select-none text-[11px] min-[360px]:text-[13px] landscape:text-[21px] md:text-[23px] leading-tight touch-manipulation ${isManagerMode ? 'cursor-pointer hover:bg-sky-200' : ''}`}
                    >
                      <span>시간</span><br /><span>날짜</span>
                    </th>
                    {currentDays.map((day, i) => {
                      const dateStr = formatDateString(day);
                      const isToday = dateStr === adjustedTodayStr;
                      return (
                        <th
                          key={i}
                          onClick={() => toggleWholeDay(dateStr)}
                          title={isManagerMode ? "클릭 시 해당 요일 전체 선택/해제" : ""}
                          className={`pt-0.5 pb-1.5 px-0 font-extrabold text-gray-900 select-none text-[11px] min-[360px]:text-[13px] landscape:text-[21px] md:text-[23px] leading-tight touch-manipulation tracking-tighter sm:tracking-normal ${isManagerMode ? 'cursor-pointer hover:bg-sky-200' : ''} ${isToday ? 'border-x-[4px] sm:border-x-[6px] border-t-[4px] sm:border-t-[6px] border-red-500 relative z-10' : 'border-r border-gray-400'}`}
                        >
                          {day.getMonth() + 1}/{day.getDate()}<br className="block md:hidden" /> ({weekDays[i]})
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {timeSlots.map((time, ti) => (
                    <tr key={ti} className={`${ti === 2 ? 'border-b-[3px] border-gray-500' : 'border-b border-gray-400 last:border-0'}`}>
                      <td
                        onClick={() => toggleWholeWeek(time)}
                        title={isManagerMode ? "클릭 시 해당 시간대 전체 요일 선택/해제" : ""}
                        className={`p-0.5 sm:p-1.5 bg-sky-100 border-r border-gray-400 font-bold select-none text-[10px] min-[360px]:text-[11px] landscape:text-[21px] md:text-[23px] tracking-tighter sm:tracking-normal touch-manipulation ${ti >= 3 ? 'text-orange-600' : 'text-blue-700'} ${isManagerMode ? 'cursor-pointer hover:bg-sky-200' : ''}`}
                      >
                        <div className="block sm:hidden leading-none">{time.split(' - ')[0]}<br />~<br />{time.split(' - ')[1]}</div>
                        <div className="hidden sm:block">{time}</div>
                      </td>
                      {currentDays.map((day, di) => {
                        const dateStr = formatDateString(day);
                        const key = getScheduleKey(dateStr, time);
                        const state = schedule[key];
                        const isToday = dateStr === adjustedTodayStr;
                        const isLastRow = ti === timeSlots.length - 1;

                        const mmdd = dateStr.substring(5);
                        const isSystemHoliday = holidayDates.has(mmdd);

                        const cellBg = isSystemHoliday ? 'bg-red-50' : (state === '평생교육실' ? 'bg-green-200' : state === '낭만스튜디오' ? 'bg-blue-600' : state === '평생교육실/낭만스튜디오' ? 'bg-purple-200' : 'bg-white');
                        const textCol = isSystemHoliday ? 'text-red-700' : (state === '평생교육실' ? 'text-green-900' : state === '낭만스튜디오' ? 'text-white' : state === '평생교육실/낭만스튜디오' ? 'text-purple-900' : 'text-gray-500');
                        const cellPadding = isSystemHoliday ? 'p-0.5 sm:p-2' : (state === '평생교육실/낭만스튜디오' ? 'p-0 sm:p-0.5' : (state === '낭만스튜디오' ? 'px-0 py-1' : 'p-0.5 sm:p-2'));

                        let cellContent = null;
                        if (isSystemHoliday) {
                          if (ti === 0) {
                            const hInfo = holidayDates.get(mmdd);
                            cellContent = (
                              <div className="flex flex-col items-center justify-center leading-tight">
                                <span className="font-extrabold text-red-600 text-[11px] min-[360px]:text-[12px] landscape:text-[20px] md:text-[22px] whitespace-nowrap">{hInfo.name}</span>
                                {hInfo.content1 && <span className="text-red-500/80 font-bold text-[9px] min-[360px]:text-[10px] landscape:text-[16px] md:text-[17px] mt-0.5 whitespace-nowrap">{hInfo.content1}</span>}
                                {hInfo.content2 && <span className="text-red-500/80 font-bold text-[9px] min-[360px]:text-[10px] landscape:text-[16px] md:text-[17px] mt-0.5 whitespace-nowrap">{hInfo.content2}</span>}
                              </div>
                            );
                          } else {
                            cellContent = null;
                          }
                        } else if (state === '평생교육실') {
                          cellContent = <>평생<br />교육실</>;
                        } else if (state === '낭만스튜디오') {
                          cellContent = <span className="block whitespace-nowrap -mx-1 tracking-tighter" style={{ letterSpacing: '-1px' }}>낭만<br /><span className="text-[9px] min-[360px]:text-[10px] landscape:text-[17px] md:text-[18px]">스튜디오</span></span>;
                        } else if (state === '평생교육실/낭만스튜디오') {
                          cellContent = <span className="block whitespace-nowrap -mx-2 tracking-tighter text-[11px] min-[360px]:text-[12px] landscape:text-[20px] md:text-[22px] font-bold" style={{ letterSpacing: '-1.8px', lineHeight: '1.25' }}>평생교육실/<br />낭만스튜디오</span>;
                        } else {
                          cellContent = null; // '   ' 또는 빈 칸
                        }

                        return (
                          <td key={di} onClick={() => { if (isSystemHoliday) return; toggleAvailability(dateStr, time); }}
                            className={`${cellPadding} transition-all h-10 min-[360px]:h-12 md:h-16 touch-manipulation ${(isManagerMode && !isSystemHoliday) ? 'cursor-pointer hover:brightness-95 active:scale-95' : 'cursor-default'} ${cellBg} ${isToday ? (isLastRow ? 'border-x-[4px] sm:border-x-[6px] border-b-[4px] sm:border-b-[6px] border-red-500 relative z-10' : 'border-x-[4px] sm:border-x-[6px] border-red-500 relative z-10') : 'border-r border-gray-400'}`}>
                            <span className={`text-[12px] min-[360px]:text-[13px] landscape:text-[22px] md:text-[24px] leading-tight inline-block font-semibold ${textCol}`}>
                              {cellContent}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 bg-gray-100 p-4 rounded-xl border border-gray-200 shadow-inner">
              <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2 text-sm landscape:text-[20px] md:text-[22px]">📢 공지 및 메모</h3>
              <textarea
                value={memo}
                onChange={(e) => {
                  if (!isManagerMode) return;
                  setMemo(e.target.value);
                  setIsTyping(true);
                  isTypingRef.current = true;
                }}
                readOnly={!isManagerMode}
                placeholder={isManagerMode ? "모든 선생님 화면에 실시간으로 보입니다." : "담당자 모드에서만 작성 가능합니다."}
                className={`w-full p-3 md:p-4 border rounded-xl font-bold h-24 md:h-32 outline-none transition-all text-sm landscape:text-[20px] md:text-[22px] text-black bg-white ${isManagerMode ? 'border-blue-300' : 'border-gray-300'}`}
              />
              {isTyping && <div className="text-[10px] text-blue-500 mt-1 font-bold animate-pulse text-right">자동 저장 중...</div>}
            </div>
          </div>
        </div>
      </div>

      {showPwdModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">담당자 암호</h3>
            <input ref={pwdInputRef} autoFocus type="password" value={pwdInput} onChange={(e) => { const val = e.target.value; setPwdInput(val); if (val === import.meta.env.VITE_ADMIN_PASSWORD) { setIsManagerMode(true); setShowPwdModal(false); } }} onKeyDown={(e) => e.key === 'Enter' && checkPassword()} className="w-full border-2 p-3 rounded-lg mb-4 text-center text-2xl tracking-widest outline-none focus:border-blue-500" placeholder="••••" />
            {pwdError && <p className="text-red-500 text-xs text-center mb-4">비밀번호가 틀렸습니다.</p>}
            <div className="flex gap-2">
              <button onClick={() => setShowPwdModal(false)} className="flex-1 py-3 bg-gray-100 rounded-lg font-bold touch-manipulation">취소</button>
              <button onClick={checkPassword} className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold touch-manipulation">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
