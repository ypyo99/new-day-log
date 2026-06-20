// 시간표 작성

import React, { useState, useEffect, useRef } from 'react';
import { supabaseClient } from '../utils/supabase';
import {
  getSavedItem,
  setSavedItem,
  getTeacherGroup,
  getTeacherSortWeight
} from '../utils/helpers';
import ExcelJS from 'exceljs';
import { Home, LucideCalendar } from './Icons';

export default function AutoScheduleApp({ onNavigateBack }) {
  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      return window.localStorage.getItem('sungdong_admin_logged_in') === 'true';
    } catch (e) {
      return false;
    }
  });
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdInput, setPwdInput] = useState("");
  const [pwdError, setPwdError] = useState(false);
  const pwdInputRef = useRef(null);

  useEffect(() => {
    try {
      if (showPwdModal && pwdInputRef.current) {
        pwdInputRef.current.focus();
      }
    } catch (e) {
      console.error("Focus useEffect Error:", e);
    }
  }, [showPwdModal]);

  const handleAdminClick = () => {
    try {
      if (isAdmin) {
        setIsAdmin(false);
        window.localStorage.removeItem('sungdong_admin_logged_in');
      } else {
        setShowPwdModal(true);
        setPwdInput("");
        setPwdError(false);
      }
    } catch (e) {
      alert("handleAdminClick 오류: " + e.message);
    }
  };

  const checkPassword = () => {
    try {
      if (pwdInput === import.meta.env.VITE_ADMIN_PASSWORD) {
        setIsAdmin(true);
        window.localStorage.setItem('sungdong_admin_logged_in', 'true');
        setShowPwdModal(false);
      } else {
        setPwdError(true);
      }
    } catch (e) {
      alert("checkPassword 오류: " + e.message);
    }
  };

  const [startDate, setStartDate] = useState(() => {
    const saved = getSavedItem('sungdong_auto_startDate', '');
    if (saved) return saved;
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const saved = getSavedItem('sungdong_auto_endDate', '');
    if (saved) return saved;
    const d = new Date();
    d.setMonth(d.getMonth() + 2);
    d.setDate(0);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [team, setTeam] = useState(() => getSavedItem('sungdong_auto_team', '1팀'));
  const [analyzing, setAnalyzing] = useState(false);
  const [baseWeekDates, setBaseWeekDates] = useState([]);
  const [draftRecords, setDraftRecords] = useState([]);
  const [scheduleTemplates, setScheduleTemplates] = useState({}); // 요일별 미리보기용 템플릿
  const [saving, setSaving] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [notice, setNotice] = useState("");
  const [previewFilter, setPreviewFilter] = useState("ALL");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [editCell, setEditCell] = useState(null); // { teacherName, dayNum, shift, student, location }
  const [lastBackupId, setLastBackupId] = useState(() => getSavedItem('sungdong_auto_lastBackupId', null));
  const [restoring, setRestoring] = useState(false);
  const [triggerAnalyze, setTriggerAnalyze] = useState(false);

  useEffect(() => {
    if (triggerAnalyze && startDate && endDate && isAdmin) {
      handleAnalyze();
      setTriggerAnalyze(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerAnalyze, startDate, endDate, isAdmin, team]);

  useEffect(() => { setSavedItem('sungdong_auto_lastBackupId', lastBackupId); }, [lastBackupId]);

  useEffect(() => { setSavedItem('sungdong_auto_startDate', startDate); }, [startDate]);
  useEffect(() => { setSavedItem('sungdong_auto_endDate', endDate); }, [endDate]);
  useEffect(() => { setSavedItem('sungdong_auto_team', team); }, [team]);

  const getPrevWeekDays = (startDateStr) => {
    const d = new Date(startDateStr);
    d.setDate(d.getDate() - 7);

    const day = d.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diffToMonday);

    const weekdays = [];
    for (let i = 0; i < 5; i++) {
      const current = new Date(d);
      current.setDate(d.getDate() + i);
      const yyyy = current.getFullYear();
      const mm = String(current.getMonth() + 1).padStart(2, '0');
      const dd = String(current.getDate()).padStart(2, '0');
      weekdays.push(`${yyyy}-${mm}-${dd}`);
    }
    return weekdays;
  };

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

  const getShiftWeight = (shift) => {
    const m = shift.match(/(\d+):(\d+)/);
    return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
  };

  const getGroupWeight = (groupName) => {
    if (!groupName) return 99;
    if (groupName.includes("1조") || groupName.includes("A조")) return 1;
    if (groupName.includes("2조") || groupName.includes("B조")) return 2;
    if (groupName.includes("3조") || groupName.includes("C조")) return 3;
    return 99;
  };

  const handleAnalyze = async () => {
    if (!startDate || !endDate) {
      alert("시작일자와 종료일자를 선택해주세요.");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      alert("시작일자는 종료일자보다 빠르거나 같아야 합니다.");
      return;
    }

    setAnalyzing(true);
    setNotice("");
    setDraftRecords([]);
    setScheduleTemplates({});
    setPreviewFilter("ALL");
    setProgressMsg("선생님 명단 및 복제 기준 주간 계산 중...");

    try {
      const { data: teacherList, error: tErr } = await supabaseClient
        .from('teachers')
        .select('*')
        .eq('team', team);

      if (tErr) throw tErr;
      if (!teacherList || teacherList.length === 0) {
        setNotice(`⚠️ ${team}에 등록된 선생님이 없습니다.`);
        setAnalyzing(false);
        return;
      }

      // 공휴일/간담회 등 holidays DB 데이터 가져오기
      setProgressMsg("공휴일 데이터 가져오는 중...");
      const { data: holidaysList, error: hErr } = await supabaseClient
        .from('holidays')
        .select('*');

      if (hErr) {
        console.warn("Holidays table query error:", hErr);
      }
      const holidays = holidaysList || [];

      // 공휴일 여부를 판별하는 안전한 도우미 함수
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

      const teacherNames = teacherList.map(t => t.name.trim());
      const baseDates = getPrevWeekDays(startDate);
      setBaseWeekDates(baseDates);

      setProgressMsg("기준 주간의 수업 기록 분석 중...");
      let baseLogs = [];
      const { data, error } = await supabaseClient
        .from('daily_logs')
        .select('*')
        .eq('team', team)
        .in('log_date', baseDates);
      if (error) throw error;
      baseLogs = data || [];

      const templates = {};
      teacherNames.forEach(name => {
        templates[name] = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} };
      });

      const previewTemplates = {};

      setProgressMsg("공휴일 및 휴강 일정 역추적 분석 중...");
      const EXCLUDE_KEYWORDS = ["공휴일", "대체공휴일", "근로자의날", "어린이날", "현충일", "광복절", "개천절", "한글날", "석가탄신일", "부처님오신날", "성탄절", "제헌절", "추석", "설날", "신정", "선거일", "간담회", "소양교육", "자체학습", "휴가", "휴강", "준비", "자체학습"];

      for (const teacherName of teacherNames) {
        const teacherObj = teacherList.find(t => t.name.trim() === teacherName);
        const tGroup = teacherObj.group_name || getTeacherGroup(team, teacherName) || "기타";
        const shifts = [teacherObj.shift1, teacherObj.shift2, teacherObj.shift3].map(s => (s || "").trim()).filter(Boolean);

        previewTemplates[teacherName] = {
          group: tGroup,
          shifts: shifts,
          days: { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} }
        };

        for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek++) {
          const baseDate = baseDates.find(dateStr => {
            const d = new Date(dateStr);
            return d.getDay() === dayOfWeek;
          });

          if (!baseDate) continue;

          let dayRecords = baseLogs.filter(l => l.teacher.trim() === teacherName && l.log_date === baseDate);

          let hasReal = dayRecords.some(r => {
            const combined = ((r.student || "") + (r.location || "")).replace(/\s+/g, "");
            return combined && !EXCLUDE_KEYWORDS.some(kw => combined.includes(kw));
          });

          let targetRecords = dayRecords;

          if (!hasReal) {
            targetRecords = []; // 정상 수업이 없는 경우 과거 기록을 추적하지 않고 템플릿을 비움
          }

          shifts.forEach(shift => {
            const match = targetRecords.find(r => r.shift.trim() === shift);
            const student = match ? (match.student || "") : "";
            const location = match ? (match.location || "") : "";

            templates[teacherName][dayOfWeek][shift] = {
              student: student,
              location: location
            };

            previewTemplates[teacherName].days[dayOfWeek][shift] = {
              student: student,
              location: location
            };
          });
        }
      }

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

      setProgressMsg("대상 기간 시간표 드래프트 작성 중...");
      const targetDates = getWeekdaysInRange(startDate, endDate);
      const drafts = [];

      // 월별 전역 평일(근무일) 카운트 초기화
      const globalWorkDaysCount = {};

      targetDates.forEach(dateStr => {
        const d = new Date(dateStr);
        const dayOfWeek = d.getDay();
        const isHol = isHoliday(dateStr);
        const holidayObj = getHolidayObj(dateStr);
        const monthKey = dateStr.substring(0, 7); // 예: "2026-06"

        // 전역 근무일수 계산
        if (globalWorkDaysCount[monthKey] === undefined) {
          globalWorkDaysCount[monthKey] = 0;
        }
        globalWorkDaysCount[monthKey] += 1;
        const isGlobalOver20 = globalWorkDaysCount[monthKey] > 20;

        teacherList.forEach(t => {
          const teacherName = t.name.trim();
          const shifts = [t.shift1, t.shift2, t.shift3].map(s => (s || "").trim()).filter(Boolean);

          // 이 교사가 원래 이 요일에 근무하는 교사인가?
          const isMyWorkingDay = workingDaysOfWeek[teacherName]?.has(dayOfWeek);

          shifts.forEach(shift => {
            let student = "";
            let location = "";
            let status = "";

            if (isGlobalOver20) {
              // 전역 근무일 20일 초과: 모두 블랭크 처리
              student = "";
              location = "";
              status = "";
            } else if (isHol) {
              // 20일 이내이면서 공휴일/간담회: 요일 무관하게 공휴일 정보 입력
              student = holidayObj ? holidayObj.name : "공휴일";
              location = holidayObj ? holidayObj.content1 : "";
              status = holidayObj ? holidayObj.content2 : "";
            } else if (isMyWorkingDay) {
              // 20일 이내이면서 정상 수업일: 기존 수업 데이터
              const temp = templates[teacherName][dayOfWeek]?.[shift];
              student = temp ? temp.student : "";
              const loc = temp ? temp.location : "";
              const isUrl = loc.startsWith("http");
              location = isUrl ? "" : (loc.trim() || "복지관");
              status = "";
            } else {
              // 원래 근무 요일이 아닌 경우: 블랭크 데이터
              student = "";
              location = "";
              status = "";
            }

            const isValid20Days = !isGlobalOver20;

            drafts.push({
              team: team,
              log_date: dateStr,
              teacher: teacherName,
              shift: shift,
              student: student,
              location: location,
              status: status,
              is_20days: isValid20Days
            });
          });
        });
      });

      drafts.sort((a, b) => {
        if (a.log_date !== b.log_date) return a.log_date.localeCompare(b.log_date);

        const groupA = getTeacherGroup(team, a.teacher);
        const groupB = getTeacherGroup(team, b.teacher);
        const weightA = getGroupWeight(groupA);
        const weightB = getGroupWeight(groupB);
        if (weightA !== weightB) return weightA - weightB;

        if (a.teacher !== b.teacher) {
          return getTeacherSortWeight(team, a.teacher) - getTeacherSortWeight(team, b.teacher);
        }

        return getShiftWeight(a.shift) - getShiftWeight(b.shift);
      });

      setDraftRecords(drafts);
      setScheduleTemplates(previewTemplates);
      if (drafts.length === 0) {
        setNotice("⚠️ 작성할 수 있는 일정이 존재하지 않습니다.");
      }
    } catch (err) {
      console.error(err);
      setNotice("⚠️ 분석 중 오류가 발생했습니다: " + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCellEdit = (teacherName, dayNum, shift, newStudent, newLocation) => {
    setScheduleTemplates(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      if (!updated[teacherName].days[dayNum]) updated[teacherName].days[dayNum] = {};
      updated[teacherName].days[dayNum][shift] = { student: newStudent, location: newLocation };
      return updated;
    });
    setDraftRecords(prev => prev.map(r => {
      if (r.teacher !== teacherName || r.shift !== shift) return r;
      const d = new Date(r.log_date);
      if (d.getDay() !== dayNum) return r;
      return { ...r, student: newStudent, location: newLocation };
    }));
    setEditCell(null);
  };

  const handleSave = async () => {
    if (draftRecords.length === 0) return;
    setShowConfirmModal(false);
    setSaving(true);
    setProgressMsg("시간표 저장을 준비 중입니다...");

    try {
      const backupId = Date.now().toString();
      setProgressMsg("기존 데이터 백업 중...");

      // Supabase 1000개 제한을 우회하기 위해 pagination 적용
      let existingData = [];
      let start = 0;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: chunk, error: fetchErr } = await supabaseClient
          .from('daily_logs')
          .select('*')
          .eq('team', team)
          .gte('log_date', startDate)
          .lte('log_date', endDate)
          .order('log_date', { ascending: true })
          .order('id', { ascending: true })
          .range(start, start + limit - 1);

        if (fetchErr) throw fetchErr;

        if (chunk && chunk.length > 0) {
          existingData = existingData.concat(chunk);
          if (chunk.length < limit) {
            hasMore = false;
          } else {
            start += limit;
          }
        } else {
          hasMore = false;
        }
      }

      if (existingData && existingData.length > 0) {
        const backupData = existingData.map(r => ({
          backup_id: backupId,
          original_id: r.id,
          team: r.team,
          log_date: r.log_date,
          teacher: r.teacher,
          shift: r.shift,
          student: r.student,
          location: r.location,
          status: r.status
        }));

        const bChunkSize = 500;
        for (let i = 0; i < backupData.length; i += bChunkSize) {
          const bChunk = backupData.slice(i, i + bChunkSize);
          const { error: backupErr } = await supabaseClient
            .from('daily_logs_backup')
            .insert(bChunk);
          if (backupErr) {
            console.error("Backup Error:", backupErr);
            throw new Error("기존 데이터 백업 중 오류가 발생했습니다. (daily_logs_backup 테이블이 존재하는지 확인해주세요)");
          }
        }
      }
      setLastBackupId(backupId);

      setProgressMsg("기존 일정 삭제 중...");
      const { error: deleteErr } = await supabaseClient
        .from('daily_logs')
        .delete()
        .eq('team', team)
        .gte('log_date', startDate)
        .lte('log_date', endDate);

      if (deleteErr) {
        console.error("Delete Error:", deleteErr);
        throw new Error("기존 데이터를 삭제하는 중 오류가 발생했습니다.");
      }

      const chunkSize = 500;
      let saved = 0;
      for (let i = 0; i < draftRecords.length; i += chunkSize) {
        const chunk = draftRecords.slice(i, i + chunkSize).map(record => {
          if (!record.student || record.student.trim() === "") {
            return { ...record, location: "" };
          }
          return record;
        });
        saved = Math.min(i + chunkSize, draftRecords.length);
        setProgressMsg(`Supabase에 시간표 반영 중... (${saved} / ${draftRecords.length}건)`);

        const { error } = await supabaseClient
          .from('daily_logs')
          .upsert(chunk, { onConflict: 'team,log_date,teacher,shift' });

        if (error) throw error;
      }

      setProgressMsg("저장 완료!");
      setSaving(false);
      setSuccessMessage(`${team}의 시간표가 성공적으로 저장되었습니다.`);
      setShowSuccessModal(true);
    } catch (err) {
      console.error(err);
      setSaving(false);
      setProgressMsg("");
      setNotice("⚠️ 시간표 저장 중 오류가 발생했습니다: " + err.message);
    }
  };

  const handleUndo = async () => {
    if (!lastBackupId) return;
    if (!window.confirm("가장 최근에 저장한 시간표 작성을 취소하고 이전 상태로 되돌리시겠습니까?")) return;

    setRestoring(true);
    setProgressMsg("이전 상태로 복원 중입니다...");
    try {
      const { error: delErr } = await supabaseClient
        .from('daily_logs')
        .delete()
        .eq('team', team)
        .gte('log_date', startDate)
        .lte('log_date', endDate);
      if (delErr) throw delErr;

      // 백업 데이터 pagination 조회
      let backupData = [];
      let start = 0;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: chunk, error: fetchErr } = await supabaseClient
          .from('daily_logs_backup')
          .select('*')
          .eq('backup_id', lastBackupId)
          .order('original_id', { ascending: true })
          .range(start, start + limit - 1);

        if (fetchErr) throw fetchErr;

        if (chunk && chunk.length > 0) {
          backupData = backupData.concat(chunk);
          if (chunk.length < limit) {
            hasMore = false;
          } else {
            start += limit;
          }
        } else {
          hasMore = false;
        }
      }

      if (backupData && backupData.length > 0) {
        const restoreData = backupData.map(r => ({
          id: r.original_id,
          team: r.team,
          log_date: r.log_date,
          teacher: r.teacher,
          shift: r.shift,
          student: r.student,
          location: r.location,
          status: r.status
        }));

        const chunkSize = 500;
        for (let i = 0; i < restoreData.length; i += chunkSize) {
          const chunk = restoreData.slice(i, i + chunkSize);
          const { error: insErr } = await supabaseClient
            .from('daily_logs')
            .upsert(chunk);
          if (insErr) throw insErr;
        }
      }

      await supabaseClient.from('daily_logs_backup').delete().eq('backup_id', lastBackupId);
      setLastBackupId(null);
      alert("이전 시간표 상태로 성공적으로 되돌렸습니다!");
      setDraftRecords([]);
      setScheduleTemplates({});
    } catch (err) {
      console.error(err);
      alert("되돌리기 실패: " + err.message);
    } finally {
      setRestoring(false);
      setProgressMsg("");
    }
  };

  const EXCLUDE_KEYWORDS = ["공휴일", "대체공휴일", "근로자의날", "어린이날", "현충일", "광복절", "개천절", "한글날", "석가탄신일", "부처님오신날", "성탄절", "제헌절", "추석", "설날", "신정", "선거일", "간담회", "소양교육", "자체학습", "휴가", "휴강", "준비", "자체학습"];

  const sortedTeacherNames = Object.keys(scheduleTemplates).sort((a, b) => {
    const groupA = scheduleTemplates[a].group;
    const groupB = scheduleTemplates[b].group;
    const weightA = getGroupWeight(groupA);
    const weightB = getGroupWeight(groupB);
    if (weightA !== weightB) return weightA - weightB;

    return getTeacherSortWeight(team, a) - getTeacherSortWeight(team, b);
  });

  const filteredTeachers = previewFilter === "ALL"
    ? sortedTeacherNames
    : sortedTeacherNames.filter(name => name === previewFilter);

  const fileInputRef = useRef(null);

  const handleApplyAssistantClick = () => {
    if (draftRecords.length === 0) {
      alert("먼저 '주간 시간표 보기'를 통해 시간표 초안을 작성해 주세요.");
      return;
    }
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setProgressMsg("보조강사 엑셀 데이터를 가져오는 중...");
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.worksheets[0];

      const assistantData = [];
      worksheet.eachRow({ includeEmpty: false }, function (row, rowNumber) {
        if (rowNumber < 3) return; // 1~2행은 헤더이므로 건너뜀
        const vals = row.values;
        // [실제 엑셀 컬럼 구조 확인 후 수정]
        // vals[1]: 순번
        // vals[2]: 과목명 (예: "스마트폰/키오스크 기초 1반")
        // vals[3]: 일정   (예: "화(10:00~10:50)")
        // vals[4]: 장소   (예: "3층 평생교육실1")
        // vals[5]: 배정팀 (예: "2—4" → 2팀 4조)
        // vals[6]: 강사명 (예: "권용의/김향숙")
        // 아이폰/맥 환경에서 한글 자음/모음이 분리되는 현상(NFD)을 방지하기 위해 normalize('NFC') 적용
        const subject = vals[2] ? String(vals[2]).normalize('NFC').trim() : '';
        const scheduleStr = vals[3] ? String(vals[3]).normalize('NFC').trim() : '';
        const assignTeam = vals[5] ? String(vals[5]).normalize('NFC').trim() : '';

        if (subject && scheduleStr && assignTeam) {
          assistantData.push({ subject, scheduleStr, assignTeam });
        }
      });

      let updateCount = 0;
      const matchedUpdates = [];

      const newDrafts = draftRecords.map(r => {

        // 20일 근무 초과 등으로 is_20days가 false인 날짜는 보조강사 일정도 배정하지 않음
        if (r.is_20days === false) return r;

        const teacherGroup = getTeacherGroup(r.team, r.teacher);
        if (!teacherGroup || teacherGroup === "기타") return r;

        let myTeamNum = "";
        let myGroupNum = "";

        if (r.team === "취업팀") {
          myTeamNum = "취업팀";
          myGroupNum = teacherGroup.trim(); // "오전" or "오후"
        } else {
          const teamNumMatch = r.team.match(/(\d+)팀/);
          const groupNumMatch = teacherGroup.match(/(\d+)조/);
          if (!teamNumMatch || !groupNumMatch) return r;
          myTeamNum = teamNumMatch[1];
          myGroupNum = groupNumMatch[1];
        }

        const daysOfWeek = ['일', '월', '화', '수', '목', '금', '토'];
        // 스마트폰(특히 iOS Safari)에서 new Date('YYYY-MM-DD') 파싱 오류를 방지하기 위해 수동 파싱 적용
        const [year, month, day] = r.log_date.split('-');
        const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
        const dayNum = dateObj.getDay();
        const myDayStr = daysOfWeek[dayNum];

        let newStudent = r.student;
        let matched = false;

        assistantData.forEach(d => {
          let excelTeamNum = "";
          let excelGroupNum = "";

          if (d.assignTeam.includes("취업팀")) {
            excelTeamNum = "취업팀";
            if (d.assignTeam.includes("오전")) excelGroupNum = "오전";
            else if (d.assignTeam.includes("오후")) excelGroupNum = "오후";
          } else {
            const tMatch = d.assignTeam.match(/(\d+)[^\d]+(\d+)/);
            if (tMatch) {
              excelTeamNum = tMatch[1];
              excelGroupNum = tMatch[2];
            }
          }

          if (excelTeamNum && excelGroupNum && myTeamNum === excelTeamNum && myGroupNum === excelGroupNum) {
            // 정규식을 유연하게 수정하여 '월요일(09:30~10:30)', '월 (09:30~10:30)' 등 공백을 허용
            const sMatch = d.scheduleStr.match(/([가-힣]+)\s*\(\s*([^)]+)\s*\)/);
            if (sMatch) {
              // '요일' 글자를 제거하여 '월요일'과 '월'이 같아지도록 통일
              const excelDay = sMatch[1].replace('요일', '').trim();
              const excelTime = sMatch[2];

              if (excelDay === myDayStr) {
                function parseTime(tStr) {
                  const m = tStr.match(/(\d+):(\d+)/);
                  if (!m) return -1;
                  return parseInt(m[1]) * 60 + parseInt(m[2]);
                }

                const eParts = excelTime.split('~');
                const eStart = parseTime(eParts[0]);
                const eEnd = eParts.length > 1 ? parseTime(eParts[1]) : eStart + 60;

                const sParts = r.shift.split('~');
                const sStart = parseTime(sParts[0]);
                const sEnd = sParts.length > 1 ? parseTime(sParts[1]) : sStart + 60;

                if (Math.max(eStart, sStart) < Math.min(eEnd, sEnd)) {
                  newStudent = d.subject;
                  matched = true;
                }
              }
            }
          }
        });

        if (matched) {
          updateCount++;
          matchedUpdates.push({
            teacher: r.teacher,
            dayNum: dayNum,
            shift: r.shift,
            student: newStudent
          });
          return { ...r, student: newStudent };
        }
        return r;
      });

      // ===== 🔍 디버그용 1: 엑셀 3번째 행 전체 컬럼 값 확인 =====
      let allColsMsg = `📋 엑셀 전체 컬럼 확인 (3번째 행)\n`;
      worksheet.eachRow({ includeEmpty: false }, function (row, rowNumber) {
        if (rowNumber === 3) {
          const vals = row.values;
          for (let i = 1; i <= 12; i++) {
            allColsMsg += `[${i}열]: "${vals[i] !== undefined && vals[i] !== null ? String(vals[i]).normalize('NFC').trim() : '없음'}"\n`;
          }
        }
      });
      alert(allColsMsg);
      // ===== 🔍 디버그용 1 끝 =====

      // ===== 🔍 디버그용 2: 엑셀 첫 행 vs 시간표 첫 번째 데이터 비교 =====
      const firstExcel = assistantData[0];
      const firstDraft = draftRecords.find(r => r.is_20days !== false);
      let debugMsg = `📋 엑셀 데이터 읽음: ${assistantData.length}건\n`;
      if (firstExcel) {
        debugMsg += `\n[엑셀 첫 번째 행]\n과목: "${firstExcel.subject}"\n일정: "${firstExcel.scheduleStr}"\n배정팀: "${firstExcel.assignTeam}"`;
        const tMatch = firstExcel.assignTeam.match(/(\d+)[^\d]+(\d+)/);
        debugMsg += `\n  → 팀매칭: ${tMatch ? `팀${tMatch[1]}, 조${tMatch[2]}` : '실패'}`;
        const sMatch = firstExcel.scheduleStr.match(/([가-힣]+)\s*\(\s*([^)]+)\s*\)/);
        debugMsg += `\n  → 요일매칭: ${sMatch ? `요일="${sMatch[1]}", 시간="${sMatch[2]}"` : '실패'}`;
      }
      if (firstDraft) {
        const [y, m, d2] = firstDraft.log_date.split('-');
        const dObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d2, 10));
        const daysOfWeekDebug = ['일', '월', '화', '수', '목', '금', '토'];
        const tg = getTeacherGroup(firstDraft.team, firstDraft.teacher);
        const teamM = firstDraft.team.match(/(\d+)팀/);
        const groupM = tg ? tg.match(/(\d+)조/) : null;
        debugMsg += `\n\n[시간표 첫 번째 데이터]\n선생님: "${firstDraft.teacher}"\n팀: "${firstDraft.team}" → 팀번호: ${teamM ? teamM[1] : '없음'}\n그룹: "${tg}" → 조번호: ${groupM ? groupM[1] : '없음'}\n날짜: "${firstDraft.log_date}" → 요일: "${daysOfWeekDebug[dObj.getDay()]}"\n시간: "${firstDraft.shift}"`;
      }
      alert(debugMsg);
      // ===== 🔍 디버그용 2 끝 =====


      if (updateCount > 0) {
        setDraftRecords(newDrafts);

        setScheduleTemplates(prev => {
          const updated = JSON.parse(JSON.stringify(prev));
          matchedUpdates.forEach(m => {
            if (updated[m.teacher] && updated[m.teacher].days[m.dayNum] && updated[m.teacher].days[m.dayNum][m.shift]) {
              updated[m.teacher].days[m.dayNum][m.shift].student = m.student;
            }
          });
          return updated;
        });

        setTimeout(() => {
          alert(`총 ${updateCount}건의 보조강사 일정이 업데이트되었습니다.`);
        }, 100);
      } else {
        setTimeout(() => {
          alert("해당 기간의 주간시간표와 엑셀 데이터 중 일치하는 항목이 없습니다.");
        }, 100);
      }

    } catch (err) {
      console.error(err);
      alert("보조강사 데이터를 적용하는 중 오류가 발생했습니다: " + err.message);
    } finally {
      setProgressMsg("");
      event.target.value = ''; // 같은 파일을 다시 선택할 수 있도록 초기화
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans pb-6">
      <header className="bg-blue-600 text-white px-4 pt-4 pb-7 shadow-lg z-40 flex justify-between items-start relative shrink-0 min-h-[96px]">
        <div className="flex items-center">
          <div className="flex flex-col">
            <div className="flex items-center mb-1">
              <img src="/Logo_of_Seoul.jpg" alt="서울시 로고" className="h-7 bg-white px-2 py-1 rounded-md object-contain mr-2" onError={(e) => e.target.style.display = 'none'} />
              <h1 className="font-black text-xl leading-tight">성동노인종합복지관</h1>
            </div>
            <p className="text-lg font-bold text-yellow-300">디지털교육 서포터즈</p>
            <p className="text-base opacity-95 flex items-center mt-1 font-bold">
              <LucideCalendar className="w-4 h-4 mr-1" /> 시간표 작성
            </p>
          </div>
        </div>

        {/* 담당자 로그인 버튼 영역 */}
        <div className="absolute left-1/2 bottom-1.5 transform -translate-x-1/2 z-50">
          <button
            onClick={handleAdminClick}
            className={`px-6 py-1.5 md:px-10 md:py-2 rounded-lg border border-blue-900 font-bold transition-all active:scale-90 text-sm md:text-base touch-manipulation whitespace-nowrap ${isAdmin ? 'bg-white text-blue-800 shadow' : 'bg-blue-800 text-white hover:bg-blue-900 shadow-md'}`}
          >
            {isAdmin ? '담당자 모드 종료' : '담당자 로그인'}
          </button>
        </div>

        <button
          onClick={onNavigateBack}
          className="text-xs flex flex-col items-center font-bold p-2 rounded-lg shadow-md transition-all touch-manipulation bg-blue-800 text-white opacity-90 active:scale-95"
        >
          <Home className="w-5 h-5 mb-1" /> 처음으로
        </button>
      </header>

      <main className="flex-1 px-4 sm:px-6 md:px-8 pt-4 pb-12 w-full max-w-full lg:max-w-[95%] xl:max-w-[92%] mx-auto overflow-y-auto">
        {!isAdmin ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center shadow-sm w-full mb-6">
            <div className="text-3xl mb-2">💡</div>
            <p className="font-extrabold text-amber-800 text-base">
              시간표 자동 작성을 하시려면 상단의 [담당자 로그인] 버튼을 눌러 인증해 주세요.
            </p>
            <p className="text-xs text-amber-600 mt-2 font-bold">
              * 담당자 전용 인증 후에만 시간표 자동 작성, 미리보기 수정 및 DB 저장이 가능합니다.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-5 mb-6 w-full">
            <div className="flex justify-between items-center border-b pb-3 mb-4 gap-2">
              <h2 className="text-base sm:text-lg font-bold text-gray-800">기간 및 팀 선택</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing || saving}
                  className="px-3 py-1.5 sm:px-6 sm:py-2.5 bg-blue-600 text-white font-extrabold rounded-md shadow-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2 active:scale-95 text-sm sm:text-lg shrink-0"
                >
                  {analyzing ? '분석 중...' : '주간 시간표'}
                </button>
                <button
                  onClick={handleApplyAssistantClick}
                  disabled={analyzing || saving || draftRecords.length === 0}
                  className="px-3 py-1.5 sm:px-6 sm:py-2.5 bg-green-600 text-white font-extrabold rounded-md shadow-md hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2 active:scale-95 text-sm sm:text-lg shrink-0"
                >
                  보조강사 적용
                </button>
                <input
                  type="file"
                  accept=".xlsx"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div>
                <label className="block text-[15px] sm:text-lg font-bold text-gray-700 mb-1">팀 선택</label>
                <select
                  value={team}
                  onChange={(e) => {
                    setTeam(e.target.value);
                    setDraftRecords([]);
                    setScheduleTemplates({});
                    setPreviewFilter("ALL");
                  }}
                  className="w-full p-1.5 sm:p-2.5 text-[16px] sm:text-[21px] border border-sky-300 rounded-xl font-bold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-sky-100 shadow-sm"
                >
                  <option value="1팀">1팀</option>
                  <option value="2팀">2팀</option>
                  <option value="3팀">3팀</option>
                  <option value="취업팀">취업팀</option>
                </select>
              </div>
              <div>
                <label className="block text-[15px] sm:text-lg font-bold text-gray-700 mb-1">시작일자</label>
                <div className="relative">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
                  />
                  <div className="w-full p-1.5 sm:p-2.5 text-[16px] sm:text-[21px] border border-sky-300 rounded-xl font-bold bg-sky-100 flex items-center justify-between text-gray-800 shadow-sm min-h-[31px] sm:min-h-[46px]">
                    <span>{startDate ? startDate.substring(5).replace('-', '/') : ""}</span>
                    <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-gray-400 shrink-0 ml-1" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-[15px] sm:text-lg font-bold text-gray-700 mb-1">종료일자</label>
                <div className="relative">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
                  />
                  <div className="w-full p-1.5 sm:p-2.5 text-[16px] sm:text-[21px] border border-sky-300 rounded-xl font-bold bg-sky-100 flex items-center justify-between text-gray-800 shadow-sm min-h-[31px] sm:min-h-[46px]">
                    <span>{endDate ? endDate.substring(5).replace('-', '/') : ""}</span>
                    <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-gray-400 shrink-0 ml-1" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {(analyzing || saving) && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-6 text-center shadow-sm w-full">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
            <p className="font-bold text-blue-800 text-base">{progressMsg}</p>
          </div>
        )}

        {notice && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-6 text-center text-orange-700 font-bold shadow-sm w-full">
            {notice}
          </div>
        )}

        {!analyzing && draftRecords.length > 0 && (
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-5 animate-fadeIn w-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-3 mb-4 gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-800">작성될 시간표 미리보기 ({team})</h2>
                <p className="text-sm text-blue-600 mt-0.5">
                  기준 주간: {baseWeekDates[0]} ~ {baseWeekDates[baseWeekDates.length - 1]} (월~금)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-bold text-gray-700">선생님 선택:</label>
                <select
                  value={previewFilter}
                  onChange={(e) => setPreviewFilter(e.target.value)}
                  className="p-1.5 border border-gray-300 rounded-lg text-xs bg-white font-bold"
                >
                  <option value="ALL">전체 보기</option>
                  {sortedTeacherNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl mb-6 scrollbar-thin">
              <table className="w-full text-center border-collapse text-xs border border-gray-600">
                <thead>
                  <tr className="bg-blue-50 text-blue-900 font-black border-b border-gray-300 sticky top-0 z-10 text-[13px] md:text-[15px] lg:text-[17px]">
                    <th className="py-3 px-2 border-r border-gray-600 w-16">조</th>
                    <th className="py-3 px-2 border-r border-gray-600 w-24">선생님</th>
                    <th className="py-3 px-2 border-r border-gray-600 w-28">시간</th>
                    <th className="py-3 px-2 border-r border-gray-600">월요일</th>
                    <th className="py-3 px-2 border-r border-gray-600">화요일</th>
                    <th className="py-3 px-2 border-r border-gray-600">수요일</th>
                    <th className="py-3 px-2 border-r border-gray-600">목요일</th>
                    <th className="py-3 px-2 border-r border-gray-600">금요일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-300 font-semibold">
                  {filteredTeachers.map((teacherName) => {
                    const tData = scheduleTemplates[teacherName];
                    const shiftsCount = tData.shifts.length;
                    if (shiftsCount === 0) return null;

                    return tData.shifts.map((shift, sIdx) => {
                      const isLastShift = sIdx === shiftsCount - 1;

                      const renderRowspanGroup = sIdx === 0 ? <td rowSpan={shiftsCount} className="py-3 px-2 border-r border-gray-600 border-b-2 border-gray-400 bg-gray-50/50 font-bold align-middle whitespace-nowrap md:text-[14px] lg:text-[16px]">{tData.group}</td> : null;
                      const renderRowspanTeacher = sIdx === 0 ? <td rowSpan={shiftsCount} className="py-3 px-2 border-r border-gray-600 border-b-2 border-gray-400 bg-gray-50/50 font-bold text-indigo-700 align-middle whitespace-nowrap text-[13px] md:text-[15px] lg:text-[17px]">{teacherName}</td> : null;

                      const daysCells = [1, 2, 3, 4, 5].map(dayNum => {
                        const cell = tData.days[dayNum]?.[shift] || { student: "", location: "" };
                        const student = cell.student.trim();
                        const location = cell.location.trim();

                        const isEditing = editCell
                          && editCell.teacherName === teacherName
                          && editCell.dayNum === dayNum
                          && editCell.shift === shift;

                        const isHighlight = student && (student.includes("보조강사") || student.includes("컴기초") || student.includes("스마트폰"));
                        const isExclude = (student || location) && EXCLUDE_KEYWORDS.some(kw => (student + location).replace(/\s+/g, "").includes(kw));

                        let cellBg = isEditing ? "bg-indigo-50" : "bg-white";
                        if (!isEditing && isHighlight) cellBg = "bg-yellow-100";
                        else if (!isEditing && isExclude) cellBg = "bg-gray-100 text-gray-400";

                        const borderClass = isLastShift ? 'border-b-2 border-gray-400' : 'border-b border-gray-200';

                        const saveCell = (sVal, lVal) => {
                          handleCellEdit(teacherName, dayNum, shift, sVal.trim(), lVal.trim());
                        };

                        return (
                          <td
                            key={dayNum}
                            onClick={() => { if (isAdmin && !isEditing) setEditCell({ teacherName, dayNum, shift, student, location }); }}
                            className={`border-r border-gray-600 ${borderClass} align-top ${cellBg} min-w-[130px] ${isEditing ? 'p-1.5' : `py-3.5 px-2 ${isAdmin ? 'cursor-pointer group' : 'cursor-default'} relative`}`}
                          >
                            {isEditing ? (
                              <div className="flex flex-col gap-1 w-full" onClick={e => e.stopPropagation()}>
                                <input
                                  type="text"
                                  defaultValue={student}
                                  id={`edit-student-${teacherName}-${dayNum}-${shift}`}
                                  placeholder="학생이름 (Enter로 저장)"
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === 'Escape') setEditCell(null);
                                    if (e.key === 'Enter') {
                                      const sInput = document.getElementById(`edit-student-${teacherName}-${dayNum}-${shift}`);
                                      const lInput = document.getElementById(`edit-location-${teacherName}-${dayNum}-${shift}`);
                                      saveCell(sInput ? sInput.value : "", lInput ? lInput.value : "");
                                    }
                                  }}
                                  onBlur={e => {
                                    if (e.relatedTarget && e.relatedTarget.id === `edit-location-${teacherName}-${dayNum}-${shift}`) return;
                                    const sInput = document.getElementById(`edit-student-${teacherName}-${dayNum}-${shift}`);
                                    const lInput = document.getElementById(`edit-location-${teacherName}-${dayNum}-${shift}`);
                                    saveCell(sInput ? sInput.value : "", lInput ? lInput.value : "");
                                  }}
                                  className="w-full px-1.5 py-1 border border-indigo-300 rounded text-[15px] font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                />
                                <input
                                  type="text"
                                  defaultValue={location || "복지관"}
                                  id={`edit-location-${teacherName}-${dayNum}-${shift}`}
                                  placeholder="장소 (Enter로 저장)"
                                  onKeyDown={e => {
                                    if (e.key === 'Escape') setEditCell(null);
                                    if (e.key === 'Enter') {
                                      const sInput = document.getElementById(`edit-student-${teacherName}-${dayNum}-${shift}`);
                                      const lInput = document.getElementById(`edit-location-${teacherName}-${dayNum}-${shift}`);
                                      saveCell(sInput ? sInput.value : "", lInput ? lInput.value : "");
                                    }
                                  }}
                                  onBlur={e => {
                                    if (e.relatedTarget && e.relatedTarget.id === `edit-student-${teacherName}-${dayNum}-${shift}`) return;
                                    const sInput = document.getElementById(`edit-student-${teacherName}-${dayNum}-${shift}`);
                                    const lInput = document.getElementById(`edit-location-${teacherName}-${dayNum}-${shift}`);
                                    saveCell(sInput ? sInput.value : "", lInput ? lInput.value : "");
                                  }}
                                  className="w-full px-1.5 py-1 border border-indigo-300 rounded text-[13px] font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                />
                              </div>
                            ) : (
                              <>
                                <span className="absolute top-1 right-1 opacity-0 group-hover:opacity-50 text-gray-400 text-[10px]">✏️</span>
                                {student ? (
                                  <div className="flex flex-col gap-2.5 my-1">
                                    <div className={`font-black leading-relaxed text-[13px] md:text-[16px] lg:text-[18px] ${isExclude ? 'text-gray-400 font-bold' : 'text-blue-600'}`}>{student}</div>
                                    {location && !location.startsWith("http") && (
                                      <div className="text-[12px] md:text-[14px] lg:text-[16px] text-gray-500 font-bold">{location}</div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-300 font-normal italic md:text-sm lg:text-base">-</span>
                                )}
                              </>
                            )}
                          </td>
                        );
                      });

                      const timeBorderClass = isLastShift ? 'border-b-2 border-gray-400' : 'border-b border-gray-200';

                      return (
                        <tr key={`${teacherName}-${shift}`} className="hover:bg-gray-50/30">
                          {renderRowspanGroup}
                          {renderRowspanTeacher}
                          <td className={`py-3 px-2 border-r border-gray-600 ${timeBorderClass} text-blue-800 font-extrabold whitespace-nowrap bg-blue-50/30 align-middle text-[11px] md:text-[13px] lg:text-[14px]`}>{shift}</td>
                          {daysCells}
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 max-w-4xl mx-auto">
              <p className="text-s text-yellow-900 leading-relaxed font-bold">
                💡 <b>안내</b>: 실제 DB에 저장하기 전에 위의 스케줄이 올바른지 확인해 주세요.
                <br />데이터베이스에 이전에 저장된 스케줄이 있으면 이 일정으로 대체됩니다.
              </p>
            </div>

            <div className="flex justify-end gap-3 max-w-4xl mx-auto">
              {lastBackupId && (
                <button
                  onClick={handleUndo}
                  disabled={restoring || saving}
                  className="px-6 py-3 bg-red-500 text-white font-extrabold rounded-xl shadow-md hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-2 active:scale-95 w-full sm:w-auto justify-center"
                >
                  {restoring ? '복원 중...' : '↩️ 최근 작업 취소하기'}
                </button>
              )}
              <button
                onClick={() => setShowConfirmModal(true)}
                disabled={saving || restoring}
                className="px-6 py-3 bg-indigo-600 text-white font-extrabold rounded-xl shadow-md hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2 active:scale-95 w-full sm:w-auto justify-center"
              >
                {saving ? '시간표 저장 중...' : '이 스케줄로 시간표 작성'}
              </button>
            </div>
          </div>
        )}

        {/* ── 확인 모달 ── */}
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-fadeIn">
              <div className="text-center mb-6">
                <div className="text-4xl mb-3">📋</div>
                <h3 className="text-lg font-black text-gray-800 mb-2">시간표 작성 확인</h3>
                <p className="text-sm text-gray-600 font-bold">이 일정으로 시간표를 작성하시겠습니까?</p>
                <p className="text-sm text-gray-500 font-bold mt-2">📅 {startDate} ~ {endDate}</p>
                <p className="text-sm text-gray-400 mt-1">{team} · 총 {draftRecords.length}건의 일정이 DB에 반영됩니다.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 font-extrabold rounded-xl hover:bg-gray-200 transition-colors"
                >취소</button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-3 bg-indigo-600 text-white font-extrabold rounded-xl hover:bg-indigo-700 transition-colors shadow-md"
                >확인</button>
              </div>
            </div>
          </div>
        )}

        {/* ── 완료 모달 ── */}
        {showSuccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-fadeIn">
              <div className="text-center mb-6">
                <div className="text-5xl mb-3">✅</div>
                <h3 className="text-lg font-black text-gray-800 mb-2">완료!</h3>
                <p className="text-sm text-gray-700 font-bold mb-2">시간표 작성이 완료되었습니다!</p>
                <p className="text-xs text-gray-500 mt-2 whitespace-pre-line leading-relaxed font-semibold">{successMessage}</p>
              </div>
              <button
                onClick={() => { setShowSuccessModal(false); }}
                className="w-full py-3 bg-indigo-600 text-white font-extrabold rounded-xl hover:bg-indigo-700 transition-colors shadow-md"
              >확인</button>
            </div>
          </div>
        )}

      </main>

      {showPwdModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">담당자 암호</h3>
            <input
              ref={pwdInputRef}
              autoFocus
              type="password"
              value={pwdInput}
              onChange={(e) => {
                const val = e.target.value;
                setPwdInput(val);
                if (val === import.meta.env.VITE_ADMIN_PASSWORD) {
                  setIsAdmin(true);
                  window.localStorage.setItem('sungdong_admin_logged_in', 'true');
                  setShowPwdModal(false);
                }
              }}
              onKeyDown={(e) => e.key === 'Enter' && checkPassword()}
              className="w-full border-2 p-3 rounded-lg mb-4 text-center text-2xl tracking-widest outline-none focus:border-blue-500 text-black"
              placeholder="••••"
            />
            {pwdError && <p className="text-red-500 text-xs text-center mb-4">비밀번호가 틀렸습니다.</p>}
            <div className="flex gap-2 text-black">
              <button onClick={() => setShowPwdModal(false)} className="flex-1 py-3 bg-gray-100 rounded-lg font-bold touch-manipulation">취소</button>
              <button onClick={checkPassword} className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold touch-manipulation">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}