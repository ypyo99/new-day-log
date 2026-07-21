import { supabaseClient } from './supabase';

// 로컬/세션 스토리지 헬퍼
export const getSavedItem = (key, defaultValue) => {
  try {
    const item = window.localStorage.getItem(key);
    return item ? item : defaultValue;
  } catch (error) { return defaultValue; }
};

export const setSavedItem = (key, value) => {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch (error) { }
};

export const getSessionItem = (key, defaultValue) => {
  try {
    const item = window.sessionStorage.getItem(key);
    return item ? item : defaultValue;
  } catch (error) { return defaultValue; }
};

export const setSessionItem = (key, value) => {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch (error) { }
};

// 날짜 관련 헬퍼
export const getLocalDateString = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getInitialWeekday = () => {
  const d = new Date();
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return getLocalDateString(d);
};

export const getDayName = (dateStr) => {
  if (!dateStr) return '';
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[new Date(dateStr).getDay()];
};

export const formatStatusIfDate = (val) => {
  if (val === undefined || val === null) return '';
  const strVal = String(val);
  const isIso = /^\d{4}-\d{2}-\d{2}T/.test(strVal);
  const isGmt = /[a-zA-Z]{3} [a-zA-Z]{3} \d{1,2} \d{4}/.test(strVal);
  if (isIso || isGmt) {
    const d = new Date(strVal);
    if (!isNaN(d.getTime())) {
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }
  }
  return strVal.replace(/취소/g, '종료');
};

