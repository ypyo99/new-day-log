import React, { useState, useEffect, useRef } from 'react';
import { supabaseClient } from '../utils/supabase';
import { Home } from './Icons';

export default function HolidayManagementApp({ onNavigateBack }) {
  const [holidays, setHolidays] = useState([]);
  const [formData, setFormData] = useState({ date: '', name: '', content1: '', content2: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState("");

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
      if (pwdInput === "qqq") {
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
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddOrUpdate = async () => {
    if (!formData.date || !formData.name) {
      alert("날짜와 공휴일 이름은 필수입니다.");
      return;
    }

    setSaving(true);
    setNotice("");
    try {
      const { id, created_at, updated_at, ...payload } = formData;

      const { error } = await supabaseClient
        .from('holidays')
        .upsert(payload, { onConflict: 'date' });

      if (error) throw error;

      setNotice("성공적으로 저장되었습니다.");
      setTimeout(() => setNotice(""), 3000);

      setFormData({ date: '', name: '', content1: '', content2: '' });
      await fetchHolidays();
    } catch (err) {
      console.error(err);
      setNotice("저장 중 오류가 발생했습니다: " + err.message);
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

  const handleEdit = (holiday) => {
    setFormData({
      date: holiday.date || '',
      name: holiday.name || '',
      content1: holiday.content1 || '',
      content2: holiday.content2 || ''
    });
  };

  const handleApplyToSchedule = async () => {
    const targetYear = new Date().getFullYear();

    if (!confirm(`현재 연도(${targetYear}년) 시간표에 공휴일을 적용하시겠습니까? (해당 날짜의 모든 일정이 공휴일 데이터로 덮어쓰기됩니다)`)) return;

    setApplying(true);
    setNotice("");
    try {
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

        const { data, error: fetchError } = await supabaseClient
          .from('daily_logs')
          .select('*')
          .eq('log_date', fullDate);

        if (fetchError) throw fetchError;

        if (data && data.length > 0) {
          const updatedLogs = data.map(log => ({
            ...log,
            student: holiday.name,
            location: holiday.content1,
            status: holiday.content2
          }));

          const { error: upsertError } = await supabaseClient
            .from('daily_logs')
            .upsert(updatedLogs, { onConflict: 'team,log_date,teacher,shift' });

          if (upsertError) throw upsertError;
          totalUpdated += data.length;
        }
      }

      setNotice(`성공적으로 시간표에 적용되었습니다! (총 ${totalUpdated}건 업데이트)`);
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
              <img src="Logo_of_Seoul.jpg" alt="서울시 로고" className="h-7 bg-white px-2 py-1 rounded-md object-contain mr-2" onError={(e) => e.target.style.display = 'none'} />
              <h1 className="font-black text-xl leading-tight">성동노인종합복지관</h1>
            </div>
            <p className="text-lg font-bold text-yellow-300">디지털교육 서포터즈</p>
            <p className="text-base opacity-95 flex items-center mt-1 font-bold">
              <svg className="w-4 h-4 mr-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> 공휴일/휴무일 관리
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
                onClick={handleAddOrUpdate}
                disabled={saving || loading}
                className="px-4 py-2 bg-gray-800 text-white text-sm font-bold rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                추가/수정
              </button>
            </div>
            <div className="flex gap-1.5 sm:gap-2">
              <div className="w-[18%] min-w-0">
                <label className="block text-[11px] sm:text-xs font-bold text-gray-600 mb-1 truncate">날짜 *</label>
                <input type="text" name="date" value={formData.date} onChange={handleInputChange} placeholder="MM-DD" className="w-full p-1.5 sm:p-2 border border-gray-300 rounded-lg text-[13px] sm:text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium" />
              </div>
              <div className="w-[27%] min-w-0">
                <label className="block text-[11px] sm:text-xs font-bold text-gray-600 mb-1 truncate">공휴일 이름 *</label>
                <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="예: 삼일절" className="w-full p-1.5 sm:p-2 border border-gray-300 rounded-lg text-[13px] sm:text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium" />
              </div>
              <div className="w-[27%] min-w-0">
                <label className="block text-[11px] sm:text-xs font-bold text-gray-600 mb-1 truncate">내용1</label>
                <input type="text" name="content1" value={formData.content1} onChange={handleInputChange} placeholder="예: 복지관 휴관" className="w-full p-1.5 sm:p-2 border border-gray-300 rounded-lg text-[13px] sm:text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium" />
              </div>
              <div className="w-[28%] min-w-0">
                <label className="block text-[11px] sm:text-xs font-bold text-gray-600 mb-1 truncate">내용2</label>
                <input type="text" name="content2" value={formData.content2} onChange={handleInputChange} placeholder="예: 휴일 휴강" className="w-full p-1.5 sm:p-2 border border-gray-300 rounded-lg text-[13px] sm:text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium" />
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 animate-fadeIn" style={{ animationDelay: '0.1s' }}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
            <h2 className="text-base font-bold text-gray-800">공휴일/휴무일 목록</h2>
            <div className="flex gap-2 w-full sm:w-auto">
              {isAdmin && (
                <button onClick={handleApplyToSchedule} disabled={applying || loading || saving} className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap">
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
                  <tr className="bg-gray-100 text-gray-700 border-b border-gray-300 font-bold whitespace-nowrap">
                    <th className="p-3 w-32 border-r border-gray-200">날짜</th>
                    <th className="p-3 w-40 border-r border-gray-200">공휴일 이름</th>
                    <th className="p-3 border-r border-gray-200 min-w-[100px]">내용1</th>
                    <th className="p-3 border-r border-gray-200 min-w-[100px]">내용2</th>
                    {isAdmin && <th className="p-3 w-28 text-center">관리</th>}
                  </tr>
                </thead>
                <tbody>
                  {holidays.map((h, i) => (
                    <tr key={i} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                      <td className="p-3 border-r border-gray-200 font-bold text-gray-800">{h.date}</td>
                      <td className="p-3 border-r border-gray-200 text-gray-700 font-medium">{h.name}</td>
                      <td className="p-3 border-r border-gray-200 text-gray-600">{h.content1}</td>
                      <td className="p-3 border-r border-gray-200 text-gray-600">{h.content2}</td>
                      {isAdmin && (
                        <td className="p-3 text-center whitespace-nowrap">
                          <button onClick={() => handleEdit(h)} disabled={saving || loading} className="text-blue-600 hover:text-blue-800 disabled:text-gray-400 mr-3 text-xs font-bold">수정</button>
                          <button onClick={() => handleDelete(h.date)} disabled={saving || loading} className="text-red-500 hover:text-red-700 disabled:text-gray-400 text-xs font-bold">삭제</button>
                        </td>
                      )}
                    </tr>
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
                if (val === 'qqq') {
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
