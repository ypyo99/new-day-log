import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabaseClient } from '../utils/supabase';
import {
  getSavedItem,
  setSavedItem,
  getSessionItem,
  setSessionItem,
  getInitialWeekday,
  getLocalDateString,
  formatStatusIfDate,
  getDirectImageUrl,
  teamList,
  formatTeacherRow,
  setGlobalTeachersList,
  getTeamTeacherNames,
  getTeacherSortWeight,
  getTeacherGroup,
  getTeamDefaultShifts,
  getDayName
} from '../utils/helpers';
import {
  User,
  MainCalendarIcon,
  CalendarIcon,
  Clock,
  Home,
  SaveIcon,
  EditIcon,
  RefreshCw,
  CalendarClockIcon,
  CalendarDaysIcon,
  UsersIcon,
  PresentationIcon,
  LucideCalendar,
  VintageDivider
} from './Icons';
import SignaturePad from './SignaturePad';

const AnimatedRefreshButton = ({ onClick, isFetching }) => {
  const [toggle, setToggle] = useState(false);
  useEffect(() => {
    const interval = setInterval(() => setToggle(prev => !prev), 2000);
    return () => clearInterval(interval);
  }, []);
  return (
    <button
      onClick={onClick}
      disabled={isFetching}
      className="w-[80px] sm:w-[88px] md:w-[98px] h-[48px] sm:h-[56px] md:h-[64px] shrink-0 bg-white border-2 border-sky-300 hover:bg-sky-50 text-sky-700 font-bold rounded-xl shadow-md flex flex-col items-center justify-center transition-all disabled:opacity-50 active:scale-95 px-1 touch-manipulation"
      title="선생님 목록 다시 읽어오기"
    >
      <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 mb-0.5 ${isFetching ? 'animate-spin' : ''}`} />
      <span className="text-[16px] sm:text-[18px] md:text-[20px] tracking-tight whitespace-nowrap">{toggle ? '선생님목록' : '다시읽기'}</span>
    </button>
  );
};

export default function MainApp({
  onNavigateToClassroom,
  onNavigateToDailySchedule,
  onNavigateToStudentSearch,
  onNavigateToMyWeeklySchedule,
  onNavigateToTeamSchedule,
  onNavigateToTeacherManagement,
  onNavigateToAutoSchedule,
  onNavigateToHolidayManagement
}) {
  const [selectedTeam, setSelectedTeam] = useState(() => getSavedItem('sungdong_team', ""));
  const [currentUser, setCurrentUser] = useState(() => getSavedItem('sungdong_teacher', ""));
  const [date, setDate] = useState(() => getInitialWeekday());
  const [isLoggedIn, setIsLoggedIn] = useState(() => getSessionItem('sungdong_is_logged_in', "") === 'true');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [teachers, setTeachers] = useState([]);
  const [allScheduleData, setAllScheduleData] = useState({});
  const [isFetchingTeachers, setIsFetchingTeachers] = useState(false);
  const [isFetchingSchedule, setIsFetchingSchedule] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isDataLoading = isFetchingSchedule || isSyncing || isSubmitting;
  const [specialAlerts, setSpecialAlerts] = useState([]);
  const [studentCounts, setStudentCounts] = useState({});
  const [records, setRecords] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [showSavePopup, setShowSavePopup] = useState(false);
  const [showValidationError, setShowValidationError] = useState(false);
  const [validationErrorMsg, setValidationErrorMsg] = useState("");
  const [validationErrorIndex, setValidationErrorIndex] = useState(null);
  const [validationErrorType, setValidationErrorType] = useState(""); // 에러 유형 (attendance, signature, headcount 등)

  const [saveProgress, setSaveProgress] = useState([]);
  const [isSaveComplete, setIsSaveComplete] = useState(false);

  const [showRepeatConfirm, setShowRepeatConfirm] = useState(false);
  const [repeatTargetDates, setRepeatTargetDates] = useState([]);

  const [selectedStudentDates, setSelectedStudentDates] = useState(null);
  const [shifts, setShifts] = useState(["9:30~10:30", "10:30~11:30", "11:30~12:30"]);

  const [dbTeachers, setDbTeachers] = useState(() => {
    try {
      const stored = window.localStorage.getItem('sungdong_teacher_list');
      return stored ? JSON.parse(stored) : [];
    } catch (e) { return []; }
  });

  const [holidaysDbList, setHolidaysDbList] = useState([]);

  useEffect(() => {
    const loadHolidays = async () => {
      try {
        const { data, error } = await supabaseClient.from('holidays').select('date');
        if (data && !error) {
          setHolidaysDbList(data.map(d => d.date));
        }
      } catch (e) { console.error("holidays fetch error", e); }
    };
    loadHolidays();
  }, []);

  useEffect(() => {
    const fetchDbTeachers = async () => {
      try {
        const { data, error } = await supabaseClient.from('teachers').select('*');
        if (!error && data) {
          const formatted = data.map(formatTeacherRow);
          setDbTeachers(formatted);
          setGlobalTeachersList(formatted);
        }
      } catch (e) { }
    };
    fetchDbTeachers();
  }, []);

  useEffect(() => {
    let customShifts = null;
    if (dbTeachers.length > 0 && currentUser) {
      const found = dbTeachers.find(t => t.team === selectedTeam && t.name === currentUser);
      if (found && (found.shift1 || found.shift2 || found.shift3)) {
        customShifts = [found.shift1, found.shift2, found.shift3].filter(Boolean);
      }
    }

    if (customShifts && customShifts.length > 0) {
      setShifts(customShifts);
      return;
    }

    if (!allScheduleData || Object.keys(allScheduleData).length === 0) {
      setShifts(getTeamDefaultShifts(selectedTeam, dbTeachers));
      return;
    }
    const extracted = new Set();
    Object.values(allScheduleData).forEach(day => {
      Object.keys(day).forEach(s => { if (s && s.trim() !== "") extracted.add(s); });
    });
    if (extracted.size > 0) {
      const sorted = Array.from(extracted).sort((a, b) => {
        const getT = (s) => {
          const m = s.match(/(\d+):(\d+)/);
          return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
        };
        return getT(a) - getT(b);
      });
      setShifts(sorted);
    }
  }, [allScheduleData, selectedTeam, currentUser, dbTeachers]);

  const [hiddenLogs, setHiddenLogs] = useState({});
  const toggleHideLog = (index) => {
    setHiddenLogs(prev => ({ ...prev, [index]: !prev[index] }));
  };

  useEffect(() => {
    setHiddenLogs({});
  }, [date]);

  const lastTagClickRef = useRef({ time: 0, index: -1, sIdx: -1, tag: '' });

  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const mainTouchStartX = useRef(null);
  const mainTouchStartY = useRef(null);
  const [pullDistance, setPullDistance] = useState(0);

  const isLoginReady = currentUser && currentUser.trim() !== "" && teachers.includes(currentUser) && !isFetchingTeachers && !isFetchingSchedule;

  useEffect(() => {
    document.documentElement.style.overscrollBehaviorY = 'none';
    document.body.style.overscrollBehaviorY = 'none';
    return () => {
      document.documentElement.style.overscrollBehaviorY = 'auto';
      document.body.style.overscrollBehaviorY = 'auto';
    };
  }, [isLoggedIn]);

  useEffect(() => { setSavedItem('sungdong_team', selectedTeam); }, [selectedTeam]);
  useEffect(() => { setSavedItem('sungdong_teacher', currentUser); }, [currentUser]);
  useEffect(() => { setSessionItem('sungdong_is_logged_in', isLoggedIn ? 'true' : ''); }, [isLoggedIn]);

  useEffect(() => {
    if (selectedTeam === "1팀" && currentUser) {
      const clean = currentUser.replace(/\s/g, "");
      if (clean === "천은선" || clean === "서승희" || clean === "천은선서승희") {
        setCurrentUser("");
        window.localStorage.removeItem('sungdong_teacher');
      }
    }
  }, [selectedTeam, currentUser]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isSubmitting) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    const handlePopState = (e) => {
      if (isSubmitting) {
        window.history.pushState(null, null, window.location.href);
        alert("데이터 저장 중입니다.\n안전한 저장을 위해 잠시만 기다려주세요.");
      }
    };

    if (isSubmitting) {
      window.addEventListener('beforeunload', handleBeforeUnload);
      window.history.pushState(null, null, window.location.href);
      window.addEventListener('popstate', handlePopState);
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isSubmitting]);

  const [logs, setLogs] = useState({
    0: { student: "", status: "", location: "", selectedTags: [[]], memo: "", headcount: "" },
    1: { student: "", status: "", location: "", selectedTags: [[]], memo: "", headcount: "" },
    2: { student: "", status: "", location: "", selectedTags: [[]], memo: "", headcount: "" },
    3: { student: "", status: "", location: "", selectedTags: [[]], memo: "", headcount: "" },
    4: { student: "", status: "", location: "", selectedTags: [[]], memo: "", headcount: "" },
    5: { student: "", status: "", location: "", selectedTags: [[]], memo: "", headcount: "" }
  });

  const ATTENDANCE_TAGS = ['1', '결석', '취소', '선생님휴가'];
  const RENDER_TAGS = ['1', '결석', '취소', '선생님휴가'];

  const fetchTeachersFromSheet = async (team) => {
    setIsFetchingTeachers(true);
    try {
      const { data, error } = await supabaseClient
        .from('daily_logs')
        .select('teacher')
        .eq('team', team);

      if (error) throw error;

      let fetchedTeachers = [];
      const teacherSet = new Set();

      if (dbTeachers.length > 0) {
        dbTeachers.filter(t => t.team === team).forEach(t => {
          if (team === "1팀") {
            const clean = (t.name || "").replace(/\s/g, "");
            if (clean === "천은선" || clean === "서승희" || clean === "천은선서승희") return;
          }
          teacherSet.add(t.name);
        });
      }

      if (data && data.length > 0) {
        data.forEach(row => {
          if (row.teacher) {
            if (team === "1팀") {
              const clean = (row.teacher || "").replace(/\s/g, "");
              if (clean === "천은선" || clean === "서승희" || clean === "천은선서승희") return;
            }
            teacherSet.add(row.teacher);
          }
        });
      }

      fetchedTeachers = Array.from(teacherSet).sort((a, b) => {
        const tA = dbTeachers.find(t => t.team === team && t.name === a);
        const tB = dbTeachers.find(t => t.team === team && t.name === b);
        const seqA = tA && tA.seq_num !== '' && tA.seq_num !== null ? parseInt(tA.seq_num, 10) : 999;
        const seqB = tB && tB.seq_num !== '' && tB.seq_num !== null ? parseInt(tB.seq_num, 10) : 999;
        if (seqA !== seqB) return seqA - seqB;
        return getTeacherSortWeight(team, a) - getTeacherSortWeight(team, b);
      });

      if (fetchedTeachers.length === 0) {
        fetchedTeachers = ["이름입력(직접타이핑)"];
      }
      setTeachers(fetchedTeachers);
      window.localStorage.setItem(`sungdong_teachers_${team}`, JSON.stringify(fetchedTeachers));
    } catch (error) {
      console.error("⚠️ 선생님 목록 로딩 에러:", error);
    } finally {
      setIsFetchingTeachers(false);
    }
  };

  useEffect(() => {
    if (!selectedTeam) { setTeachers([]); setCurrentUser(""); return; }
    const cachedTeachers = window.localStorage.getItem(`sungdong_teachers_${selectedTeam}`);
    if (cachedTeachers) {
      try {
        const parsed = JSON.parse(cachedTeachers);
        const dbNames = dbTeachers.filter(t => t.team === selectedTeam).map(t => t.name);
        const hasDefaultTeacher = parsed && dbNames.length > 0 && parsed.some(t => dbNames.includes(t));
        if (parsed && parsed.length > 0 && hasDefaultTeacher) {
          let filteredParsed = parsed;
          if (selectedTeam === "1팀") {
            filteredParsed = parsed.filter(t => {
              const clean = (t || "").replace(/\s/g, "");
              return clean !== "천은선" && clean !== "서승희" && clean !== "천은선서승희";
            });
          }
          const teacherSet = new Set(filteredParsed);
          const currentDbNames = dbTeachers.filter(t => t.team === selectedTeam).map(t => t.name);
          currentDbNames.forEach(name => {
            if (selectedTeam === "1팀") {
              const clean = (name || "").replace(/\s/g, "");
              if (clean === "천은선" || clean === "서승희" || clean === "천은선서승희") return;
            }
            teacherSet.add(name);
          });

          const merged = Array.from(teacherSet);
          const sortedCached = merged.sort((a, b) => {
            const tA = dbTeachers.find(t => t.team === selectedTeam && t.name === a);
            const tB = dbTeachers.find(t => t.team === selectedTeam && t.name === b);
            const seqA = tA && tA.seq_num !== '' && tA.seq_num !== null ? parseInt(tA.seq_num, 10) : 999;
            const seqB = tB && tB.seq_num !== '' && tB.seq_num !== null ? parseInt(tB.seq_num, 10) : 999;
            if (seqA !== seqB) return seqA - seqB;
            return getTeacherSortWeight(selectedTeam, a) - getTeacherSortWeight(selectedTeam, b);
          });
          setTeachers(sortedCached);
          return;
        }
      } catch (e) { }
    }
    fetchTeachersFromSheet(selectedTeam);
  }, [selectedTeam, dbTeachers]);

  useEffect(() => {
    if (!selectedTeam || !currentUser) { setAllScheduleData({}); return; }

    let isMounted = true;

    const cacheKey = `sungdong_schedule_${selectedTeam}_${currentUser}`;
    const cachedSchedule = window.localStorage.getItem(cacheKey);
    if (cachedSchedule) {
      try {
        setAllScheduleData(JSON.parse(cachedSchedule));
      } catch (e) { }
    }

    const fetchScheduleAll = async () => {
      if (isMounted) setIsSyncing(true);
      if (isMounted && !cachedSchedule) setIsFetchingSchedule(true);
      try {
        let query = supabaseClient.from('daily_logs').select('*').eq('team', selectedTeam);
        if (currentUser !== "__ALL__") query = query.eq('teacher', currentUser);

        const { data: records, error } = await query;
        if (error) throw error;

        const scheduleData = {};
        if (records) {
          records.forEach(row => {
            if (!scheduleData[row.log_date]) scheduleData[row.log_date] = {};
            scheduleData[row.log_date][row.shift] = {
              student: row.student || "",
              location: row.signature_url || row.location || "",
              status: row.status || ""
            };
          });
        }
        if (isMounted) {
          setAllScheduleData(scheduleData);
          window.localStorage.setItem(cacheKey, JSON.stringify(scheduleData));
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (isMounted) {
          setIsFetchingSchedule(false);
          setIsSyncing(false);
        }
      }
    };
    fetchScheduleAll();

    return () => { isMounted = false; };
  }, [selectedTeam, currentUser, refreshTrigger]);

  useEffect(() => {
    const todaysData = allScheduleData[date] || {};

    setLogs(prevLogs => {
      const newLogs = { ...prevLogs };
      shifts.forEach((shift, index) => {
        const fetchedData = todaysData[shift] || {};
        const statusStr = formatStatusIfDate(fetchedData.status) || "";

        let loadedStudent = (fetchedData.student === undefined || fetchedData.student === null) ? "" : fetchedData.student;
        let loadedLocation = (fetchedData.location === undefined || fetchedData.location === null) ? "" : fetchedData.location;

        const isShowHeadcount = loadedStudent.includes("보조강사") || loadedStudent.includes("경로당") || loadedLocation.includes("경로당");

        let loadedTags = [[]];
        let memoParts = [];

        const rawParts = statusStr.split(',').map(s => s.trim()).filter(Boolean);
        const isKyungrodang = loadedStudent.includes("경로당") || loadedLocation.includes("경로당");

        let tagParts = [];
        let isMemoStarted = false;
        let loadedHeadcount = "";
        let startIndex = 0;

        if (isShowHeadcount && rawParts.length > 0 && /^\d{1,2}$/.test(rawParts[0])) {
          loadedHeadcount = rawParts[0];
          startIndex = 1;
        }

        for (let i = startIndex; i < rawParts.length; i++) {
          const part = rawParts[i];
          if (!isMemoStarted) {
            const subParts = part.split('/').map(p => p.trim());
            const isAllTags = subParts.every(p => {
              if (p === "") return true;
              const spaceParts = p.split(/\s+/);
              return spaceParts.every(sp => ATTENDANCE_TAGS.includes(sp));
            });

            if (isAllTags) {
              tagParts.push(part);
            } else {
              isMemoStarted = true;
              memoParts.push(part);
            }
          } else {
            memoParts.push(part);
          }
        }

        if (isShowHeadcount && tagParts.length > 0 && !loadedHeadcount) {
          const lastTag = tagParts[tagParts.length - 1];
          if (/^\d{1,2}$/.test(lastTag)) {
            if (isKyungrodang || tagParts.length > 1) {
              tagParts.pop();
              memoParts.unshift(lastTag);
            }
          }
        }

        if (tagParts.length > 0) {
          const combinedTagStr = tagParts.join(',');
          const studentTagStrs = combinedTagStr.split('/');
          loadedTags = studentTagStrs.map(str =>
            str.split(/[,\s]+/).map(t => t.trim()).filter(t => ATTENDANCE_TAGS.includes(t))
          );
        }

        loadedTags = loadedTags.map(tags => tags.sort((a, b) => ATTENDANCE_TAGS.indexOf(a) - ATTENDANCE_TAGS.indexOf(b)));

        if (isShowHeadcount && memoParts.length > 0 && !loadedHeadcount) {
          if (/^\d{1,2}$/.test(memoParts[0].trim())) {
            loadedHeadcount = memoParts[0].trim();
            memoParts.shift();
          }
        }

        const loadedMemo = memoParts.join(', ');

        let finalMemo = loadedMemo;
        if (!finalMemo) {
          const backupKey = `log_backup_${selectedTeam}_${currentUser}_${date}_${index}`;
          const backup = window.localStorage.getItem(backupKey);
          if (backup) finalMemo = backup;
        }

        newLogs[index] = {
          student: loadedStudent,
          status: statusStr,
          location: loadedLocation,
          selectedTags: loadedTags,
          memo: finalMemo,
          headcount: loadedHeadcount
        };
      });
      return newLogs;
    });
  }, [date, allScheduleData, selectedTeam, currentUser, shifts]);

  useEffect(() => {
    if (!selectedTeam || !isLoggedIn) {
      setStudentCounts({});
      return;
    }

    let isMounted = true;
    const excludeKeywords = ["보조강사", "자체학습", "대상자발굴", "도선복지관", "소양교육", "간담회", "수업", "준비", "컴기초", "공휴일", "근로자의날", "근로자의 날", "삼일절", "3.1절", "어린이날", "현충일", "광복절", "개천절", "한글날", "석가탄신일", "부처님오신날", "성탄절", "제헌절", "추석", "설날", "신정", "대체공휴일", "지방선거일", "지방 선거일", "선거일"];

    const calcCounts = async () => {
      try {
        let allTeamRecords = [];
        let histFrom = 0;
        const histStep = 1000;
        let histHasMore = true;

        while (histHasMore) {
          const histTo = histFrom + histStep - 1;
          const { data: histData, error: histError } = await supabaseClient
            .from('daily_logs')
            .select('log_date, student, status')
            .eq('team', selectedTeam)
            .neq('student', '')
            .not('student', 'is', null)
            .lte('log_date', date)
            .order('log_date', { ascending: true })
            .range(histFrom, histTo);

          if (histError) throw histError;
          if (histData && histData.length > 0) {
            allTeamRecords = allTeamRecords.concat(histData);
            histHasMore = histData.length >= histStep;
            histFrom += histStep;
          } else {
            histHasMore = false;
          }
        }

        if (!isMounted) return;

        const studentDatesMap = {};
        allTeamRecords.forEach(hRow => {
          if (!hRow.student) return;
          const names = hRow.student.split(/[/,]/).map(s => s.trim().split('(')[0].trim()).filter(Boolean);
          names.forEach((name, nameIdx) => {
            if (excludeKeywords.some(kw => name.includes(kw))) return;
            let personalStatus = hRow.status || "";
            if (personalStatus.includes('/')) {
              const segments = personalStatus.split('/');
              if (segments.length > nameIdx) personalStatus = segments[nameIdx].trim();
            }
            const isAbsentOrCanceled = personalStatus.includes("결석") || personalStatus.includes("취소") || personalStatus.includes("선생님휴가");
            if (!isAbsentOrCanceled) {
              if (!studentDatesMap[name]) studentDatesMap[name] = [];
              const dParts = hRow.log_date.split('-');
              const dateObj = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10));
              const alreadyHas = studentDatesMap[name].some(d => d.getTime() === dateObj.getTime());
              if (!alreadyHas) studentDatesMap[name].push(dateObj);
            }
          });
        });

        const newCounts = {};
        shifts.forEach((shift, index) => {
          const log = logs[index];
          if (!log || !log.student) return;
          const names = log.student.split(/[/,]/).map(s => s.trim().split('(')[0].trim()).filter(Boolean);
          const countsForSlot = [];
          names.forEach(name => {
            if (excludeKeywords.some(kw => name.includes(kw))) return;
            const dates = studentDatesMap[name] || [];
            countsForSlot.push({ name, count: dates.length, dates });
          });
          if (countsForSlot.length > 0) newCounts[index] = countsForSlot;
        });

        if (isMounted) setStudentCounts(newCounts);
      } catch (e) {
        console.error("회차 계산 오류:", e);
      }
    };

    calcCounts();
    return () => { isMounted = false; };
  }, [date, selectedTeam, isLoggedIn, logs, shifts]);

  const buildStatusString = (log) => {
    let tagsStrings = [];
    const studentNames = (log.student || "").split(/[/,]/).map(s => s.trim()).filter(s => s.length > 0);
    const maxRows = Math.max(1, studentNames.length);

    for (let j = 0; j < maxRows; j++) {
      const tags = (log.selectedTags && log.selectedTags[j]) ? log.selectedTags[j] : [];
      const sorted = [...tags].sort((a, b) => ATTENDANCE_TAGS.indexOf(a) - ATTENDANCE_TAGS.indexOf(b));
      tagsStrings.push(sorted.length > 0 ? sorted.join(', ') : '');
    }

    let orderedTagsStr = "";
    if (tagsStrings.some(s => s.length > 0)) {
      orderedTagsStr = maxRows > 1 ? tagsStrings.join('/') : (tagsStrings[0] || "");
    }

    const isKyungrodang = (log.student || "").includes("경로당") || (log.location || "").includes("경로당");
    const isShowHeadcount = (log.student || "").includes("보조강사") || isKyungrodang;

    let result = [];
    if (isShowHeadcount && log.headcount) {
      result.push(log.headcount);
    }
    if (orderedTagsStr) {
      result.push(orderedTagsStr);
    }
    if (log.memo) {
      result.push(log.memo);
    }

    return result.join(', ');
  };

  const hasChanges = useMemo(() => {
    const todaysOriginalData = allScheduleData[date] || {};
    return shifts.some((shift, i) => {
      const log = logs[i];
      const original = todaysOriginalData[shift] || {};
      const originalStatus = formatStatusIfDate(original.status);
      const currentStatusStr = buildStatusString(log);

      const studentChanged = (log.student || "").trim() !== (original.student || "").trim();
      const locationChanged = (log.location || "").trim() !== (original.location || "").trim();
      const statusChanged = currentStatusStr !== originalStatus;

      return studentChanged || locationChanged || statusChanged;
    });
  }, [logs, allScheduleData, date, selectedTeam, shifts]);

  const isEmptySchedule = useMemo(() => {
    return Object.values(logs).every(log => !log.student?.trim() && !log.location?.trim());
  }, [logs]);

  const isMissingHeadcount = useMemo(() => {
    return false;
  }, []);

  const performAutoSave = async (forceIndex = null, signatureOverride = null) => {
    const todayStr = getLocalDateString(new Date());
    const isFutureDate = date > todayStr;
    const todaysOriginalData = allScheduleData[date] || {};

    const initialProgress = shifts.map((shiftTime, i) => {
      const log = logs[i];
      const original = todaysOriginalData[shiftTime] || {};
      const originalStatus = formatStatusIfDate(original.status);
      const currentStatusStr = buildStatusString(log);

      const isChanged = (i === forceIndex) || (log.student || "") !== (original.student || "") ||
        (log.location || "") !== (original.location || "") ||
        currentStatusStr !== originalStatus;

      let effectiveLocation = log.location || "";
      if (i === forceIndex) {
        if (signatureOverride === "__DELETE__") effectiveLocation = "";
        else if (signatureOverride && signatureOverride.startsWith("data:image")) effectiveLocation = signatureOverride;
      }

      const sNames = (log.student || "").split(/[/,]/).map(s => s.trim()).filter(s => s.length > 0);

      return {
        index: i,
        isRepeat: false,
        shift: shiftTime,
        student: log.student || "미입력",
        isDoubleHeight: sNames.length >= 2,
        location: effectiveLocation,
        attendance: currentStatusStr || "입력 없음",
        isChanged: isChanged,
        status: isChanged ? '대기 중' : '변경 없음'
      };
    });

    const changedIndices = initialProgress.filter(p => p.isChanged).map(p => p.index);

    if (changedIndices.length === 0) return true;

    for (let i of changedIndices) {
      const log = logs[i];
      if (!log) continue;

      const studentNames = (log.student || "").split(/[/,]/).map(s => s.trim()).filter(s => s.length > 0);
      const memo = (log.memo || "").trim();
      const targetNameForHeadcount = studentNames.find(name => name.includes("보조강사") || name.includes("경로당"));
      const hasAssistant = studentNames.some(name => name.includes("보조강사"));
      const isBalGul = studentNames.some(name => name.includes("대상자발굴"));

      const hc = (log.headcount || "").trim();
      const checkedCount = studentNames.filter((_, sIdx) => {
        const tags = (log.selectedTags && log.selectedTags[sIdx]) ? log.selectedTags[sIdx] : [];
        return tags.length > 0;
      }).length;
      const hasCheckedAttendance = (checkedCount > 0) || (targetNameForHeadcount && hc !== "");

      let currentLoc = (log.location || "").trim();
      if (i === forceIndex && signatureOverride) {
        if (signatureOverride === "__DELETE__") currentLoc = "";
        else if (signatureOverride.startsWith("data:image")) currentLoc = signatureOverride;
      }
      const isSignBlank = !currentLoc || (!currentLoc.startsWith('data:image') && !currentLoc.startsWith('http') && !currentLoc.includes('drive.google.com') && !currentLoc.startsWith('=IMAGE'));

      if (!isFutureDate && studentNames.length >= 2 && !hasAssistant && !isBalGul) {
        if (checkedCount > 0 && checkedCount < studentNames.length) {
          const displayNames = studentNames.join('/');
          setValidationErrorMsg(`${displayNames} 님의 출결 상태를 모두 체크해 주세요! (한 명만 체크할 수 없습니다.)`);
          setValidationErrorIndex(i);
          setValidationErrorType("attendance");
          setShowValidationError(true);
          return false;
        }
      }

      if (!isFutureDate && studentNames.length > 0 && !hasAssistant && !isBalGul && memo !== "") {
        if (!hasCheckedAttendance) {
          const displayNames = studentNames.join('/');
          const isKyungrodangEntry = displayNames.includes("경로당");
          const msg = isKyungrodangEntry
            ? `${displayNames} 님 참석인원 또는 출결사항을 확인해 주세요!`
            : `${displayNames} 님의 [출결 버튼]을 체크해 주세요!`;

          setValidationErrorMsg(msg);
          setValidationErrorIndex(i);
          setValidationErrorType("attendance");
          setShowValidationError(true);
          return false;
        }

        const anyUnchecked = studentNames.some((_, sIdx) => {
          const tags = (log.selectedTags && log.selectedTags[sIdx]) ? log.selectedTags[sIdx] : [];
          return tags.length === 0 && !(targetNameForHeadcount && hc !== "");
        });
        if (anyUnchecked) {
          const displayNames = studentNames.join('/');
          const isKyungrodangEntry = displayNames.includes("경로당");
          const msg = isKyungrodangEntry
            ? `${displayNames} 님 참석인원 또는 출결사항을 확인해 주세요!`
            : `${displayNames} 님의 [출결 버튼]을 체크해 주세요!`;

          setValidationErrorMsg(msg);
          setValidationErrorIndex(i);
          setValidationErrorType("attendance");
          setShowValidationError(true);
          return false;
        }
      }

      const isPresentChecked = studentNames.some((_, sIdx) => {
        const tags = (log.selectedTags && log.selectedTags[sIdx]) ? log.selectedTags[sIdx] : [];
        return tags.includes('1');
      });
      const needsSignature = isPresentChecked || (targetNameForHeadcount && hc !== "");

      if (!isFutureDate && selectedTeam === '취업팀' && needsSignature && studentNames.length > 0 && isSignBlank && !isBalGul) {
        const displayNames = studentNames.join('/');
        setValidationErrorMsg(`${displayNames} 님의 싸인을 작성해 주세요!`);
        setValidationErrorIndex(i);
        setValidationErrorType("signature");
        setShowValidationError(true);
        return false;
      }

      if (!isFutureDate && targetNameForHeadcount) {
        const hc = (log.headcount || "").trim();
        const isKyungrodangEntry = targetNameForHeadcount.includes("경로당");

        if (isKyungrodangEntry) {
          const isGyeolseok = studentNames.some((_, sIdx) => (log.selectedTags && log.selectedTags[sIdx]) ? log.selectedTags[sIdx].includes("결석") : false);
          const isVacation = studentNames.some((_, sIdx) => (log.selectedTags && log.selectedTags[sIdx]) ? log.selectedTags[sIdx].includes("선생님휴가") : false);
          const isCancel = studentNames.some((_, sIdx) => (log.selectedTags && log.selectedTags[sIdx]) ? log.selectedTags[sIdx].includes("취소") : false);

          if (!isGyeolseok && !isVacation && !isCancel && hc === "" && memo !== "") {
            setValidationErrorMsg(`${targetNameForHeadcount} 참석인원 또는 출결사항을 확인해 주세요!`);
            setValidationErrorIndex(i);
            setValidationErrorType("headcount");
            setShowValidationError(true);
            return false;
          }
        } else {
          const isAssistant = targetNameForHeadcount.includes("보조강사");
          const isMemoEmpty = memo === "";

          if (isAssistant && isMemoEmpty) {
            // 건너뜀
          } else {
            if (!/^\d+/.test(hc)) {
              setValidationErrorMsg(`${targetNameForHeadcount} 수업 내용이 있으면 왼쪽의 [인원] 입력란에 참석인원을 입력해야 합니다.`);
              setValidationErrorIndex(i);
              setValidationErrorType("headcount");
              setShowValidationError(true);
              return false;
            }
          }
        }
      }
    }

    const batchItems = changedIndices.map(i => {
      const shiftTime = shifts[i];
      const log = logs[i];
      const currentStatusStr = buildStatusString(log);

      let signatureData = null;
      let effectiveLocation = log.location || "";

      if (i === forceIndex) {
        if (signatureOverride === "__DELETE__") {
          signatureData = "__DELETE__";
          effectiveLocation = "";
        } else if (signatureOverride && signatureOverride.startsWith("data:image")) {
          signatureData = signatureOverride;
        }
      } else if (selectedTeam === '취업팀' && (log.location || "").startsWith('data:image')) {
        signatureData = log.location;
      }

      return {
        index: i,
        shift: shiftTime,
        student: log.student || "",
        location: effectiveLocation,
        status: currentStatusStr,
        signatureData: signatureData
      };
    });

    setSaveProgress(initialProgress);
    setIsSaveComplete(false);
    setShowSavePopup(true);
    setIsSubmitting(true);
    console.log("💾 배치 저장 시작 - 선택된 팀:", selectedTeam, "날짜:", date, "항목 수:", batchItems.length);

    let finalValidRecords = [];

    try {
      setSaveProgress(prev => prev.map(item => changedIndices.includes(item.index) ? { ...item, status: '저장 중...' } : item));

      const upsertData = [];

      for (let i = 0; i < batchItems.length; i++) {
        const item = batchItems[i];
        let signature_url = null;
        let location = item.location;

        if (selectedTeam.includes("취업팀") && location && location.startsWith("data:image")) {
          const base64Data = location.split(',')[1];
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let j = 0; j < byteCharacters.length; j++) {
            byteNumbers[j] = byteCharacters.charCodeAt(j);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'image/png' });

          const safeTeacher = Array.from(currentUser).map(c => c.charCodeAt(0).toString(16)).join('');
          const fileName = `${date}_${safeTeacher}_${item.shift.replace(/[^0-9]/g, "")}_${Date.now()}.png`;

          const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('signatures')
            .upload(fileName, blob, { contentType: 'image/png', upsert: true });

          if (uploadError) throw new Error("서명 업로드 실패: " + uploadError.message);

          const { data: publicUrlData } = supabaseClient.storage.from('signatures').getPublicUrl(fileName);
          signature_url = publicUrlData.publicUrl;
          location = signature_url;
        } else if (selectedTeam.includes("취업팀") && (!location || location === "__DELETE__")) {
          location = "";
          signature_url = null;
        }

        upsertData.push({
          team: selectedTeam,
          log_date: date,
          teacher: currentUser,
          shift: item.shift,
          student: item.student || "",
          location: signature_url ? "" : location || "",
          status: item.status || "",
          signature_url: signature_url
        });
      }

      const { error } = await supabaseClient
        .from('daily_logs')
        .upsert(upsertData, { onConflict: 'team, log_date, teacher, shift' });

      if (error) throw new Error("Supabase 저장 실패: " + error.message);

      const validRecords = batchItems.map(item => {
        const res = upsertData.find(r => r.shift === item.shift);
        const finalUrl = res ? (res.signature_url || res.location) : item.location;

        setLogs(prev => ({ ...prev, [item.index]: { ...prev[item.index], location: finalUrl } }));
        const backupKey = `log_backup_${selectedTeam}_${currentUser}_${date}_${item.index}`;
        window.localStorage.removeItem(backupKey);

        return {
          index: item.index,
          id: Date.now() + parseInt(item.index),
          team: selectedTeam,
          teacher: currentUser,
          date: date,
          shift: item.shift,
          student: item.student,
          location: finalUrl,
          status: item.status,
          submittedAt: new Date().toLocaleTimeString()
        };
      });

      finalValidRecords = validRecords;
      setSaveProgress(prev => prev.map(item => changedIndices.includes(item.index) ? { ...item, status: '저장 완료' } : item));
    } catch (e) {
      console.error("❌ 배치 저장 실패:", e);
      setErrorMessage("⚠️ 저장 중 오류가 발생했습니다: " + e.message);
      setSaveProgress(prev => prev.map(item => changedIndices.includes(item.index) ? { ...item, status: '저장 실패' } : item));
      setTimeout(() => setErrorMessage(""), 5000);
    }

    if (finalValidRecords.length > 0) {
      setRecords(prev => [...finalValidRecords.reverse(), ...prev]);
      setAllScheduleData(prev => {
        const newData = { ...prev };
        if (!newData[date]) newData[date] = {};
        finalValidRecords.forEach(record => {
          newData[date][record.shift] = {
            ...logs[record.index],
            location: record.location,
            status: record.status
          };
        });
        return newData;
      });
    }

    setIsSubmitting(false);
    setIsSaveComplete(true);
    return true;
  };

  const handleInputBlur = () => {
    setTimeout(() => {
      window.scrollTo({ top: window.scrollY, behavior: 'instant' });
    }, 50);
  };

  const handleLogout = () => { setIsLoggedIn(false); setRecords([]); };
  const handleSubmit = async (e) => { e.preventDefault(); await performAutoSave(); };

  const getTagClass = (index, sIdx, tag) => {
    const isActive = logs[index]?.selectedTags && logs[index].selectedTags[sIdx] && logs[index].selectedTags[sIdx].includes(tag);
    if (!isActive) {
      return 'bg-white text-gray-700 font-bold border-[1.5px] border-gray-300 shadow-[0_2px_0_#9ca3af] active:shadow-[0_0px_0_#9ca3af] active:translate-y-[2px]';
    }
    const baseActiveStyle = 'text-white font-bold border-[1.5px] translate-y-[2px] shadow-[inset_0_3px_5px_rgba(0,0,0,0.5)]';
    if (tag === '결석') return `bg-red-400 border-red-500 ${baseActiveStyle}`;
    if (tag === '취소') return `bg-orange-350 border-orange-500 ${baseActiveStyle}`;
    if (tag === '선생님휴가') return `bg-gray-500 border-gray-600 ${baseActiveStyle}`;
    return `bg-blue-500 border-blue-700 ${baseActiveStyle}`;
  };

  const handleRepeatSchedule = () => {
    if (isDataLoading) return;
    const currentDayOfWeek = new Date(date).getDay();
    const targetDates = availableDates.filter(d => {
      if (d <= date || new Date(d).getDay() !== currentDayOfWeek) return false;
      const targetData = allScheduleData[d] || {};
      return Object.values(targetData).some(s => {
        const student = s?.student || "";
        const location = s?.location || "";
        if (!student.trim()) return false;
        const combinedText = student + location;
        return !combinedText.includes("공휴일") && !combinedText.includes("간담회") && !combinedText.includes("소양교육");
      });
    });

    if (targetDates.length === 0) {
      setErrorMessage("⚠️ 이후 동일한 요일의 날짜가 없습니다.");
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }

    const validTargetDates = targetDates.filter(targetDate => {
      const todaysOriginalData = allScheduleData[targetDate] || {};
      let hasDifference = false;
      shifts.forEach((shiftTime, i) => {
        const log = logs[i];
        const original = todaysOriginalData[shiftTime] || {};
        const isStudentDiff = (log.student || "") !== (original.student || "");
        const isLocationDiff = selectedTeam === '취업팀'
          ? (original.location || "") !== ""
          : (log.location || "") !== (original.location || "");
        if (isStudentDiff || isLocationDiff) {
          hasDifference = true;
        }
      });
      return hasDifference;
    });

    if (validTargetDates.length === 0) {
      setErrorMessage(<span className="text-lg">⚠️ 이미 동일한 일정이 등록되어 있습니다.</span>);
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }
    setRepeatTargetDates(validTargetDates);
    setShowRepeatConfirm(true);
  };

  const executeRepeatSchedule = async () => {
    setShowRepeatConfirm(false);
    setIsSubmitting(true);
    setShowSavePopup(true);
    setIsSaveComplete(false);

    let allTasks = [];

    repeatTargetDates.forEach((targetDate) => {
      const todaysOriginalData = allScheduleData[targetDate] || {};
      shifts.forEach((shiftTime, i) => {
        const log = logs[i];
        const original = todaysOriginalData[shiftTime] || {};
        const isStudentDiff = (log.student || "") !== (original.student || "");
        const isLocationDiff = selectedTeam === '취업팀'
          ? (original.location || "") !== ""
          : (log.location || "") !== (original.location || "");
        if (isStudentDiff || isLocationDiff) {
          allTasks.push({
            id: `${targetDate}_${i}`,
            date: targetDate,
            shift: shiftTime,
            student: log.student || "",
            location: selectedTeam === '취업팀' ? "" : (log.location || ""),
            statusStr: original.status || "",
            index: i
          });
        }
      });
    });

    if (allTasks.length === 0) {
      setSaveProgress([]);
      setIsSubmitting(false);
      setIsSaveComplete(true);
      setShowSavePopup(false);
      return;
    }

    setSaveProgress(allTasks.map(t => {
      const mm = t.date.substring(5, 7);
      const dd = t.date.substring(8, 10);
      const dayName = getDayName(t.date);
      return {
        id: t.id,
        isRepeat: true,
        dateDisplay: `${mm}/${dd}(${dayName})`,
        timeDisplay: t.shift,
        student: t.student || "미입력",
        status: '대기 중'
      };
    }));

    const validRecords = [];
    const chunkSize = 3;

    for (let idx = 0; idx < allTasks.length; idx += chunkSize) {
      const chunkTasks = allTasks.slice(idx, idx + chunkSize);
      const chunkPromises = chunkTasks.map(async (task, chunkIdx) => {
        if (chunkIdx > 0) await new Promise(res => setTimeout(res, chunkIdx * 150));

        let location = task.location;
        let signature_url = null;

        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            setSaveProgress(prev => prev.map(item => item.id === task.id ? { ...item, status: attempt === 1 ? '저장 중...' : `재시도 중...(${attempt}/5)` } : item));

            if (selectedTeam.includes('취업팀') && location && location.startsWith('data:image')) {
              const base64Data = location.split(',')[1];
              const byteCharacters = atob(base64Data);
              const byteNumbers = new Array(byteCharacters.length);
              for (let j = 0; j < byteCharacters.length; j++) {
                byteNumbers[j] = byteCharacters.charCodeAt(j);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: 'image/png' });

              const safeTeacher = Array.from(currentUser).map(c => c.charCodeAt(0).toString(16)).join('');
              const fileName = `${task.date}_${safeTeacher}_${task.shift.replace(/[^0-9]/g, "")}_${Date.now()}.png`;

              const { data: uploadData, error: uploadError } = await supabaseClient.storage
                .from('signatures')
                .upload(fileName, blob, { contentType: 'image/png', upsert: true });

              if (uploadError) throw new Error("서명 업로드 실패: " + uploadError.message);

              const { data: publicUrlData } = supabaseClient.storage.from('signatures').getPublicUrl(fileName);
              signature_url = publicUrlData.publicUrl;
              location = signature_url;
            } else if (selectedTeam.includes('취업팀') && (!location || location === "__DELETE__")) {
              location = "";
              signature_url = null;
            }

            const upsertPayload = {
              team: selectedTeam,
              log_date: task.date,
              teacher: currentUser,
              shift: task.shift,
              student: task.student || "",
              location: signature_url ? "" : location || "",
              signature_url: signature_url
            };

            const { error: upsertError } = await supabaseClient
              .from('daily_logs')
              .upsert(upsertPayload, { onConflict: 'team, log_date, teacher, shift' });

            if (upsertError) throw new Error("Supabase 저장 실패: " + upsertError.message);

            setSaveProgress(prev => prev.map(item => item.id === task.id ? { ...item, status: '저장 완료' } : item));
            task.location = location;
            return task;
          } catch (e) {
            if (attempt === 5) {
              setSaveProgress(prev => prev.map(item => item.id === task.id ? { ...item, status: '저장 실패' } : item));
              return null;
            } else {
              await new Promise(res => setTimeout(res, 1000 + Math.floor(Math.random() * 500)));
            }
          }
        }
        return null;
      });

      const resolvedChunk = await Promise.all(chunkPromises);
      resolvedChunk.forEach(record => { if (record !== null) validRecords.push(record); });
      if (idx + chunkSize < allTasks.length) await new Promise(res => setTimeout(res, 300));
    }

    if (validRecords.length > 0) {
      setLogs(prev => {
        const newLogs = { ...prev };
        validRecords.forEach(record => {
          if (record.date === date) {
            const sIdx = shifts.indexOf(record.shift);
            if (sIdx !== -1) {
              newLogs[sIdx] = { ...newLogs[sIdx], location: record.location };
            }
          }
        });
        return newLogs;
      });

      setAllScheduleData(prev => {
        const newData = { ...prev };
        validRecords.forEach(record => {
          if (!newData[record.date]) newData[record.date] = {};
          newData[record.date][record.shift] = {
            student: record.student,
            location: record.location,
            status: record.statusStr
          };
        });

        if (selectedTeam && currentUser) {
          const cacheKey = `sungdong_schedule_${selectedTeam}_${currentUser}`;
          window.localStorage.setItem(cacheKey, JSON.stringify(newData));
        }

        return newData;
      });
    }
    setIsSubmitting(false);
    setIsSaveComplete(true);
  };

  const availableDates = useMemo(() => {
    return Object.keys(allScheduleData).sort();
  }, [allScheduleData]);

  const noNewScheduleToRepeat = useMemo(() => {
    if (isFetchingSchedule || isSyncing || isSubmitting) return null;
    const currentDayOfWeek = new Date(date).getDay();
    const targetDates = availableDates.filter(d => {
      if (d <= date || new Date(d).getDay() !== currentDayOfWeek) return false;
      const targetData = allScheduleData[d] || {};
      return Object.values(targetData).some(s => {
        const student = s?.student || "";
        const location = s?.location || "";
        if (!student.trim()) return false;
        const combinedText = student + location;
        return !combinedText.includes("공휴일") && !combinedText.includes("간담회") && !combinedText.includes("소양교육");
      });
    });
    if (targetDates.length === 0) return "no_future_dates";

    const hasDifference = targetDates.some(targetDate => {
      const targetOriginalData = allScheduleData[targetDate] || {};
      return shifts.some((shiftTime, i) => {
        const log = logs[i];
        const original = targetOriginalData[shiftTime] || {};
        const isStudentDiff = (log.student || "") !== (original.student || "");
        const isLocationDiff = selectedTeam === '취업팀'
          ? (original.location || "") !== ""
          : (log.location || "") !== (original.location || "");
        return isStudentDiff || isLocationDiff;
      });
    });

    return !hasDifference ? "already_identical" : null;
  }, [date, availableDates, allScheduleData, logs, selectedTeam, isFetchingSchedule, isSyncing, isSubmitting, shifts]);

  const minDate = availableDates.length > 0 ? availableDates[0] : "";
  const maxDate = availableDates.length > 0 ? availableDates[availableDates.length - 1] : "";

  const isSkipDate = (d) => {
    if (holidaysDbList.includes(d) || holidaysDbList.includes(d.substring(5))) return true;

    const targetData = allScheduleData[d] || {};
    const items = Object.values(targetData).filter(s => (s?.student || "").trim() !== "");
    if (items.length === 0) return false;

    return items.every(s => {
      const text = (s?.student || "") + " " + (s?.location || "");
      return /공휴일|근로자의날|어린이날|명절|연휴|간담회|소양교육/.test(text) || text.includes("휴일");
    });
  };

  useEffect(() => {
    if (availableDates.length === 0) return;

    const todayStr = getInitialWeekday();
    if (date === todayStr && !isSkipDate(date)) return;

    if (!availableDates.includes(date) || isSkipDate(date)) {
      const futureDates = availableDates.filter(d => d > date && !isSkipDate(d));
      if (futureDates.length > 0) setDate(futureDates[0]);
      else {
        const pastDates = availableDates.filter(d => d < date && !isSkipDate(d));
        if (pastDates.length > 0) setDate(pastDates[pastDates.length - 1]);
      }
    }
  }, [availableDates, date]);

  const handlePrevDay = async () => {
    if (isDataLoading) return;
    if (!(await performAutoSave())) return;
    const pastDates = availableDates.filter(d => d < date && !isSkipDate(d));
    if (pastDates.length > 0) setDate(pastDates[pastDates.length - 1]);
    else {
      setErrorMessage("⚠️ 이전 근무 기록이 없습니다.");
      setTimeout(() => setErrorMessage(""), 2000);
    }
  };

  const handleNextDay = async () => {
    if (isDataLoading) return;
    if (!(await performAutoSave())) return;
    const futureDates = availableDates.filter(d => d > date && !isSkipDate(d));
    if (futureDates.length > 0) setDate(futureDates[0]);
    else {
      setErrorMessage("⚠️ 이후 근무 기록이 없습니다.");
      setTimeout(() => setErrorMessage(""), 2000);
    }
  };

  const handleTodayClick = async () => {
    if (isDataLoading) return;
    if (!(await performAutoSave())) return;
    const todayStr = getInitialWeekday();
    setDate(todayStr);
  };

  const handleDateChange = async (e) => {
    const s = e.target.value;
    if (!s || isDataLoading) return;
    if (!(await performAutoSave())) return;

    if (availableDates.length > 0) {
      if (s < minDate || s > maxDate || !availableDates.includes(s)) {
        let targetDate = s;
        if (s < minDate) targetDate = minDate;
        else if (s > maxDate) targetDate = maxDate;

        if (!availableDates.includes(targetDate)) {
          const futureDates = availableDates.filter(d => d > targetDate);
          if (futureDates.length > 0) targetDate = futureDates[0];
          else {
            const pastDates = availableDates.filter(d => d < targetDate);
            if (pastDates.length > 0) targetDate = pastDates[pastDates.length - 1];
          }
        }

        setErrorMessage(`⚠️ 해당 날짜는 시트에 정의되지 않았습니다. (${targetDate}로 이동합니다)`);
        setTimeout(() => setErrorMessage(""), 3000);
        setDate(targetDate);
        return;
      }
    }

    const d = new Date(s);
    if (d.getDay() === 0 || d.getDay() === 6) { setErrorMessage("⚠️ 주말(토, 일요일)은 선택할 수 없습니다."); setTimeout(() => setErrorMessage(""), 3000); return; }
    setErrorMessage(""); setDate(s);
  };

  const handleLogChange = (index, field, value) => {
    if (field === 'student' && (!value || value.trim() === "")) {
      setLogs(prev => ({
        ...prev,
        [index]: {
          ...prev[index],
          student: "",
          selectedTags: [[]],
          memo: "",
          headcount: "",
          location: ""
        }
      }));
      const backupKey = `log_backup_${selectedTeam}_${currentUser}_${date}_${index}`;
      window.localStorage.removeItem(backupKey);
    } else {
      setLogs(prev => ({ ...prev, [index]: { ...prev[index], [field]: value } }));
    }

    if (validationErrorIndex === index) setValidationErrorIndex(null);

    if (field === 'memo') {
      const backupKey = `log_backup_${selectedTeam}_${currentUser}_${date}_${index}`;
      if (value && value.trim() !== "") {
        window.localStorage.setItem(backupKey, value);
      } else {
        window.localStorage.removeItem(backupKey);
      }
    }
  };

  const toggleTag = (index, sIdx, tag) => {
    const now = Date.now();
    const lastClick = lastTagClickRef.current;
    if (lastClick.index === index && lastClick.sIdx === sIdx && lastClick.tag === tag && now - lastClick.time < 400) return;

    lastTagClickRef.current = { time: now, index, sIdx, tag };

    setLogs(prev => {
      const newLogs = { ...prev };
      const log = { ...newLogs[index] };
      const studentNames = (log.student || "").split(/[/,]/).map(s => s.trim()).filter(s => s.length > 0);
      const maxRows = Math.max(1, studentNames.length);
      let currentTagsArray = [...(log.selectedTags || [])];
      while (currentTagsArray.length < maxRows) currentTagsArray.push([]);

      const exclusiveTags = ['1', '2', '결석'];

      if (tag === '선생님휴가') {
        const isAnySelected = currentTagsArray.some(tags => tags.includes('선생님휴가'));
        if (isAnySelected) {
          currentTagsArray = currentTagsArray.map(tags => tags.filter(t => t !== '선생님휴가'));
        } else {
          currentTagsArray = currentTagsArray.map(tags => {
            let newTags = [...tags];
            if (!newTags.includes('선생님휴가')) newTags.push('선생님휴가');
            return newTags;
          });
        }
      } else {
        let newTags = [...(currentTagsArray[sIdx] || [])];
        if (newTags.includes(tag)) {
          newTags = newTags.filter(t => t !== tag);
        } else {
          if (exclusiveTags.includes(tag)) newTags = newTags.filter(t => !exclusiveTags.includes(t));
          newTags.push(tag);
        }
        currentTagsArray[sIdx] = newTags;
      }

      log.selectedTags = currentTagsArray;
      newLogs[index] = log;
      return newLogs;
    });
  };

  const handleLogin = (e) => {
    if (e) e.preventDefault();
    if (!isLoginReady) return;

    if (currentUser) {
      const todayStr = getInitialWeekday();
      setDate(todayStr);
      setIsLoggedIn(true);
      setRefreshTrigger(prev => prev + 1);
    }
  };

  const handleMainTouchStart = (e) => {
    mainTouchStartX.current = e.touches[0].clientX;
    mainTouchStartY.current = e.touches[0].clientY;
    setPullDistance(0);
  };

  const handleMainTouchMove = (e) => {
    if (mainTouchStartX.current === null || mainTouchStartY.current === null) return;
    const touchEndX = e.touches[0].clientX;
    const touchEndY = e.touches[0].clientY;
    const deltaX = touchEndX - mainTouchStartX.current;
    const deltaY = touchEndY - mainTouchStartY.current;

    if (deltaY > 0 && deltaY > Math.abs(deltaX) * 2) setPullDistance(Math.min(deltaY, 400));
    else setPullDistance(0);
  };

  const handleMainTouchEnd = (e) => {
    if (mainTouchStartX.current === null || mainTouchStartY.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - mainTouchStartX.current;
    const deltaY = touchEndY - mainTouchStartY.current;

    if (deltaY > 300 && deltaY > Math.abs(deltaX) * 2) window.location.reload();
    else setPullDistance(0);
    mainTouchStartX.current = null;
    mainTouchStartY.current = null;
  };

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

    if (isDataLoading) { touchStartX.current = null; touchStartY.current = null; return; }

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 250) {
      if (deltaX > 0) handleNextDay();
      else handlePrevDay();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  if (!isLoggedIn) {
    return (
      <div
        className="fixed inset-0 overflow-y-auto overflow-x-hidden bg-transparent flex flex-col items-center sm:py-10"
        onTouchStart={handleMainTouchStart}
        onTouchMove={handleMainTouchMove}
        onTouchEnd={handleMainTouchEnd}
      >
        <div
          className="absolute left-0 right-0 flex items-center justify-center pointer-events-none z-50 pt-safe-4"
          style={{
            transform: `translateY(${pullDistance > 0 ? (pullDistance * 0.4) : -50}px)`,
            opacity: pullDistance > 10 ? Math.min(pullDistance / 300, 1) : 0,
            transition: pullDistance === 0 ? 'all 0.3s ease-out' : 'none'
          }}
        >
          <div className="flex items-center justify-center bg-white shadow-lg border border-sky-200 p-3 rounded-full">
            <RefreshCw className={`w-8 h-8 ${pullDistance > 300 ? 'text-blue-600 animate-spin' : 'text-gray-400'}`} />
          </div>
        </div>

        <div
          className="flex flex-col flex-1 sm:flex-none w-full max-w-md sm:max-w-[600px] md:max-w-[680px] bg-white px-5 pb-8 pt-safe-6 sm:px-8 sm:pb-10 sm:pt-safe-8 sm:rounded-2xl sm:shadow-xl sm:border sm:border-gray-100 sm:min-h-[600px] shrink-0 sm:my-auto animate-fadeIn"
          style={{
            transform: `translateY(${pullDistance * 0.1}px)`,
            transition: pullDistance === 0 ? 'transform 0.3s ease-out' : 'none'
          }}
        >
          <div className="text-center mb-5 sm:mb-8 shrink-0 mt-2 sm:mt-0">
            <div className="flex justify-center mb-2 sm:mb-4">
              <img src="Logo_of_Seoul.jpg" alt="서울시 로고" className="h-[42px] sm:h-[52px] object-contain" onError={(e) => e.target.style.display = 'none'} />
            </div>
            <div className="flex items-center justify-center mb-1 sm:mb-2">
              <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-blue-600">성동노인종합복지관<sub className="text-[0.38em] font-black align-sub ml-0.5 text-gray-400">DB</sub></h1>
            </div>
            <h2 className="text-[clamp(14px,4.5vw,18px)] sm:text-2xl md:text-3xl font-bold text-red-600 whitespace-nowrap tracking-tighter flex items-center justify-center gap-2">
              <svg className="w-6 h-6 sm:w-8 sm:h-8 animate-pulse shrink-0 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="#EF4444" stroke="#B91C1C" strokeWidth="1" />
                <circle cx="19" cy="5" r="1.5" fill="#F87171" />
                <circle cx="5" cy="19" r="1" fill="#F87171" />
              </svg>
              디지털교육 서포터즈 <span className="text-indigo-700">업무일지 시스템</span>
            </h2>
          </div>

          <div className="flex flex-col gap-3 sm:gap-4 shrink-0">
            <div>
              <label className="block text-gray-700 font-semibold mb-1 sm:mb-2 text-lg sm:text-xl md:text-2xl">1. 팀 선택</label>
              <select className="w-full h-[48px] sm:h-[56px] md:h-[64px] px-3 sm:px-4 border border-sky-300 rounded-xl text-xl sm:text-2xl md:text-3xl bg-sky-100 text-blue-700 outline-none font-bold shadow-md focus:ring-2 focus:ring-blue-400" value={selectedTeam} onChange={(e) => {
                setSelectedTeam(e.target.value);
                setCurrentUser("");
              }}>
                <option value="">팀을 선택하세요</option>
                {teamList.map(team => <option key={team} value={team}>{team}</option>)}
              </select>
            </div>
            {selectedTeam && (
              <div>
                <label className="block text-gray-700 font-semibold mb-1 sm:mb-2 text-lg sm:text-xl md:text-2xl flex justify-between items-end">
                  <span>2. 선생님 선택</span>
                  {isFetchingTeachers && <span className="text-base sm:text-lg md:text-xl text-red-600 font-bold flex items-center mb-1 animate-pulse"><Clock className="w-4 h-4 sm:w-5 sm:h-5 mr-1 animate-spin" />로딩 중...</span>}
                </label>
                <div className="flex gap-2">
                  <select className="flex-1 h-[48px] sm:h-[56px] md:h-[64px] px-3 sm:px-4 border border-sky-300 rounded-xl text-xl sm:text-2xl md:text-3xl bg-sky-100 text-blue-700 outline-none font-bold shadow-md focus:ring-2 focus:ring-blue-400" value={currentUser} onChange={(e) => setCurrentUser(e.target.value)} disabled={isFetchingTeachers}>
                    <option value="">선생님을 선택하세요</option>
                    {teachers.map(name => <option key={name} value={name}>{name.replace(/\n/g, ' ')}</option>)}
                  </select>

                  <AnimatedRefreshButton
                    onClick={() => fetchTeachersFromSheet(selectedTeam)}
                    isFetching={isFetchingTeachers}
                  />
                </div>
              </div>
            )}

            <div className="pt-1 sm:pt-2 flex">
              {!isLoginReady ? (
                <div className="flex-1 flex items-center justify-center w-full rounded-xl text-[clamp(17px,4.5vw,24px)] md:text-[22px] lg:text-[24px] tracking-tight font-extrabold text-white bg-gray-400 border-2 border-gray-400 cursor-not-allowed shadow-md opacity-90 select-none min-h-[54px] sm:min-h-[58px] md:min-h-[64px]">
                  {isFetchingSchedule ? <><Clock className="w-6 h-6 sm:w-8 sm:h-8 lg:w-7 lg:h-7 mr-2 animate-spin" /> 데이터 확인 중...</> : <><EditIcon className="w-6 h-6 sm:w-8 sm:h-8 lg:w-7 lg:h-7 mr-2" /> 일지 작성하기</>}
                </div>
              ) : (
                <button onClick={handleLogin} className="flex-1 flex items-center justify-center w-full rounded-xl text-[clamp(17px,4.5vw,24px)] md:text-[22px] lg:text-[24px] tracking-tight font-extrabold text-white bg-blue-600 border-2 border-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-md touch-manipulation min-h-[54px] sm:min-h-[58px] md:min-h-[64px]">
                  <EditIcon className="w-6 h-6 sm:w-8 sm:h-8 lg:w-7 lg:h-7 mr-2" /> 일지 작성하기
                </button>
              )}
            </div>
          </div>

          <div className="py-3 sm:py-4 flex justify-center items-center shrink-0 mt-1">
            <VintageDivider className="w-4/5 h-6 sm:h-8 text-gray-500 opacity-60" />
          </div>

          <div className="flex-1 flex flex-col gap-4 sm:gap-6 min-h-[180px]">
            <button
              onClick={() => {
                if (!selectedTeam || !currentUser) {
                  setErrorMessage("팀과 선생님을 먼저 선택해주세요.");
                  setTimeout(() => setErrorMessage(""), 3000);
                  return;
                }
                onNavigateToMyWeeklySchedule();
              }}
              className={`flex-1 flex items-center justify-center w-full rounded-xl text-[clamp(17px,4.5vw,24px)] md:text-[22px] lg:text-[24px] tracking-tight font-black shadow-md transition-all active:scale-95 touch-manipulation min-h-[54px] sm:min-h-[58px] md:min-h-[64px] ${(!selectedTeam || !currentUser) ? 'text-gray-400 bg-gray-100 border-2 border-gray-200 cursor-not-allowed' : 'text-blue-900 bg-[#a9d0fd] border-2 border-blue-400 hover:bg-blue-300'}`}
            >
              <CalendarIcon className="w-6 h-6 sm:w-8 sm:h-8 lg:w-7 lg:h-7 mr-1.5 sm:mr-2" /> 나의 주간 일정 보기
            </button>

            {selectedTeam ? (
              <>
                <button onClick={() => onNavigateToDailySchedule(selectedTeam)} className="flex-1 flex items-center justify-center w-full rounded-xl text-[clamp(17px,4.5vw,24px)] md:text-[22px] lg:text-[24px] tracking-tight font-extrabold shadow-md text-blue-900 bg-orange-100 border-2 border-orange-300 hover:bg-orange-200 transition-all active:scale-95 touch-manipulation min-h-[54px] sm:min-h-[58px] md:min-h-[64px]">
                  <CalendarClockIcon className="w-6 h-6 sm:w-8 sm:h-8 lg:w-7 lg:h-7 mr-1.5 sm:mr-2" /> 팀별 오늘 일정 보기
                </button>
                <button onClick={() => onNavigateToTeamSchedule(selectedTeam)} className="flex-1 flex items-center justify-center w-full rounded-xl text-[clamp(17px,4.5vw,24px)] md:text-[22px] lg:text-[24px] tracking-tight font-extrabold shadow-md text-blue-900 bg-orange-100 border-2 border-orange-300 hover:bg-orange-200 transition-all active:scale-95 touch-manipulation min-h-[54px] sm:min-h-[58px] md:min-h-[64px]">
                  <CalendarDaysIcon className="w-6 h-6 sm:w-8 sm:h-8 lg:w-7 lg:h-7 mr-1.5 sm:mr-2" /> 전체 일정 보기/엑셀 다운로드
                </button>
              </>
            ) : (
              <>
                <button disabled className="flex-1 flex items-center justify-center w-full rounded-xl text-[clamp(17px,4.5vw,24px)] md:text-[22px] lg:text-[24px] tracking-tight font-extrabold shadow-md text-gray-400 bg-gray-100 border-2 border-gray-200 cursor-not-allowed min-h-[54px] sm:min-h-[58px] md:min-h-[64px]">
                  <CalendarClockIcon className="w-6 h-6 sm:w-8 sm:h-8 lg:w-7 lg:h-7 mr-1.5 sm:mr-2" /> 팀별 오늘 일정 보기
                </button>
                <button disabled className="flex-1 flex items-center justify-center w-full rounded-xl text-[clamp(17px,4.5vw,24px)] md:text-[22px] lg:text-[24px] tracking-tight font-extrabold shadow-md text-gray-400 bg-gray-100 border-2 border-gray-200 cursor-not-allowed min-h-[54px] sm:min-h-[58px] md:min-h-[64px]">
                  <CalendarDaysIcon className="w-6 h-6 sm:w-8 sm:h-8 lg:w-7 lg:h-7 mr-1.5 sm:mr-2" /> 전체 일정 보기/엑셀 다운로드
                </button>
              </>
            )}
            {errorMessage && <div className="text-red-600 font-bold text-center text-sm md:text-base -mt-2 -mb-2">{errorMessage}</div>}

            <a href="https://docs.google.com/spreadsheets/d/1e4g_HIsmAQbLK8n0eMz_RGX3okou75tqKSSAkbWDsBk/edit?gid=936021842#gid=936021842" target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center w-full rounded-xl text-[clamp(15px,4.5vw,24px)] md:text-[20px] lg:text-[22px] tracking-tighter whitespace-nowrap px-2 font-extrabold text-emerald-900 bg-emerald-50 border-2 border-emerald-200 hover:bg-emerald-100 shadow-md transition-all active:scale-95 min-h-[54px] sm:min-h-[58px] md:min-h-[64px]">
              <svg className="w-5 h-5 sm:w-8 sm:h-8 lg:w-7 lg:h-7 mr-1 sm:mr-2 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg> 수업 희망자 및 기타 참여자 관리
            </a>

            <button onClick={onNavigateToStudentSearch} className="flex-1 flex items-center justify-center w-full rounded-xl text-[clamp(15px,4.5vw,24px)] md:text-[20px] lg:text-[22px] tracking-tighter whitespace-nowrap px-2 font-extrabold text-blue-900 bg-teal-50 border-2 border-teal-200 hover:bg-teal-100 shadow-md touch-manipulation transition-all active:scale-95 min-h-[54px] sm:min-h-[58px] md:min-h-[64px]">
              <svg className="w-5 h-5 sm:w-8 sm:h-8 lg:w-7 lg:h-7 mr-1 sm:mr-2 shrink-0" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /><path d="M11 8a3 3 0 0 0-3 3" /></svg> 대상자 검색하기
            </button>

            <div className="flex justify-center items-center shrink-0 -my-1 sm:-my-1.5">
              <VintageDivider className="w-4/5 h-6 sm:h-8 text-gray-500 opacity-60" />
            </div>

            <button onClick={onNavigateToClassroom} className="flex-1 flex items-center justify-center w-full rounded-xl text-[clamp(15px,4.5vw,24px)] md:text-[20px] lg:text-[22px] tracking-tighter whitespace-nowrap px-2 font-extrabold text-white bg-purple-500 border-2 border-purple-600 hover:bg-purple-600 shadow-md touch-manipulation transition-all active:scale-95 min-h-[54px] sm:min-h-[58px] md:min-h-[64px]">
              <PresentationIcon className="w-5 h-5 sm:w-8 sm:h-8 lg:w-7 lg:h-7 mr-1 sm:mr-2 shrink-0" /> 지하1층 평생교육실2 사용 보기
            </button>

            <button onClick={onNavigateToTeacherManagement} className="flex-1 flex items-center justify-center w-full rounded-xl text-[clamp(15px,4.5vw,24px)] md:text-[20px] lg:text-[22px] tracking-tighter whitespace-nowrap px-2 font-extrabold text-white bg-indigo-400 border-2 border-indigo-500 hover:bg-indigo-500 shadow-md touch-manipulation transition-all active:scale-95 min-h-[54px] sm:min-h-[58px] md:min-h-[64px]">
              <UsersIcon className="w-5 h-5 sm:w-8 sm:h-8 lg:w-7 lg:h-7 mr-1 sm:mr-2 shrink-0" /> 선생님 명단 관리
            </button>

            <button onClick={onNavigateToAutoSchedule} className="flex-1 flex items-center justify-center w-full rounded-xl text-[clamp(15px,4.5vw,24px)] md:text-[20px] lg:text-[22px] tracking-tighter whitespace-nowrap px-2 font-extrabold text-white bg-rose-400 border-2 border-rose-500 hover:bg-rose-500 shadow-md touch-manipulation transition-all active:scale-95 min-h-[54px] sm:min-h-[58px] md:min-h-[64px]">
              <LucideCalendar className="w-5 h-5 sm:w-8 sm:h-8 lg:w-7 lg:h-7 mr-1 sm:mr-2 shrink-0" /> 시간표 작성
            </button>

            <button onClick={onNavigateToHolidayManagement} className="flex-1 flex items-center justify-center w-full rounded-xl text-[clamp(15px,4.5vw,24px)] md:text-[20px] lg:text-[22px] tracking-tighter whitespace-nowrap px-2 font-extrabold text-white bg-emerald-400 border-2 border-emerald-500 hover:bg-emerald-500 shadow-md touch-manipulation transition-all active:scale-95 min-h-[54px] sm:min-h-[58px] md:min-h-[64px]">
              <svg className="w-5 h-5 sm:w-8 sm:h-8 lg:w-7 lg:h-7 mr-1 sm:mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> 공휴일/휴무일 관리
            </button>
          </div>

          <div className="mt-6 sm:mt-8 text-center text-[12px] text-gray-400 font-bold tracking-wider">
            v260520-supabase
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-transparent font-sans pb-6">
      <header className="bg-blue-600 text-white px-4 pb-4 pt-safe-4 shadow-lg z-40 flex justify-between items-center relative">
        <div className="flex items-center">
          <div className="flex flex-col">
            <div className="flex items-center mb-1">
              <img src="Logo_of_Seoul.jpg" alt="서울시 로고" className="h-7 bg-white px-2 py-1 rounded-md object-contain mr-2" onError={(e) => e.target.style.display = 'none'} />
              <h1 className="font-black text-xl leading-tight">성동노인종합복지관</h1>
            </div>
            <p className="text-lg font-bold text-yellow-300">디지털교육 서포터즈</p>
            <p className="text-base opacity-95 flex items-center mt-1 font-bold">
              <User className="w-4 h-4 mr-1" /> [{selectedTeam}] {currentUser.replace(/\n/g, ' ')} 선생님
            </p>
          </div>
        </div>

        <button
          onClick={(e) => {
            if (isSubmitting) {
              e.preventDefault();
              alert("데이터 저장 중입니다. 잠시만 기다려주세요.");
              return;
            }
            handleLogout();
          }}
          className={`text-xs flex flex-col items-center font-bold p-2 rounded-lg shadow-md transition-all touch-manipulation ${isSubmitting ? 'bg-blue-800 text-gray-400 opacity-60 cursor-not-allowed' : 'bg-blue-800 text-white opacity-90 active:scale-95'}`}
        >
          <Home className="w-5 h-5 mb-1" /> 처음으로
        </button>
      </header>

      <main
        className="w-full max-w-md sm:max-w-2xl lg:max-w-4xl mx-auto flex flex-col px-4 sm:px-6 md:px-8 pt-2 mt-1 pb-32"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <section className="bg-white rounded-2xl shadow-md border border-gray-100 flex flex-col h-auto animate-fadeIn">
          <div className="bg-white px-5 pt-3 pb-2 relative rounded-t-2xl">
            <h2 className="text-xl font-bold text-gray-800 mb-1 border-b pb-2 flex items-center justify-between">
              <span className="flex items-center"><MainCalendarIcon className="w-5 h-5 mr-2 text-blue-500" /> 근무기록 입력</span>

              <div className="flex items-center">
                {(isDataLoading) ? (
                  <span className="text-sm sm:text-lg text-red-600 font-bold flex items-center animate-pulse tracking-tight">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5 mr-1 animate-spin" />
                    <span className="hidden sm:inline">{isSubmitting ? '자동 저장 중...' : isSyncing ? '최신 데이터 확인 중...' : '데이터 로딩 중...'}</span>
                    <span className="inline sm:hidden">{isSubmitting ? '저장중...' : '로딩중...'}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleRepeatSchedule}
                    disabled={hasChanges || isEmptySchedule || !!noNewScheduleToRepeat}
                    className={`text-[15px] sm:text-[16px] px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold flex items-center whitespace-nowrap transition-all ${hasChanges || isEmptySchedule || !!noNewScheduleToRepeat ? 'bg-gray-400 text-white cursor-not-allowed opacity-90' : 'bg-orange-600 hover:bg-orange-700 text-white shadow-sm active:scale-95 touch-manipulation'}`}
                    title={
                      hasChanges ? "변경사항을 먼저 저장해야 일정 복제가 가능합니다." :
                        isEmptySchedule ? "복제할 일정이 없습니다. 학생이름과 장소를 먼저 입력해 주세요." :
                          noNewScheduleToRepeat === "no_future_dates" ? "이후 동일한 요일의 날짜가 없습니다." :
                            noNewScheduleToRepeat === "already_identical" ? "이후 동일 요일에 이미 동일한 일정이 모두 등록되어 있습니다." :
                              "현재의 학생이름과 장소를 이후의 동일 요일들에 복제합니다."
                    }
                  >
                    <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5" /> 일정 복제
                  </button>
                )}
              </div>
            </h2>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 sm:gap-2 w-full max-w-md sm:max-w-xl mx-auto mb-1">
                <button type="button" onClick={handlePrevDay} disabled={isDataLoading} className="w-10 sm:w-12 h-10 sm:h-12 flex items-center justify-center border-[1.5px] border-gray-300 rounded-xl bg-white shadow-sm hover:bg-gray-50 active:bg-gray-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation text-gray-700 shrink-0 transition-all">
                  <svg className="w-6 h-6 sm:w-7 sm:h-7" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" /></svg>
                </button>

                <div className={`flex-1 h-10 sm:h-12 relative flex items-center justify-center border-[1.5px] border-blue-400 bg-[#f0f7ff] rounded-xl text-center shadow-sm overflow-hidden transition-all`}>
                  <input
                    type="date"
                    value={date}
                    onChange={handleDateChange}
                    disabled={isDataLoading}
                    onClick={(e) => {
                      try {
                        if (!isDataLoading && e.target.showPicker) e.target.showPicker();
                      } catch (err) { }
                    }}
                    min={minDate || undefined}
                    max={maxDate || undefined}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                    title="달력 열기"
                  />
                  <div className={`flex items-center justify-center pointer-events-none relative z-0 ${isDataLoading ? 'opacity-50' : ''} -translate-y-[1px] whitespace-nowrap px-1`}>
                    <span className={`font-extrabold text-[#1e3a8a] text-[15px] min-[360px]:text-[17px] sm:text-[20px] tracking-tighter whitespace-nowrap`}>{parseInt(date.substring(5, 7), 10)}/{parseInt(date.substring(8, 10), 10)}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1e3a8a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mx-1 sm:mx-1.5 w-4 h-4 sm:w-5 sm:h-5 shrink-0">
                      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                      <line x1="16" x2="16" y1="2" y2="6" />
                      <line x1="8" x2="8" y1="2" y2="6" />
                      <line x1="3" x2="21" y1="10" y2="10" />
                    </svg>
                    <span className={`font-extrabold text-[#1e3a8a] text-[15px] min-[360px]:text-[17px] sm:text-[20px] tracking-tighter whitespace-nowrap shrink-0`}>({getDayName(date)})</span>
                  </div>
                </div>

                <button type="button" onClick={handleTodayClick} disabled={isDataLoading} className="text-[13px] sm:text-[15px] px-3 sm:px-4 h-10 sm:h-12 border border-blue-600 rounded-xl font-bold bg-blue-600 text-white shadow-sm flex items-center justify-center hover:bg-blue-700 active:bg-blue-800 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation whitespace-nowrap shrink-0 transition-all">오늘</button>
                <button type="button" onClick={handleNextDay} disabled={isDataLoading} className="w-10 sm:w-12 h-10 sm:h-12 flex items-center justify-center border-[1.5px] border-gray-300 rounded-xl bg-white shadow-sm hover:bg-gray-50 active:bg-gray-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation text-gray-700 shrink-0 transition-all">
                  <svg className="w-6 h-6 sm:w-7 sm:h-7" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" /></svg>
                </button>
              </div>
              {errorMessage && <div className="text-red-600 font-bold text-base text-center pb-2">{errorMessage}</div>}

              {isMissingHeadcount && !isDataLoading && (
                <div className="mt-2 animate-fadeIn">
                  <div className="bg-red-50 border-2 border-red-300 rounded-xl p-3 sm:p-4 text-red-800 shadow-sm flex items-center justify-center">
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="font-extrabold text-[15px] sm:text-[18px] text-red-700">
                      교육 참석인원을 입력하세요.
                    </p>
                  </div>
                </div>
              )}

              {specialAlerts.length > 0 && (
                <div className="mt-2 animate-fadeIn">
                  <div className="bg-orange-100 border-2 border-orange-300 rounded-xl px-2 sm:px-4 py-3 sm:py-4 text-gray-800 shadow-sm overflow-hidden">
                    <div className="flex items-start gap-1.5 sm:gap-3 w-full">
                      <div className="bg-orange-300 p-1 sm:p-1.5 rounded-lg shrink-0">
                        <svg className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div className="flex flex-col gap-0.5 sm:gap-1 w-full min-w-0">
                        <h4 className="font-bold text-[16px] min-[360px]:text-[17px] sm:text-[20px] leading-tight flex items-center gap-1 sm:gap-2">
                          📅 주요 일정 안내
                        </h4>
                        <div className="space-y-1 sm:space-y-1.5 mt-0.5 sm:mt-1">
                          {specialAlerts.map((msg, idx) => (
                            <p key={idx} className="font-bold text-[13.5px] min-[360px]:text-[14.5px] min-[380px]:text-[15.5px] sm:text-[18px] leading-tight text-blue-700 tracking-tighter whitespace-nowrap overflow-x-auto pb-0.5 scrollbar-hide w-full block">
                              • {msg}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {isEmptySchedule && !isDataLoading && (
                <div className="mt-2 animate-fadeIn">
                  <div className="bg-orange-100 border-2 border-orange-300 rounded-xl p-4 text-orange-800 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="bg-orange-300 p-1.5 rounded-lg shrink-0">
                        <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="font-bold text-[15px] sm:text-[17px] leading-snug break-keep text-orange-900">
                        대체근무인 경우, 대상자 이름, 장소, 출석 사항 등을 입력/체크하고 화면 하단의 <span className="text-blue-700 font-extrabold">'구글 시트에 저장하기'</span> 버튼을 누르면 수업을 추가할 수 있습니다.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="px-5 pb-5 pt-3">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-7">
                {shifts.map((shift, index) => {
                  const isInfoMissing = logs[index] ? (!logs[index].student || !logs[index].student.trim() || !logs[index].location || !logs[index].location.trim()) : true;
                  const locLen = logs[index] && logs[index].location ? logs[index].location.length : 0;

                  const locTextSize = locLen >= 9 ? "text-[15px] sm:text-[15px] md:text-[16px] landscape:text-[17px] md:landscape:text-[18px]" : locLen >= 8 ? "text-[16px] sm:text-[16px] md:text-[18px] landscape:text-[18px] md:landscape:text-[20px]" : locLen >= 7 ? "text-[17px] sm:text-[17px] md:text-[20px] landscape:text-[20px] md:landscape:text-[22px]" : locLen >= 6 ? "text-[18px] sm:text-[19px] md:text-[22px] landscape:text-[22px] md:landscape:text-[24px]" : "text-[18px] min-[360px]:text-[20px] sm:text-xl md:text-2xl landscape:text-[22px] md:landscape:text-[26px]";

                  const counts = studentCounts[index];
                  const studentNames = logs[index] ? (logs[index].student || "").split(/[/,]/).map(s => s.trim()).filter(s => s.length > 0) : [];
                  const displayRowsCount = Math.max(1, studentNames.length);
                  const isMultipleStudents = studentNames.length >= 2;

                  const combinedText = logs[index] ? ((logs[index].student || "") + " " + (logs[index].location || "")) : "";
                  const isKyungrodang = combinedText.includes("경로당");
                  const isShowHeadcount = logs[index] ? ((logs[index].student || "").includes("보조강사") || isKyungrodang) : false;
                  const isSpecialDay = logs[index] ? ((logs[index].student || "").includes("공휴일") || (logs[index].location || "").includes("공휴일") || (logs[index].student || "").includes("간담회") || (logs[index].location || "").includes("간담회")) : false;
                  const cardColorClass = isSpecialDay ? 'bg-red-200 border-red-400' : isKyungrodang ? 'bg-orange-100 border-orange-400' : isMultipleStudents ? 'bg-green-100 border-green-400' : 'bg-blue-50/30 border-blue-300';

                  const isFutureOrToday = date >= getLocalDateString(new Date());
                  const hasAttendance = logs[index].tags && logs[index].tags.some(tArray => tArray && tArray.length > 0);
                  const isCompact = isFutureOrToday && !hasAttendance;

                  return (
                    <div key={index} id={`log-card-${index}`} className={`${isCompact ? 'p-2.5 sm:p-3 md:p-4' : 'p-4 sm:p-5 md:p-6'} border rounded-xl shadow-md ${cardColorClass}`}>
                      <div className={`flex justify-between items-start ${isCompact ? 'mb-1 sm:mb-2' : 'mb-2 sm:mb-3'} transition-opacity ${(isDataLoading) ? 'opacity-50' : ''}`}>
                        <div className="flex items-center text-blue-700 font-bold text-lg sm:text-xl flex-wrap gap-y-1">
                          <Clock className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 shrink-0" />
                          <span className="shrink-0">
                            {(() => {
                              const d = new Date(date);
                              const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
                              if (selectedTeam === '취업팀' && day === '금') {
                                const mapping = { "13:00~14:00": "9:30~10:30", "14:00~15:00": "10:30~11:30", "15:00~16:00": "11:30~12:30" };
                                return mapping[shift] || shift;
                              }
                              return shift;
                            })()}
                          </span>

                          {counts && counts.length > 0 && !logs[index].student?.includes("간담회") ? (
                            <div className="flex items-center overflow-hidden ml-2 sm:ml-3 gap-1.5 sm:gap-2 flex-wrap">
                              {counts.map((c, cIdx) => {
                                let sessionColorClass = "bg-gray-300 text-black border-gray-400 font-bold";
                                if (c.count >= 10) sessionColorClass = "bg-purple-900 text-white border-purple-950 font-black shadow-inner";
                                else if (c.count >= 7) sessionColorClass = "bg-purple-500 text-white border-purple-600 font-extrabold";

                                return (
                                  <button
                                    key={cIdx}
                                    type="button"
                                    onClick={() => setSelectedStudentDates(c)}
                                    className={`${sessionColorClass} border px-1.5 sm:px-2 py-0.5 rounded shadow-sm text-sm sm:text-base md:text-lg tracking-tighter whitespace-nowrap shrink-0 transition-colors cursor-pointer hover:brightness-95 active:scale-95`}
                                  >
                                    {c.count}회차
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                        {selectedTeam === '취업팀' && (
                          <button
                            type="button"
                            onClick={() => toggleHideLog(index)}
                            disabled={!logs[index]?.student?.trim()}
                            className={`text-sm sm:text-base font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded shadow-sm transition-colors whitespace-nowrap shrink-0 ml-2 border active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${hiddenLogs[index] ? 'bg-sky-200 hover:bg-sky-300 border-sky-300 text-sky-900' : 'bg-yellow-200 hover:bg-yellow-300 border-yellow-300 text-yellow-800'}`}
                          >
                            {hiddenLogs[index] ? '기록 보이기' : '기록 숨기기'}
                          </button>
                        )}
                      </div>

                      {hiddenLogs[index] ? (
                        <div className="py-6 sm:py-8 flex flex-col items-center justify-center bg-white/60 rounded-lg border border-dashed border-gray-400">
                          <span className="text-gray-500 font-bold text-sm sm:text-base mb-0">학생 기록이 숨겨졌습니다.</span>
                        </div>
                      ) : (
                        <div className={isCompact ? "space-y-2" : "space-y-4"}>
                          <div className="flex gap-1.5 sm:gap-3 lg:gap-4 items-stretch">
                            <input
                              type="text"
                              placeholder="대상자 이름"
                              value={logs[index].student}
                              onChange={(e) => handleLogChange(index, 'student', e.target.value)}
                              onBlur={handleInputBlur}
                              disabled={isDataLoading}
                              className={`flex-[1.5] min-w-0 ${isCompact ? 'py-1 sm:py-1.5' : 'py-1.5 sm:py-2 md:py-2.5'} px-2 sm:px-3 md:px-4 border rounded-lg outline-none font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all text-[18px] min-[360px]:text-[20px] sm:text-xl md:text-2xl landscape:text-[22px] md:landscape:text-[26px] leading-tight ${!logs[index].student ? 'bg-gray-200 text-gray-800 placeholder-gray-500 border-gray-400' : (logs[index].location === '공휴일' || logs[index].location === '휴무일' ? 'bg-red-400 text-white placeholder-red-200 border-transparent' : 'bg-blue-600 text-white placeholder-blue-200 border-transparent')}`}
                            />
                            {selectedTeam !== '취업팀' && (
                              <input
                                type="text"
                                placeholder="장소"
                                value={logs[index].location}
                                onChange={(e) => handleLogChange(index, 'location', e.target.value)}
                                onBlur={handleInputBlur}
                                disabled={isDataLoading}
                                className={`flex-1 min-w-0 ${isCompact ? 'py-1 sm:py-1.5' : 'py-1.5 sm:py-2 md:py-2.5'} px-2 sm:px-3 md:px-4 border rounded-lg outline-none font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all ${locTextSize} leading-tight ${!logs[index].location ? 'bg-gray-200 text-gray-800 placeholder-gray-500 border-gray-400' : (logs[index].location === '공휴일' || logs[index].location === '휴무일' ? 'bg-red-400 text-white placeholder-red-200 border-transparent' : 'bg-blue-600 text-white placeholder-blue-200 border-transparent')}`}
                              />
                            )}
                          </div>

                          <div className="space-y-1.5 !mt-3">
                            {Array.from({ length: displayRowsCount }).map((_, sIdx) => {
                              return (
                                <div key={sIdx} className={`flex flex-col w-full ${sIdx > 0 ? 'mt-1.5 pt-1.5 border-t border-dashed border-blue-200' : ''}`}>
                                  <div className={`flex w-full justify-between gap-0.5 min-[350px]:gap-1 min-[380px]:gap-1.5 sm:gap-2 md:gap-3 ${sIdx === displayRowsCount - 1 ? 'pb-0' : 'pb-1'}`}>
                                    {RENDER_TAGS.map(tag => {
                                      const fontSizeClass = 'text-[13px] min-[340px]:text-[14px] min-[360px]:text-[15px] min-[380px]:text-[17px] sm:text-[18px] md:text-[20px] lg:text-[21px]';

                                      const isKyungrodangIncluded = combinedText.includes("경로당") || combinedText.includes("도선복지관");
                                      const isBlurTarget = isShowHeadcount && (isKyungrodangIncluded ? tag === '1' : ['1', '결석', '취소'].includes(tag));

                                      return (
                                        <button
                                          key={tag}
                                          type="button"
                                          onClick={() => toggleTag(index, sIdx, tag)}
                                          disabled={isDataLoading || isInfoMissing || isBlurTarget}
                                          className={
                                            "flex-1 flex flex-col items-center justify-center px-0 sm:px-2 " + (isCompact ? "py-0.5" : "py-0.5 sm:py-1 md:py-1.5") + " rounded-xl " +
                                            fontSizeClass +
                                            " leading-[1.15] tracking-tighter sm:tracking-normal transition-all touch-manipulation break-keep whitespace-nowrap " +
                                            (isBlurTarget
                                              ? "bg-gray-100 text-gray-500 border-[1.5px] border-gray-300 blur-[1px] opacity-90 cursor-not-allowed"
                                              : "disabled:opacity-50 disabled:cursor-not-allowed " + getTagClass(index, sIdx, tag))
                                          }
                                        >
                                          {tag === '1' ? '출석' : tag}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="flex gap-1.5 w-full !mt-[10px] items-stretch">
                            {isShowHeadcount && (() => {
                              const isHeadcountEmpty = !(logs[index]?.headcount || "").trim();
                              const hasMemo = (logs[index]?.memo || "").trim() !== "";
                              const hasExcusedAttendance = studentNames.some((_, sIdx) => {
                                const tags = (logs[index]?.selectedTags && logs[index].selectedTags[sIdx]) ? logs[index].selectedTags[sIdx] : [];
                                return tags.includes("결석") || tags.includes("선생님휴가") || tags.includes("취소");
                              });
                              const isSparkling = (validationErrorIndex === index) || (hasMemo && isHeadcountEmpty && !hasExcusedAttendance);

                              return (
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  maxLength="2"
                                  placeholder="인원"
                                  value={logs[index]?.headcount || ""}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9]/g, '');
                                    handleLogChange(index, 'headcount', val);
                                  }}
                                  onBlur={handleInputBlur}
                                  disabled={isDataLoading || isInfoMissing}
                                  className={`w-12 md:w-14 px-0.5 text-center border border-sky-400 rounded-xl outline-none font-bold text-gray-900 placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-[18px] md:text-[22px] leading-tight shrink-0 ${isSparkling ? 'animate-sparkle border-red-500 shadow-md' : 'bg-sky-200 shadow-sm'}`}
                                />
                              );
                            })()}
                            <textarea
                              rows="3"
                              placeholder="메모"
                              value={logs[index]?.memo || ""}
                              onChange={(e) => handleLogChange(index, 'memo', e.target.value)}
                              onBlur={handleInputBlur}
                              disabled={isDataLoading || isInfoMissing}
                              className={`flex-1 min-w-0 ${isCompact ? 'py-1.5 sm:py-2' : 'py-2 sm:py-2.5 md:py-3'} px-3 md:px-4 border border-gray-400 rounded-xl bg-pink-50 outline-none font-bold text-gray-900 placeholder-gray-500 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all text-[18px] md:text-[22px] leading-tight resize-none`}
                            />
                          </div>

                          {selectedTeam === '취업팀' && (
                            <SignaturePad
                              onSave={(base64) => handleLogChange(index, 'location', base64)}
                              onTriggerSave={(base64) => performAutoSave(index, base64)}
                              onRefresh={() => setRefreshTrigger(prev => prev + 1)}
                              disabled={isDataLoading || !logs[index]?.student?.trim()}
                              currentUrl={logs[index]?.location}
                              isDoubleHeight={studentNames.length >= 2}
                              forceSign={validationErrorIndex === index && validationErrorType === 'signature'}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button type="submit" disabled={isDataLoading || !hasChanges} className={`w-full py-4 md:py-5 mt-4 md:mt-6 font-bold rounded-xl text-2xl md:text-3xl text-white shadow-lg transition-all active:scale-95 flex items-center justify-center touch-manipulation ${(isDataLoading || !hasChanges) ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#3366ff] hover:bg-[#1e3a8a]'}`}>
                {isSubmitting ? <><Clock className="w-6 h-6 mr-2 animate-spin" />저장 중...</> : <><SaveIcon className="w-6 h-6 mr-2" />데이터베이스에 저장</>}
              </button>
            </form>
          </div>
        </section>
      </main>

      {showValidationError && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] px-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col max-w-sm w-full overflow-hidden">
            <div className="bg-red-500 py-4 px-6 text-center flex items-center justify-center gap-2">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              <h3 className="text-xl font-bold text-white tracking-wide">입력 확인</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-800 font-bold text-[17px] sm:text-[19px] mb-6 text-center leading-relaxed whitespace-pre-line">
                {validationErrorMsg}
              </p>
              <button
                onClick={() => {
                  setShowValidationError(false);
                  if (validationErrorIndex !== null) {
                    setTimeout(() => {
                      const el = document.getElementById(`log-card-${validationErrorIndex}`);
                      if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }, 100);
                  }
                }}
                className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-bold text-[18px] shadow-sm active:scale-95 touch-manipulation transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {showSavePopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col max-w-sm w-full animate-fadeIn overflow-hidden">
            <div className="bg-blue-600 py-4 px-6 text-center">
              <h3 className="text-2xl font-bold text-white tracking-wide">
                {isSaveComplete ? "데이터 저장 완료" : "구글 시트에 저장 중..."}
              </h3>
            </div>
            <div className="p-6">
              <div className="flex flex-col gap-4 mb-6 max-h-[50vh] overflow-y-auto pr-2">
                {saveProgress.map((prog, idx) => {
                  if (prog.isRepeat) {
                    return (
                      <div key={idx} className="flex justify-between items-center w-full pb-4 border-b border-dashed border-gray-200 last:border-0 last:pb-0">
                        <div className="flex flex-col gap-1.5 flex-1 pr-2">
                          <span className="text-blue-800 font-extrabold text-[19px] tracking-tight">
                            <span className="text-gray-500 mr-1.5 font-bold text-[19px]">{prog.dateDisplay}</span>
                            {prog.student}
                          </span>
                          <span className="text-indigo-600 font-bold text-lg leading-relaxed">
                            {prog.timeDisplay}
                          </span>
                        </div>
                        <span className={`text-base w-[100px] text-center font-bold py-1.5 rounded-md whitespace-nowrap shrink-0 border shadow-sm ${prog.status === '저장 완료' ? 'bg-green-600 border-green-700 text-white' : prog.status === '저장 실패' ? 'bg-red-50 border-red-200 text-red-700' : prog.status === '변경 없음' ? 'bg-gray-50 border-gray-200 text-gray-500' : 'bg-orange-50 border-orange-200 text-orange-700 animate-pulse'}`}>
                          {prog.status}
                        </span>
                      </div>
                    );
                  }

                  const att = prog.attendance || "";
                  let attColor = "text-gray-700";
                  if (att.includes("결석") || att.includes("취소")) {
                    attColor = "text-red-600 font-bold";
                  } else if (att.includes("선생님휴가")) {
                    attColor = "text-gray-400 font-bold";
                  }

                  return (
                    <div key={idx} className="flex justify-between items-center w-full pb-4 border-b border-dashed border-gray-200 last:border-0 last:pb-0">
                      <div className="flex flex-col gap-1.5 flex-1 pr-2">
                        <span className="text-blue-800 font-extrabold text-[19px] tracking-tight">
                          {prog.student}
                        </span>
                        <span className={`text-lg font-bold break-all leading-relaxed ${attColor}`}>
                          {prog.attendance}
                        </span>
                        {selectedTeam === '취업팀' && prog.location && (prog.location.startsWith('data:image') || prog.location.startsWith('http') || prog.location.includes('drive.google.com') || prog.location.startsWith('=')) && (
                          <div className={`mt-1.5 border border-blue-200 rounded-lg bg-sky-100 overflow-hidden w-24 flex items-center justify-center shadow-sm ${prog.isDoubleHeight ? 'h-[88px]' : 'h-10'}`}>
                            <img src={getDirectImageUrl(prog.location)} alt="싸인" className="max-w-full max-h-full object-contain" />
                          </div>
                        )}
                      </div>
                      <span className={`text-base w-[100px] text-center font-bold py-1.5 rounded-md whitespace-nowrap shrink-0 border shadow-sm ${prog.status === '저장 완료' ? 'bg-green-600 border-green-700 text-white' : prog.status === '저장 실패' ? 'bg-red-50 border-red-200 text-red-700' : prog.status === '변경 없음' ? 'bg-gray-50 border-gray-200 text-gray-500' : 'bg-orange-50 border-orange-200 text-orange-700 animate-pulse'}`}>
                        {prog.status}
                      </span>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => setShowSavePopup(false)}
                disabled={!isSaveComplete}
                className={`w-full py-3 rounded-xl font-bold text-xl shadow-md transition-colors touch-manipulation ${isSaveComplete ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
              >
                {isSaveComplete ? "확인" : "잠시만 기다려주세요..."}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRepeatConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col max-w-sm w-full animate-fadeIn overflow-hidden">
            <div className="bg-indigo-600 py-4 px-6 text-center">
              <h3 className="text-xl font-bold text-white tracking-wide">확인해 주세요!</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-800 font-bold text-[18px] sm:text-[20px] mb-3 text-center leading-relaxed">
                아래 <span className="text-indigo-600 text-[18px] sm:text-[20px]">{repeatTargetDates.length}</span>일 동안의 스케줄에<br />
                [학생이름]과 [장소]를<br />복제할까요?
              </p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 max-h-[25vh] overflow-y-auto">
                {repeatTargetDates.map(d => (
                  <div key={d} className="text-[18px] sm:text-[20px] font-bold text-blue-600 text-center py-1">
                    - {d} ({getDayName(d)})
                  </div>
                ))}
              </div>
              <p className="text-red-600 text-[18px] sm:text-[20px] font-bold mb-6 text-center leading-tight">
                ※ 주의: 기존에 작성된 출결기록과 메모는<br /> 모두 지워집니다.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRepeatConfirm(false)}
                  className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-bold text-[18px] sm:text-[20px] shadow-sm active:scale-95 touch-manipulation transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={executeRepeatSchedule}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-[18px] sm:text-[20px] shadow-md active:scale-95 touch-manipulation transition-colors"
                >
                  일정 복제 시작
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedStudentDates && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-2 sm:px-4" onClick={() => setSelectedStudentDates(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[80vh] animate-fadeIn" onClick={e => e.stopPropagation()}>
            <div className="bg-purple-600 text-white py-3 px-4 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-[18px] sm:text-[20px]">{selectedStudentDates.name}님의 출석 일자 <span className="text-purple-200 text-[15px] sm:text-[16px]">({selectedStudentDates.count}회)</span></h3>
              <button onClick={() => setSelectedStudentDates(null)} className="text-white hover:text-gray-200 active:scale-90 transition-transform">
                <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <div className="p-3 sm:p-4 overflow-y-auto">
              <div className="grid grid-cols-4 gap-2 sm:gap-3">
                {selectedStudentDates.dates.map((d, idx) => {
                  const today = new Date();
                  const isToday = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
                  return (
                    <div key={idx} className={`${isToday ? 'bg-purple-300 border-purple-500 shadow-md text-purple-950' : 'bg-purple-50 border-purple-200 shadow-sm text-purple-900'} rounded-lg py-2.5 sm:py-3 px-0.5 sm:px-1 text-center text-[13.5px] min-[360px]:text-[15.5px] sm:text-[18px] font-bold flex justify-center items-center whitespace-nowrap tracking-tighter sm:tracking-normal`}>
                      {d.getMonth() + 1}/{d.getDate()} ({['일', '월', '화', '수', '목', '금', '토'][d.getDay()]})
                    </div>
                  );
                })}
              </div>
              {selectedStudentDates.dates.length === 0 && (
                <div className="text-center text-gray-500 py-4 font-bold text-[16px] sm:text-[18px]">출석 기록이 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
