//공휴일/휴무일 관리

import React, { useState, useEffect, useRef } from 'react';
import { supabaseClient } from '../utils/supabase';
import { Home } from './Icons';
import { getShiftWeight, getSavedItem, setSavedItem, removeSavedItem } from '../utils/helpers';

export default function HolidayManagementApp({ onNavigateBack }) {
  const [holidays, setHolidays] = useState([]);
  const [formData, setFormData] = useState({ date: '', name: '', content1: '', content2: '', vacation_available: false });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState("");
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [showApplyPopup, setShowApplyPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState("");

  const [isAdmin, setIsAdmin] = useState(() => {
    return getSavedItem('sungdong_admin_logged_in', 'false') === 'true';
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
        removeSavedItem('sungdong_admin_logged_in');
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
        setSavedItem('sungdong_admin_logged_in', 'true');
        setShowPwdModal(false);
      } else {
        setPwdError(true);
      }
    } catch (e) {
      alert("checkPassword 오류: " + e.message);
    }
  };

  useEffect(() => {
    fetchHolidays();
  }, []);

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseClient
        .from('holidays')
        .select('*')
        .order('date', { ascending: true });

      if (error) throw error;
      setHolidays(data || []);
    } catch (err) {
      console.error(err);
      setNotice("데이터를 불러오는데 실패했습니다 (DB에 holidays 테이블이 없을 수 있습니다).");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleAdd = async () => {
    if (!formData.date || !formData.name) {
      alert("날짜와 공휴일 이름은 필수입니다.");
      return;
    }

    setSaving(true);
    setNotice("");
    try {
      const trimmedDate = formData.date.trim();

      // 중복 날짜 체크
      const { data: existing, error: checkError } = await supabaseClient
        .from('holidays')
        .select('date')
        .eq('date', trimmedDate);

      if (checkError) throw checkError;
      if (existing && existing.length > 0) {
        alert("이미 등록된 날짜입니다.");
        setSaving(false);
        return;
      }

      const { id, created_at, updated_at, ...payload } = formData;
      payload.date = trimmedDate;
      payload.name = payload.name.trim();
      payload.content1 = payload.content1 ? payload.content1.trim() : '';
      payload.content2 = payload.content2 ? payload.content2.trim() : '';
      payload.vacation_available = payload.vacation_available || false;

      // ID 시퀀스 오류(duplicate key) 방지를 위해 수동으로 가장 큰 id를 찾아 +1 할당
      const { data: maxData } = await supabaseClient
        .from('holidays')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);

      if (maxData && maxData.length > 0) {
        payload.id = maxData[0].id + 1;
      } else {
        payload.id = 1;
      }

      const { error } = await supabaseClient
        .from('holidays')
        .insert(payload);

      if (error) throw error;

      setNotice("성공적으로 추가되었습니다.");
      setTimeout(() => setNotice(""), 3000);

      setFormData({ date: '', name: '', content1: '', content2: '', vacation_available: false });
      await fetchHolidays();
    } catch (err) {
      console.error(err);
      setNotice("추가 중 오류가 발생했습니다: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (dateToDelete) => {
    if (!confirm("해당 휴무일을 삭제하시겠습니까?")) return;

    setSaving(true);
    setNotice("");
    try {
      const { error } = await supabaseClient
        .from('holidays')
        .delete()
        .eq('date', dateToDelete);

      if (error) throw error;

      setNotice("성공적으로 삭제되었습니다.");
      setTimeout(() => setNotice(""), 3000);

      await fetchHolidays();
    } catch (err) {
      console.error(err);
      setNotice("삭제 중 오류가 발생했습니다: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCell = async (date, field) => {
    if (!editingCell) return;
    setEditingCell(null);

    const original = holidays.find(h => h.date === date);
    if (!original) return;

    const trimmedValue = editValue.trim();
    if (original[field] === trimmedValue) return;

    setSaving(true);
    setNotice("");
    try {
      const { error } = await supabaseClient
        .from('holidays')
        .update({ [field]: trimmedValue })
        .eq('date', date);

      if (error) throw error;

      setNotice("수정사항이 저장되었습니다.");
      setTimeout(() => setNotice(""), 3000);
      await fetchHolidays();
    } catch (err) {
      console.error(err);
      alert("수정 중 오류가 발생했습니다: " + err.message);
      await fetchHolidays();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVacation = async (date, currentValue) => {
    setSaving(true);
    setNotice("");
    try {
      const { error } = await supabaseClient
        .from('holidays')
        .update({ vacation_available: !currentValue })
        .eq('date', date);

      if (error) throw error;

      setNotice("휴가가능 상태가 변경되었습니다.");
      setTimeout(() => setNotice(""), 3000);
      await fetchHolidays();
    } catch (err) {
      console.error(err);
      alert("수정 중 오류가 발생했습니다: " + err.message);
      await fetchHolidays();
    } finally {
      setSaving(false);
    }
  };

  const renderCell = (holiday, field, className) => {
    const isEditing = editingCell && editingCell.date === holiday.date && editingCell.field === field;
    const value = holiday[field] || '';

    if (isAdmin) {
      if (isEditing) {
        return (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => handleSaveCell(holiday.date, field)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSaveCell(holiday.date, field);
              } else if (e.key === 'Escape') {
                setEditingCell(null);
              }
            }}
            className="w-full p-1 border border-indigo-500 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm font-medium text-black bg-white"
            autoFocus
          />
        );
      } else {
        return (
          <div
            onClick={() => {
              setEditingCell({ date: holiday.date, field });
              setEditValue(value);
            }}
            className={`${className} cursor-pointer hover:bg-yellow-50 hover:underline px-1 py-0.5 rounded transition-all min-h-[24px] flex items-center`}
            title="클릭하여 바로 수정"
          >
            {value || <span className="text-gray-400 italic text-xs font-normal">(비어 있음)</span>}
          </div>
        );
      }
    } else {
      return (
        <span className={`${className} px-1 py-0.5 block min-h-[24px] flex items-center`}>
          {value || <span className="text-gray-300 italic text-xs font-normal">-</span>}
        </span>
      );
    }
  };

  const handleApplyToSchedule = async () => {
    const targetYear = new Date().getFullYear();

    const generateUUID = () => {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };

    if (!confirm('공휴일 데이터를 일정표에 적용하시겠습니까?')) return;

    setApplying(true);
    setNotice("");
    try {
      // 모든 선생님 목록 조회
      const { data: allTeachers, error: tErr } = await supabaseClient
        .from('teachers')
        .select('*');

      if (tErr) throw tErr;

      let totalUpdated = 0;
      for (const holiday of holidays) {
        let formattedMonthDay = holiday.date;
        if (holiday.date.includes('/')) {
          const [m, d] = holiday.date.split('/');
          formattedMonthDay = `${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        } else if (holiday.date.includes('-')) {
          const [m, d] = holiday.date.split('-');
          formattedMonthDay = `${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }

        const fullDate = `${targetYear}-${formattedMonthDay}`;

        // 해당 날짜의 기존 daily_logs 조회
        const { data: logsData, error: fetchError } = await supabaseClient
          .from('daily_logs')
          .select('*')
          .eq('log_date', fullDate);

        if (fetchError) throw fetchError;

        const updatedLogs = [];

        allTeachers.forEach(teacher => {
          const teacherName = teacher.name.trim();
          const shifts = [teacher.shift1, teacher.shift2, teacher.shift3]
            .map(s => (s || "").trim())
            .filter(Boolean);

          if (shifts.length === 0) return;

          // 첫 번째 교시 판단 (가장 이른 시간)
          const sortedShifts = [...shifts].sort((a, b) => getShiftWeight(a) - getShiftWeight(b));
          const firstShift = sortedShifts[0];

          shifts.forEach(shift => {
            const existingLog = logsData ? logsData.find(l => l.teacher.trim() === teacherName && l.shift.trim() === shift) : null;

            if (existingLog) {
              if (shift === firstShift) {
                updatedLogs.push({
                  ...existingLog,
                  student: holiday.name,
                  location: holiday.content1,
                  status: holiday.content2
                });
              } else {
                updatedLogs.push({
                  ...existingLog,
                  student: "",
                  location: "",
                  status: ""
                });
              }
            } else {
              // 기존 로그가 없더라도 첫 번째 교시에 대해서는 공휴일 레코드 생성
              if (shift === firstShift) {
                updatedLogs.push({
                  id: generateUUID(),
                  team: teacher.team,
                  log_date: fullDate,
                  teacher: teacherName,
                  shift: shift,
                  student: holiday.name,
                  location: holiday.content1,
                  status: holiday.content2
                });
              }
            }
          });
        });

        if (updatedLogs.length > 0) {
          const { error: upsertError } = await supabaseClient
            .from('daily_logs')
            .upsert(updatedLogs, { onConflict: 'team,log_date,teacher,shift' });

          if (upsertError) throw upsertError;
          totalUpdated += updatedLogs.length;
        }
      }

      setPopupMessage(`성공적으로 시간표에 적용되었습니다!\n(총 ${totalUpdated}건 업데이트)`);
      setShowApplyPopup(true);
      setTimeout(() => {
        setShowApplyPopup(false);
        setPopupMessage("");
      }, 2000);
    } catch (err) {
      console.error(err);
      setNotice("적용 중 오류가 발생했습니다: " + err.message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gray-50 font-sans pb-10 flex flex-col">
      <header className="bg-blue-600 text-white px-4 pt-4 pb-7 shadow-lg z-40 flex justify-between items-start relative shrink-0 min-h-[96px]">
        <div className="flex items-center">
          <div className="flex flex-col">
            <div className="flex items-center mb-1">
              <img src="/Logo_of_Seoul.jpg" alt="서울시 로고" className="h-7 bg-white px-2 py-1 rounded-md object-contain mr-2" onError={(e) => e.target.style.display = 'none'} />
              <h1 className="font-black text-xl leading-tight">성동노인종합복지관</h1>
            </div>
            <p className="text-lg font-bold text-yellow-300">디지털교육 서포터즈</p>
            <p className="text-base opacity-95 flex items-center mt-1 font-bold">
              <svg className="w-4 h-4 mr-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> 공휴일 관리
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

      <main className="p-4 max-w-4xl mx-auto space-y-6 mt-4 w-full flex-1">
        {notice && (
          <div className={`p-4 rounded-xl font-bold shadow-sm animate-fadeIn ${notice.includes('실패') || notice.includes('오류') ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-green-100 text-green-700 border border-green-200'}`}>
            {notice}
          </div>
        )}

        {!isAdmin ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center shadow-sm w-full">
            <div className="text-3xl mb-2">💡</div>
            <p className="font-extrabold text-amber-800 text-base">
              공휴일/휴무일 편집을 하시려면 상단의 [담당자 로그인] 버튼을 눌러 인증해 주세요.
            </p>
            <p className="text-xs text-amber-600 mt-2 font-bold">
              * 담당자 전용 인증 후에만 공휴일 추가/수정/삭제 및 시간표 적용이 가능합니다.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 animate-fadeIn">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-bold text-gray-800">새 공휴일/휴무일 입력</h2>
              <button
                onClick={handleAdd}
                disabled={saving || loading}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                추가
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              <div className="w-[22%] sm:w-[18%] min-w-0">
                <label className="block text-[11px] sm:text-xs font-bold text-blue-600 mb-1 truncate">날짜 *</label>
                <input type="text" name="date" value={formData.date} onChange={handleInputChange} placeholder="MM-DD" className="w-full p-1.5 sm:p-2 border border-gray-300 rounded-lg text-[13px] sm:text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium" />
              </div>
              <div className="w-[26%] sm:w-[22%] min-w-0">
                <label className="block text-[11px] sm:text-xs font-bold text-blue-600 mb-1 truncate">공휴일 이름 *</label>
                <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="예: 삼일절" className="w-full p-1.5 sm:p-2 border border-gray-300 rounded-lg text-[13px] sm:text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium" />
              </div>
              <div className="w-[26%] sm:w-[22%] min-w-0">
                <label className="block text-[11px] sm:text-xs font-bold text-blue-600 mb-1 truncate">내용1</label>
                <input type="text" name="content1" value={formData.content1} onChange={handleInputChange} placeholder="예: 휴관" className="w-full p-1.5 sm:p-2 border border-gray-300 rounded-lg text-[13px] sm:text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium" />
              </div>
              <div className="w-[20%] sm:w-[18%] min-w-0">
                <label className="block text-[11px] sm:text-xs font-bold text-blue-600 mb-1 truncate">내용2</label>
                <input type="text" name="content2" value={formData.content2} onChange={handleInputChange} placeholder="예: 휴강" className="w-full p-1.5 sm:p-2 border border-gray-300 rounded-lg text-[13px] sm:text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium" />
              </div>
              <div className="w-full sm:w-auto flex items-end mt-2 sm:mt-0">
                <label className="flex items-center gap-2 cursor-pointer bg-blue-50 px-3 py-1.5 sm:py-2 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors w-full sm:w-auto">
                  <input type="checkbox" name="vacation_available" checked={formData.vacation_available} onChange={handleInputChange} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                  <span className="text-[12px] sm:text-sm font-bold text-blue-800">개별수업가능</span>
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 animate-fadeIn" style={{ animationDelay: '0.1s' }}>
          <div className="flex flex-row justify-between items-center mb-4 gap-3">
            <h2 className="text-base sm:text-lg font-bold text-gray-800"></h2>
            <div className="flex gap-2 shrink-0">
              {isAdmin && (
                <button onClick={handleApplyToSchedule} disabled={applying || loading || saving} className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                  {applying ? '적용 중...' : '시간표에 적용'}
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-10"><div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
          ) : holidays.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm font-medium bg-gray-50 rounded-xl border border-dashed border-gray-300">저장된 공휴일/휴무일이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-200 text-gray-700 border-b border-gray-300 font-bold whitespace-nowrap">
                    <th rowSpan={2} className="p-3 w-28 sm:w-32 border-r border-gray-300 align-middle text-center">날짜</th>
                    <th className="p-3 w-32 sm:w-40 border-r border-gray-300">공휴일 이름</th>
                    <th className="p-3 min-w-[100px] border-r border-gray-300">내용1</th>
                    <th rowSpan={2} className="p-3 w-24 text-center border-r border-gray-300 align-middle">개별수업<br />가능여부</th>
                    <th rowSpan={2} className="p-3 text-center align-middle">{isAdmin ? '관리' : ''}</th>
                  </tr>
                  <tr className="bg-gray-200 text-gray-700 border-b-2 border-gray-400 font-bold whitespace-nowrap">
                    <th colSpan={2} className="p-3 border-r border-gray-300">내용2</th>
                  </tr>
                </thead>
                <tbody>
                  {holidays.map((h, i) => (
                    <React.Fragment key={i}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td rowSpan={2} className="pt-2.5 pb-2.5 px-3 border-r border-gray-200 font-bold text-gray-800 align-middle text-center">{h.date}</td>
                        <td className="pt-2 pb-0.5 px-3 border-r border-gray-200">
                          {renderCell(h, 'name', 'text-gray-800 font-bold')}
                        </td>
                        <td className="pt-2 pb-0.5 px-3 border-r border-gray-200">
                          {renderCell(h, 'content1', 'text-gray-700 font-bold')}
                        </td>
                        <td rowSpan={2} className="pt-2.5 pb-2.5 px-3 border-r border-gray-200 text-center align-middle">
                          {isAdmin ? (
                            <button
                              onClick={() => handleToggleVacation(h.date, h.vacation_available)}
                              disabled={saving || loading}
                              className={`px-3 py-1 rounded-full text-xs font-bold transition-colors shadow-sm ${h.vacation_available ? 'bg-green-100 text-green-700 border border-green-300 hover:bg-green-200' : 'bg-gray-100 text-gray-500 border border-gray-300 hover:bg-gray-200'}`}
                            >
                              {h.vacation_available ? '가능 O' : '불가 X'}
                            </button>
                          ) : (
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${h.vacation_available ? 'bg-green-50 text-green-700' : 'text-gray-400'}`}>
                              {h.vacation_available ? 'O' : '-'}
                            </span>
                          )}
                        </td>
                        <td rowSpan={2} className="px-3 text-center whitespace-nowrap bg-gray-50/50 align-middle border-l border-gray-200">
                          {isAdmin && (
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => handleDelete(h.date)} disabled={saving || loading} className="px-4 py-1.5 bg-red-400 text-white border border-red-500 hover:bg-red-500 rounded-md disabled:opacity-50 text-xs font-bold transition-colors shadow-sm">삭제</button>
                            </div>
                          )}
                        </td>
                      </tr>
                      <tr className="border-b-2 border-gray-300 hover:bg-gray-50 transition-colors">
                        <td colSpan={2} className="pt-0.5 pb-2 px-3 border-r border-gray-200">
                          {renderCell(h, 'content2', 'text-gray-900')}
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
                  setSavedItem('sungdong_admin_logged_in', 'true');
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

      {showApplyPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] px-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full border border-gray-100 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-gray-800 font-extrabold text-base whitespace-pre-line leading-relaxed">
              {popupMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
