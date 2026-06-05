// 선생님 명단 관리

import React, { useState, useEffect, useRef } from 'react';
import { supabaseClient } from '../utils/supabase';
import { getSavedItem, setGlobalTeachersList, formatTeacherRow } from '../utils/helpers';
import { User, Home } from './Icons';

export default function TeacherManagementApp({ onNavigateBack }) {
  const [teachers, setTeachers] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [formData, setFormData] = useState({
    team: '1팀',
    group: '1조',
    seq_num: '',
    name: '',
    shift1: '9:30~10:30',
    shift2: '10:30~11:30',
    shift3: '11:30~12:30'
  });

  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdInput, setPwdInput] = useState("");
  const [pwdError, setPwdError] = useState(false);
  const pwdInputRef = useRef(null);

  useEffect(() => {
    if (showPwdModal && pwdInputRef.current) {
      pwdInputRef.current.focus();
    }
  }, [showPwdModal]);

  const handleAdminClick = () => {
    if (isAdmin) {
      setIsAdmin(false);
    } else {
      setShowPwdModal(true);
      setPwdInput("");
      setPwdError(false);
    }
  };

  const checkPassword = () => {
    if (pwdInput === import.meta.env.VITE_ADMIN_PASSWORD) {
      setIsAdmin(true);
      setShowPwdModal(false);
    } else {
      setPwdError(true);
    }
  };

  const fetchTeachers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabaseClient.from('teachers').select('*').order('team').order('group_name').order('seq_num').order('name');
      if (error) throw error;
      const formatted = data.map(formatTeacherRow);
      setTeachers(formatted);
      setGlobalTeachersList(formatted);
    } catch (e) {
      console.error("Error fetching teachers:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'team') {
        if (value === '3팀') {
          next.shift1 = '13:00~14:00';
          next.shift2 = '14:00~15:00';
          next.shift3 = '15:00~16:00';
        } else {
          next.shift1 = '9:30~10:30';
          next.shift2 = '10:30~11:30';
          next.shift3 = '11:30~12:30';
        }
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('이름을 입력해주세요.');
      return;
    }

    const payload = {
      team: formData.team,
      group_name: formData.group,
      seq_num: formData.seq_num ? parseInt(formData.seq_num, 10) : null,
      name: formData.name,
      shift1: formData.shift1,
      shift2: formData.shift2,
      shift3: formData.shift3
    };

    setIsLoading(true);
    try {
      if (isEditing && currentId) {
        const { error } = await supabaseClient.from('teachers').update(payload).eq('id', currentId);
        if (error) throw error;
      } else {
        const { error } = await supabaseClient.from('teachers').insert([payload]);
        if (error) throw error;
      }
      await fetchTeachers();
      const nextSeq = !isEditing && formData.seq_num ? (parseInt(formData.seq_num, 10) + 1).toString() : '';
      setFormData(prev => ({
        ...prev,
        name: '',
        seq_num: nextSeq
      }));
      setIsEditing(false);
      setCurrentId(null);
    } catch (err) {
      console.error(err);
      alert('저장에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (teacher) => {
    setFormData({
      team: teacher.team,
      group: teacher.group,
      seq_num: teacher.seq_num || '',
      name: teacher.name,
      shift1: teacher.shift1 || '',
      shift2: teacher.shift2 || '',
      shift3: teacher.shift3 || ''
    });
    setCurrentId(teacher.id);
    setIsEditing(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('정말 삭제하시겠습니까?')) {
      setIsLoading(true);
      try {
        const { error } = await supabaseClient.from('teachers').delete().eq('id', id);
        if (error) throw error;
        await fetchTeachers();
      } catch (err) {
        console.error(err);
        alert('삭제에 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
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
              <User className="w-4 h-4 mr-1" /> 선생님 명단
            </p>
          </div>
        </div>

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

      <main className="flex-1 px-4 sm:px-6 md:px-8 pt-2 pb-12 w-full max-w-full lg:max-w-[95%] xl:max-w-[92%] mx-auto overflow-y-auto">
        {isAdmin ? (
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-5 mb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h2 className="text-lg font-bold text-gray-800">
                  {isEditing ? '선생님 정보 수정' : '새 선생님 등록'}
                </h2>
                <div className="flex gap-2">
                  {isEditing && (
                    <button type="button" onClick={() => { setIsEditing(false); setCurrentId(null); setFormData({ team: '1팀', group: '1조', seq_num: '', name: '', shift1: '9:30~10:30', shift2: '10:30~11:30', shift3: '11:30~12:30' }); }} className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300 transition-colors">
                      취소
                    </button>
                  )}
                  <button type="submit" disabled={isLoading} className="px-3 py-1.5 text-sm bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50">
                    {isLoading ? '처리중...' : (isEditing ? '수정 저장' : '새로 등록')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <div>
                  <select name="team" value={formData.team} onChange={handleInputChange} className="w-full border border-gray-300 rounded-lg p-1.5 sm:p-2 bg-gray-50 focus:ring-2 focus:ring-indigo-400 outline-none text-xs sm:text-base">
                    <option value="1팀">1팀</option>
                    <option value="2팀">2팀</option>
                    <option value="3팀">3팀</option>
                    <option value="취업팀">취업팀</option>
                  </select>
                </div>
                <div>
                  <input type="text" name="group" value={formData.group} onChange={handleInputChange} placeholder="예: 1조" className="w-full border border-gray-300 rounded-lg p-1.5 sm:p-2 bg-gray-50 focus:ring-2 focus:ring-indigo-400 outline-none text-xs sm:text-base" />
                </div>
                <div className="flex gap-2 sm:gap-4 w-full">
                  <input type="text" inputMode="numeric" name="seq_num" value={formData.seq_num} onChange={handleInputChange} placeholder="번호" className="w-16 border border-gray-300 rounded-lg p-1.5 sm:p-2 bg-gray-50 focus:ring-2 focus:ring-indigo-400 outline-none text-xs sm:text-base text-center" />
                  <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="선생님 이름" className="flex-1 min-w-0 border border-gray-300 rounded-lg p-1.5 sm:p-2 bg-gray-50 focus:ring-2 focus:ring-indigo-400 outline-none text-xs sm:text-base" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-2">
                <div>
                  <input type="text" name="shift1" value={formData.shift1} onChange={handleInputChange} placeholder="9:30~10:30" className="w-full border border-gray-300 rounded-lg p-1.5 sm:p-2 bg-gray-50 focus:ring-2 focus:ring-indigo-400 outline-none text-xs sm:text-base" />
                </div>
                <div>
                  <input type="text" name="shift2" value={formData.shift2} onChange={handleInputChange} placeholder="10:30~11:30" className="w-full border border-gray-300 rounded-lg p-1.5 sm:p-2 bg-gray-50 focus:ring-2 focus:ring-indigo-400 outline-none text-xs sm:text-base" />
                </div>
                <div>
                  <input type="text" name="shift3" value={formData.shift3} onChange={handleInputChange} placeholder="11:30~12:30" className="w-full border border-gray-300 rounded-lg p-1.5 sm:p-2 bg-gray-50 focus:ring-2 focus:ring-indigo-400 outline-none text-xs sm:text-base" />
                </div>
              </div>
            </form>
          </div>
        ) : (
          <div className="bg-yellow-50 rounded-2xl border border-yellow-200 p-4 mb-6 text-center text-yellow-800 text-xs sm:text-sm font-bold shadow-sm">
            💡 선생님 등록 및 수정을 하시려면 상단의 [담당자 로그인] 버튼을 눌러 인증해 주세요.
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50">
            <h2 className="text-lg font-bold text-gray-800"></h2>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-center border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-indigo-50 border-b border-gray-200 text-indigo-900 font-bold">
                  <th className="py-2.5 px-1 border-r border-gray-200 w-10 whitespace-nowrap">팀</th>
                  <th className="py-2.5 px-1 border-r border-gray-200 w-10 whitespace-nowrap">조</th>
                  <th className="py-2.5 px-1 border-r border-gray-200 w-12 whitespace-nowrap">번호</th>
                  <th className="py-2.5 px-2 border-r border-gray-200">이름</th>
                  {isAdmin && <th className="py-2.5 px-2 border-r border-gray-200">관리</th>}
                  <th className="py-2.5 px-2 border-r border-gray-200">시간대 1</th>
                  <th className="py-2.5 px-2 border-r border-gray-200">시간대 2</th>
                  <th className="py-2.5 px-2">시간대 3</th>
                </tr>
              </thead>
              <tbody>
                {teachers.length > 0 ? teachers.sort((a, b) => a.team.localeCompare(b.team) || ((a.seq_num || 999) - (b.seq_num || 999)) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name)).map(t => (
                  <tr key={t.id} className={`border-b border-gray-100 ${t.team === '2팀' || t.team === '취업팀' ? 'bg-sky-50 hover:bg-sky-100' : 'hover:bg-gray-50'}`}>
                    <td className="py-2 px-1 border-r border-gray-100 w-10 text-xs sm:text-sm">{t.team.replace('팀', '')}</td>
                    <td className="py-2 px-1 border-r border-gray-100 w-10 text-xs sm:text-sm">{t.group.replace('조', '')}</td>
                    <td className="py-2 px-1 border-r border-gray-100 w-12 whitespace-nowrap text-xs sm:text-sm">{t.seq_num}</td>
                    <td className="py-2 px-2 border-r border-gray-100 font-bold text-xs sm:text-sm">
                      {t.name.includes('/') ? (
                        t.name.split('/').map((namePart, idx, arr) => (
                          <span key={idx} className="block whitespace-nowrap">
                            {namePart}{idx < arr.length - 1 ? '/' : ''}
                          </span>
                        ))
                      ) : (
                        t.name
                      )}
                    </td>
                    {isAdmin && (
                      <td className="py-2 px-2 border-r border-gray-100 space-x-1 whitespace-nowrap">
                        <button onClick={() => handleEdit(t)} className="px-2 py-1 bg-blue-200 text-blue-800 text-xs font-bold rounded hover:bg-blue-300">수정</button>
                        <button onClick={() => handleDelete(t.id)} className="px-2 py-1 bg-red-200 text-red-800 text-xs font-bold rounded hover:bg-red-300">삭제</button>
                      </td>
                    )}
                    <td className="py-2 px-2 border-r border-gray-100 text-sm text-gray-600">{t.shift1}</td>
                    <td className="py-2 px-2 border-r border-gray-100 text-sm text-gray-600">{t.shift2}</td>
                    <td className="py-2 px-2 text-sm text-gray-600">{t.shift3}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={isAdmin ? 8 : 7} className="py-6 text-gray-500 font-medium">등록된 선생님이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {showPwdModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">담당자 암호</h3>
            <input ref={pwdInputRef} autoFocus type="password" value={pwdInput} onChange={(e) => { const val = e.target.value; setPwdInput(val); if (val === import.meta.env.VITE_ADMIN_PASSWORD) { setIsAdmin(true); window.localStorage.setItem('sungdong_admin_logged_in', 'true'); setShowPwdModal(false); } }} onKeyDown={(e) => e.key === 'Enter' && checkPassword()} className="w-full border-2 p-3 rounded-lg mb-4 text-center text-2xl tracking-widest outline-none focus:border-blue-500 text-black" placeholder="••••" />
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