// 이미지 처리 헬퍼
export const getDirectImageUrl = (url) => {
  if (!url) return '';
  let finalUrl = url.trim();
  if (finalUrl.startsWith('//')) finalUrl = 'https:' + finalUrl;
  if (finalUrl.startsWith('data:')) return finalUrl;

  if (finalUrl.toUpperCase().startsWith('=IMAGE(')) {
    const formulaMatch = finalUrl.match(/IMAGE\s*\(\s*["']?\s*([^"'\s,)]+)/i);
    if (formulaMatch && formulaMatch[1]) finalUrl = formulaMatch[1].replace(/["']/g, '');
  }

  let fileId = null;
  if (finalUrl.includes('drive.google.com/file/d/')) {
    const match = finalUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) fileId = match[1];
  } else if (finalUrl.includes('drive.google.com/uc')) {
    const match = finalUrl.match(/id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) fileId = match[1];
  } else if (finalUrl.includes('drive.google.com/open?id=')) {
    const match = finalUrl.match(/id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) fileId = match[1];
  }

  if (fileId) {
    return `https://lh3.googleusercontent.com/d/${fileId}=w1000`;
  }
  return finalUrl;
};

// 선생님 정보 관리 헬퍼
let globalTeachersList = [];

export const formatTeacherRow = (t) => ({
  id: t.id,
  team: t.team,
  group: t.group_name || '',
  group_name: t.group_name || '',
  seq_num: t.seq_num ?? null,
  name: t.name,
  shift1: t.shift1 || '',
  shift2: t.shift2 || '',
  shift3: t.shift3 || '',
  is_active: t.is_active !== false,
  hire_date: t.hire_date || null,
  resign_date: t.resign_date || null
});

export const setGlobalTeachersList = (list) => {
  globalTeachersList = Array.isArray(list) ? list : [];
  try {
    window.localStorage.setItem('sungdong_teacher_list', JSON.stringify(globalTeachersList));
  } catch (e) { }
};

export const getGlobalTeachersList = () => {
  if (globalTeachersList && globalTeachersList.length > 0) return globalTeachersList;
  try {
    const stored = window.localStorage.getItem('sungdong_teacher_list');
    if (stored) {
      const parsed = JSON.parse(stored);
      globalTeachersList = Array.isArray(parsed) ? parsed : [];
      return globalTeachersList;
    }
  } catch (e) { }
  globalTeachersList = [];
  return globalTeachersList;
};

export const normalizeTeacherName = (name) => (name || "").trim().replace(/[\s\n\r]/g, "");

export const findTeacherRecord = (team, teacherName, teacherList = null) => {
  let list = teacherList || getGlobalTeachersList();
  if (!Array.isArray(list)) list = [];
  const clean = normalizeTeacherName(teacherName);
  return list.find(t => t.team === team && normalizeTeacherName(t.name) === clean) || null;
};

export const getTeacherGroup = (team, teacherName, teacherList = null) => {
  const rec = findTeacherRecord(team, teacherName, teacherList);
  return rec ? (rec.group || rec.group_name || "기타") : "기타";
};

export const isOfficialTeamTeacher = (team, teacherName, teacherList = null) => {
  return !!findTeacherRecord(team, teacherName, teacherList);
};

export const getTeacherShifts = (team, teacherName, teacherList = null) => {
  const rec = findTeacherRecord(team, teacherName, teacherList);
  if (!rec) return [];
  return [rec.shift1, rec.shift2, rec.shift3].filter(Boolean);
};

export const getTeacherDefaultShift = (team, teacherName, groupName = null, teacherList = null) => {
  const rec = findTeacherRecord(team, teacherName, teacherList);
  if (rec && rec.shift1) return rec.shift1;
  const group = groupName || getTeacherGroup(team, teacherName, teacherList);
  if (group === "오후" || team === "3팀") return "13:00~14:00";
  return "9:30~10:30";
};

export const getTeamTeacherNames = (team, teacherList = null) => {
  return (teacherList || getGlobalTeachersList())
    .filter(t => t.team === team && t.is_active !== false)
    .sort((a, b) => getTeacherSortWeight(team, a.name, teacherList) - getTeacherSortWeight(team, b.name, teacherList))
    .map(t => t.name);
};

export const getTeamDefaultShifts = (team, teacherList = null) => {
  const list = (teacherList || getGlobalTeachersList()).filter(t => t.team === team);
  const rec = list.find(t => t.shift1) || list[0];
  if (rec) {
    const shifts = [rec.shift1, rec.shift2, rec.shift3].filter(Boolean);
    if (shifts.length > 0) return shifts;
  }
  if (team === "3팀") return ["13:00~14:00", "14:00~15:00", "15:00~16:00"];
  return ["9:30~10:30", "10:30~11:30", "11:30~12:30"];
};

export const fetchAllTeachersFromDb = async () => {
  try {
    const { data, error } = await supabaseClient
      .from('teachers')
      .select('*')
      .order('team')
      .order('group_name')
      .order('seq_num')
      .order('name');
    if (!error && data) {
      const formatted = data.map(formatTeacherRow);
      setGlobalTeachersList(formatted);
      return formatted;
    }
  } catch (e) {
    console.error("선생님 DB 로딩 에러:", e);
  }
  return getGlobalTeachersList();
};

export function getTeacherSortWeight(team, teacher, teacherList = null) {
  const rec = findTeacherRecord(team, teacher, teacherList);
  if (rec && rec.seq_num !== '' && rec.seq_num !== null && rec.seq_num !== undefined) {
    const seq = parseInt(rec.seq_num, 10);
    if (!isNaN(seq)) return seq;
  }
  const list = (teacherList || getGlobalTeachersList()).filter(t => t.team === team);
  const cleanTeacher = normalizeTeacherName(teacher);
  const idx = list.findIndex(t => normalizeTeacherName(t.name) === cleanTeacher);
  return idx !== -1 ? idx : 999;
}

export function getGroupWeight(group) {
  if (!group) return 99;
  if (group === "오전") return 1;
  if (group === "오후") return 2;
  const match = group.match(/(\d+)조/);
  if (match) return parseInt(match[1]);
  return 99;
}

export function getShiftWeight(shift) {
  if (!shift) return 9999;
  const match = shift.match(/(\d+):(\d+)/);
  if (match) {
    return parseInt(match[1]) * 60 + parseInt(match[2]);
  }
  return 9999;
}

export const teamList = ["1팀", "2팀", "3팀", "취업팀"];
