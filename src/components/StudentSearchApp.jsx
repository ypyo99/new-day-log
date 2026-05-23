import React, { useState, useEffect, useMemo } from 'react';
import { supabaseClient } from '../utils/supabase';
import {
  getGlobalTeachersList,
  fetchAllTeachersFromDb,
  getTeamTeacherNames,
  getTeacherSortWeight,
  getTeacherGroup
} from '../utils/helpers';
import { Home, Clock } from './Icons';

export default function StudentSearchApp({ onNavigateBack }) {
  const [allRecords, setAllRecords] = useState([]);
  const [teamFilter, setTeamFilter] = useState("전체");
  const [selectedName, setSelectedName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState("");
  const [teacherListByTeam, setTeacherListByTeam] = useState({});
  const [teacherFilter, setTeacherFilter] = useState("전체");
  const [searchTerm, setSearchTerm] = useState("");
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const saved = localStorage.getItem('sungdong_recent_searches');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  const getSearchChoSung = (name) => {
    if (!name) return "";
    return name.split('').map(char => {
      const charCode = char.charCodeAt(0);
      if (charCode < 0xAC00 || charCode > 0xD7A3) return char;
      const choIndex = Math.floor(((charCode - 0xAC00) / 28) / 21);
      const choList = ["ㄱ", "ㄱ", "ㄴ", "ㄷ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅂ", "ㅅ", "ㅅ", "ㅇ", "ㅈ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
      return choList[choIndex];
    }).join('');
  };

  const currentTeamNames = useMemo(() => {
    let records = allRecords;
    if (teamFilter !== "전체") {
      records = allRecords.filter(r => r.team === teamFilter);
    }
    if (teacherFilter !== "전체") {
      records = records.filter(r => r.teacher === teacherFilter);
    }
    const nameSet = new Set();
    records.forEach(r => nameSet.add(r.name));
    return Array.from(nameSet).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [allRecords, teamFilter, teacherFilter]);

  const filteredNames = useMemo(() => {
    if (searchTerm.trim() === "") return currentTeamNames;

    const lowerSearch = searchTerm.toLowerCase().replace(/\s+/g, '');
    return currentTeamNames.filter(name => {
      const normalizedName = name.toLowerCase().replace(/\s+/g, '');
      const choName = getSearchChoSung(name);
      return normalizedName.includes(lowerSearch) || choName.includes(lowerSearch);
    });
  }, [currentTeamNames, searchTerm]);

  const ATTENDANCE_TAGS = ['1', '결석', '취소', '선생님휴가'];

  useEffect(() => {
    document.documentElement.style.overscrollBehaviorY = 'auto';
    document.body.style.overscrollBehaviorY = 'auto';
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      setIsLoading(true);
      try {
        setLoadProgress("전체 데이터 로딩 중...");
        if (getGlobalTeachersList().length === 0) {
          await fetchAllTeachersFromDb();
        }
        const teams = ["1팀", "2팀", "3팀", "취업팀"];
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        // Supabase 1000개 제한을 우회하기 위해 range pagination을 사용하여 모든 레코드를 누락 없이 완벽히 가져옴
        const fetchTeamRecords = async (teamName) => {
          let allData = [];
          let from = 0;
          const step = 1000;
          let hasMore = true;

          while (hasMore) {
            const to = from + step - 1;
            const { data, error } = await supabaseClient
              .from('daily_logs')
              .select('*')
              .eq('team', teamName)
              .neq('student', '')
              .not('student', 'is', null)
              .lte('log_date', todayStr) // 오늘까지 수업이 있는 사람들만 읽어옴
              .order('log_date', { ascending: false }) // 최신 데이터를 우선하여 가져옴
              .range(from, to);

            if (error) throw error;
            if (data && data.length > 0) {
              allData = allData.concat(data);
              if (data.length < step) {
                hasMore = false;
              } else {
                from += step;
              }
            } else {
              hasMore = false;
            }
          }
          return allData;
        };

        const queryPromises = teams.map(teamName => fetchTeamRecords(teamName));
        const results = await Promise.all(queryPromises);

        let records = [];
        results.forEach((teamRecords) => {
          if (teamRecords) records = records.concat(teamRecords);
        });

        console.log("DB Unique Teams:", [...new Set((records || []).map(r => r.team))]);
        console.log("DB Total Records Count:", (records || []).length);

        const teachersByTeam = {
          "1팀": getTeamTeacherNames("1팀"),
          "2팀": getTeamTeacherNames("2팀"),
          "3팀": getTeamTeacherNames("3팀"),
          "취업팀": getTeamTeacherNames("취업팀")
        };

        const allParsed = [];

        if (records) {
          records.forEach(row => {
            if (!row.student) return;

            // 해당 행의 교사와 팀 매핑
            if (row.teacher && row.team && teachersByTeam[row.team]) {
              if (!teachersByTeam[row.team].includes(row.teacher)) {
                teachersByTeam[row.team].push(row.teacher);
              }
            }

            // 여러 학생이 콤마/슬래시로 구분된 경우
            const names = row.student.split(/[/,]/).map(s => s.trim().split('(')[0].trim()).filter(Boolean);

            names.forEach((name, nameIdx) => {
              const excludeKeywords = ["보조강사", "자체학습", "대상자발굴", "도선복지관", "소양교육", "간담회", "수업", "준비", "컴기초", "공휴일", "근로자의날", "근로자의 날", "삼일절", "3.1절", "어린이날", "현충일", "광복절", "개천절", "한글날", "석가탄신일", "부처님오신날", "성탄절", "제헌절", "추석", "설날", "신정", "대체공휴일", "지방선거일", "지방 선거일", "선거일"];
              if (excludeKeywords.some(keyword => name.includes(keyword))) return;

              // 출결 태그 분리 및 매핑
              let personalStatus = row.status || "";
              if (personalStatus.includes('/')) {
                const segments = personalStatus.split('/');
                if (segments.length > nameIdx) {
                  personalStatus = segments[nameIdx].trim();
                }
              }

              let attendanceTag = "";
              let memo = "";
              if (personalStatus) {
                const parts = personalStatus.split(',').map(s => s.trim());
                let tagFound = [];
                let memoFound = [];
                parts.forEach(p => {
                  const clean = p.replace(/\s+/g, '');
                  if (ATTENDANCE_TAGS.includes(clean) || clean === "출석") {
                    tagFound.push(clean === "1" ? "출석" : clean);
                  } else if (/^\d+$/.test(clean)) {
                    tagFound.push("출석(" + clean + "명)");
                  } else if (p) {
                    memoFound.push(p);
                  }
                });
                attendanceTag = tagFound.join(', ') || (personalStatus ? "기록있음" : "");
                memo = memoFound.join(', ');
              }

              const colDate = new Date(row.log_date);
              colDate.setHours(0, 0, 0, 0);
              const colMonth = colDate.getMonth() + 1;
              const colDay = colDate.getDate();
              const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
              const dateStr = `${colMonth}/${colDay}(${dayNames[colDate.getDay()]})`;

              allParsed.push({
                name,
                dateStr,
                colDate,
                team: row.team || "기타",
                teacher: row.teacher || "",
                time: row.shift || "",
                location: row.signature_url || row.location || "복지관",
                attendanceTag,
                memo,
                group: getTeacherGroup(row.team, row.teacher)
              });
            });
          });
        }

        // 각 팀별 선생님 정렬
        Object.keys(teachersByTeam).forEach(t => {
          teachersByTeam[t].sort((a, b) => getTeacherSortWeight(t, a) - getTeacherSortWeight(t, b));
        });

        setTeacherListByTeam(teachersByTeam);

        allParsed.sort((a, b) => b.colDate - a.colDate);

        setAllRecords(allParsed);
      } catch (e) {
        console.error("Supabase 로드 실패:", e);
      } finally {
        setIsLoading(false);
        setLoadProgress("");
      }
    };

    loadAll();
  }, []);

  const filteredRecords = useMemo(() => {
    if (!selectedName || selectedName.trim() === "") return [];
    let raw = allRecords.filter(r => r.name === selectedName);
    if (teacherFilter !== "전체") {
      raw = raw.filter(r => r.teacher === teacherFilter);
    }
    if (raw.length === 0) return [];

    const dateMap = new Map();
    raw.forEach(r => {
      const key = r.colDate.getTime();
      if (dateMap.has(key)) {
        const existing = dateMap.get(key);
        const existingTeachers = existing.teacher.split(', ');
        if (!existingTeachers.includes(r.teacher)) {
          existing.teacher += ', ' + r.teacher;
        }
        if (r.location && r.location !== "복지관" && !existing.location.includes(r.location)) {
          existing.location += ', ' + r.location;
        }
        if (r.memo && !existing.memo.includes(r.memo)) {
          existing.memo = existing.memo ? existing.memo + ', ' + r.memo : r.memo;
        }
      } else {
        dateMap.set(key, { ...r });
      }
    });
    return Array.from(dateMap.values()).sort((a, b) => b.colDate - a.colDate);
  }, [selectedName, allRecords, teacherFilter]);

  const stats = useMemo(() => {
    if (filteredRecords.length === 0) return null;
    const attended = filteredRecords.filter(r => r.attendanceTag.includes("출석")).length;
    const absent = filteredRecords.filter(r => r.attendanceTag.includes("결석")).length;
    const canceled = filteredRecords.filter(r => r.attendanceTag.includes("취소")).length;
    return { total: filteredRecords.length, attended, absent, canceled };
  }, [filteredRecords]);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-transparent font-sans text-gray-800">
      <div className="shrink-0 bg-gradient-to-r from-teal-600 to-teal-500 text-white shadow-lg z-40 relative">
        <div className="max-w-5xl mx-auto px-4 pb-4 pt-safe-4 flex justify-between items-start">
          <div>
            <div className="flex items-center mb-1">
              <img src="Logo_of_Seoul.jpg" alt="서울시 로고" className="h-7 bg-white px-2 py-1 rounded-md object-contain mr-2" onError={(e) => e.target.style.display = 'none'} />
              <h1 className="font-black text-xl leading-tight">성동노인종합복지관</h1>
            </div>
            <p className="text-lg font-bold text-yellow-300 mb-1">디지털교육 서포터즈</p>
          </div>
          <button onClick={onNavigateBack} className="text-xs flex flex-col items-center font-bold p-2 rounded-lg shadow-md transition-all touch-manipulation bg-teal-800 text-white opacity-90 active:scale-95">
            <Home className="w-5 h-5 mb-1" /> 처음으로
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col pb-4">
        <div className="max-w-5xl w-full mx-auto flex-1 flex flex-col p-3 md:p-6 mt-2">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-teal-500 to-emerald-500 px-3 md:px-6 py-2.5">
              <div className="flex items-start justify-between gap-1 md:gap-2">
                <div className="flex flex-col min-w-0">
                  <h2 className="text-white font-extrabold text-[17px] md:text-xl flex items-center gap-1.5 md:gap-2 whitespace-nowrap mb-0.5">
                    <svg className="w-5 h-5 md:w-6 md:h-6 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /></svg>
                    <span className="truncate">대상자 검색</span>
                  </h2>
                  <p className="text-teal-100 text-[12px] md:text-base whitespace-nowrap">대상자를 선택하세요 ({filteredNames.length}명)</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0 ml-auto">
                  <div className="flex border border-gray-300 rounded-lg overflow-hidden shadow-sm">
                    {['전체', '1팀', '2팀', '3팀', '취업팀'].map(t => (
                      <button key={t} onClick={() => { setTeamFilter(t); setTeacherFilter("전체"); }} className={`px-1 min-[360px]:px-1.5 md:px-4 py-1 md:py-1.5 border-r border-gray-300 text-[12px] min-[360px]:text-[13px] min-[400px]:text-[14px] landscape:text-[18px] md:text-lg font-semibold tracking-tighter transition last:border-r-0 ${teamFilter === t ? 'bg-[#2b5ce6] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <select
                    value={teacherFilter}
                    onChange={(e) => setTeacherFilter(e.target.value)}
                    className="bg-white border border-gray-300 rounded-lg px-2 py-0.5 md:py-1 text-[12px] min-[360px]:text-[13px] min-[400px]:text-[14px] landscape:text-[18px] md:text-lg font-bold text-gray-700 shadow-sm outline-none focus:ring-2 focus:ring-teal-400 w-fit min-w-[100px] min-[360px]:min-w-[120px] md:min-w-[160px] max-w-[130px] min-[360px]:max-w-[160px] min-[400px]:max-w-[190px] md:max-w-[260px] transition-all"
                  >
                    <option value="전체">선생님 선택</option>
                    {(() => {
                      let list = [];
                      if (teamFilter === "전체") {
                        const uniqueTeachers = new Set();
                        ["1팀", "2팀", "3팀", "취업팀"].forEach(t => {
                          if (teacherListByTeam[t]) teacherListByTeam[t].forEach(name => uniqueTeachers.add(name));
                        });
                        list = Array.from(uniqueTeachers);
                      } else {
                        list = teacherListByTeam[teamFilter] || [];
                      }
                      return list.map((name, i) => <option key={i} value={name}>{name}</option>);
                    })()}
                  </select>
                </div>
              </div>
            </div>

            <div className="px-3 md:px-6 py-3">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Clock className="w-8 h-8 text-teal-500 animate-spin" />
                  <p className="text-teal-700 font-bold text-base animate-pulse">{loadProgress}</p>
                </div>
              ) : (
                <div>
                  {/* 🔍 실시간 검색창 추가 */}
                  <div className="relative mb-3">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-500 pointer-events-none">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                    <input
                      type="text"
                      placeholder="이름 또는 초성 검색 (예: ㄱㄷㅎ)"
                      value={searchTerm}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSearchTerm(val);
                        if (val.trim() !== "") {
                          setSelectedName("");
                        }
                      }}
                      className="w-full pl-10 pr-10 py-2 rounded-xl border-2 border-teal-300 focus:border-teal-500 focus:ring-4 focus:ring-teal-50 outline-none transition-all text-[15px] font-bold shadow-sm placeholder:text-gray-400"
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                      </button>
                    )}
                  </div>

                  {/* 🔍 검색 결과 없음 메시지 */}
                  {searchTerm && filteredNames.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-6 bg-red-50/50 rounded-xl border border-red-100 mb-3 animate-fadeIn">
                      <svg className="w-10 h-10 text-red-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      <p className="text-red-500 font-bold text-[15px]">해당 이름의 대상자가 없습니다.</p>
                    </div>
                  )}

                  {/* 🕒 최근 검색 대상자 */}
                  {recentSearches.length > 0 && !searchTerm && (
                    <div className="mb-3">
                      <div className="flex justify-between items-center mb-1 px-1">
                        <p className="text-[14px] md:text-[15px] text-blue-700 font-extrabold">최근 찾은 대상자</p>
                        <button
                          onClick={() => {
                            setRecentSearches([]);
                            localStorage.removeItem('sungdong_recent_searches');
                          }}
                          className="text-[14px] md:text-[15px] text-blue-700 hover:text-blue-800 font-extrabold"
                        >
                          지우기
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 items-center justify-center">
                        {recentSearches.map(name => (
                          <button
                            key={name}
                            onClick={() => {
                              setSelectedName(name);
                              setSearchTerm("");
                            }}
                            className={`px-3 py-1 rounded-full text-[13px] font-bold border transition-all active:scale-95 ${selectedName === name ? 'bg-teal-600 text-white border-teal-700 shadow-md' : 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-sm hover:bg-emerald-100 hover:border-emerald-300'}`}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 대상자 리스트 */}
                  <div className="max-h-[194px] md:max-h-[384px] overflow-y-auto border-2 border-teal-300 rounded-xl p-1 bg-gray-50/50 overflow-x-hidden">
                    <div className="grid grid-cols-3 min-[380px]:grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1">
                      {filteredNames.map(name => {
                        const isSpecial = name === "금호벽산경로당" || name === "금호벽산제2경로당";
                        const nameLen = name.length;
                        const effectiveLen = isSpecial ? 4 : nameLen;
                        const fontSizeClass = effectiveLen >= 8 ? 'text-[12px]' : effectiveLen >= 5 ? 'text-[14px]' : 'text-[16px]';
                        return (
                          <button
                            key={name}
                            onClick={() => {
                              const newName = name === selectedName ? "" : name;
                              setSelectedName(newName);
                              if (newName) {
                                setRecentSearches(prev => {
                                  const filtered = prev.filter(n => n !== newName);
                                  const updated = [newName, ...filtered].slice(0, 10);
                                  localStorage.setItem('sungdong_recent_searches', JSON.stringify(updated));
                                  return updated;
                                  });
                              }
                            }}
                            className={`px-0.5 py-0.5 rounded-lg ${fontSizeClass} font-bold transition-all active:scale-95 touch-manipulation border flex items-center justify-center text-center break-keep leading-tight min-h-[34px] ${selectedName === name ? 'bg-teal-600 text-white border-teal-700 shadow-md' : 'bg-gray-200 text-gray-800 border-gray-400 hover:bg-teal-50 hover:border-teal-400 shadow-sm'}`}
                          >
                            {name === "금호벽산경로당" ? <span>금호벽산<br />경로당</span> :
                              name === "금호벽산제2경로당" ? <span>금호벽산<br />제2경로당</span> :
                                name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {selectedName && stats && (
              <div className="px-4 md:px-6 pb-3">
                <div className="grid grid-cols-4 gap-2 md:gap-3">
                  <div className="bg-teal-200 rounded-xl p-2.5 md:p-3 text-center border border-teal-300">
                    <div className="text-[13px] md:text-[15px] text-teal-800 font-bold">전체</div>
                    <div className="text-2xl md:text-3xl font-black text-teal-900">{stats.total}</div>
                  </div>
                  <div className="bg-blue-200 rounded-xl p-2.5 md:p-3 text-center border border-blue-300">
                    <div className="text-[13px] md:text-[15px] text-blue-800 font-bold">출석</div>
                    <div className="text-2xl md:text-3xl font-black text-blue-900">{stats.attended}</div>
                  </div>
                  <div className="bg-red-200 rounded-xl p-2.5 md:p-3 text-center border border-red-300">
                    <div className="text-[13px] md:text-[15px] text-red-800 font-bold">결석</div>
                    <div className="text-2xl md:text-3xl font-black text-red-900">{stats.absent}</div>
                  </div>
                  <div className="bg-gray-200 rounded-xl p-2.5 md:p-3 text-center border border-gray-300">
                    <div className="text-[13px] md:text-[15px] text-gray-800 font-bold">취소</div>
                    <div className="text-2xl md:text-3xl font-black text-gray-900">{stats.canceled}</div>
                  </div>
                </div>
              </div>
            )}

            {selectedName && (
              <div className="px-4 md:px-6 pb-5">
                {filteredRecords.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 font-bold text-base">학습 참여 기록이 없습니다.</div>
                ) : (
                  <div className="space-y-2.5 md:space-y-3">
                    {filteredRecords.map((rec, idx) => {
                      const isAttended = rec.attendanceTag.includes("출석");
                      const isAbsent = rec.attendanceTag.includes("결석");
                      const isCanceled = rec.attendanceTag.includes("취소");
                      const borderColor = isAbsent ? "border-l-red-400" : isCanceled ? "border-l-gray-400" : isAttended ? "border-l-blue-400" : "border-l-teal-300";
                      const bgColor = isAbsent ? "bg-red-50/50" : isCanceled ? "bg-gray-50/50" : "bg-white";

                      return (
                        <div key={idx} className={`${bgColor} rounded-xl border border-gray-200 border-l-4 ${borderColor} shadow-sm overflow-hidden transition-all hover:shadow-md`}>
                          <div className="px-3 md:px-4 py-2.5 md:py-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-extrabold text-[16px] md:text-[18px] text-gray-900 whitespace-nowrap">{rec.dateStr}</span>
                              <span className="text-[14px] md:text-[16px] text-teal-600 font-bold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200 whitespace-nowrap">{rec.team}</span>
                              <span className="text-[15px] md:text-[17px] text-[#2563eb] font-extrabold bg-[#eff6ff] px-2.5 py-0.5 rounded-lg border border-[#bfdbfe] whitespace-nowrap">{rec.name}</span>
                              <span className="text-[14px] md:text-[16px] text-gray-500 font-bold whitespace-nowrap">({rec.teacher} 선생님)</span>
                              <span className="text-[14px] md:text-[16px] text-gray-500 font-medium whitespace-nowrap">📍 {rec.location}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {rec.attendanceTag && (
                                <span className={`text-[14px] md:text-[16px] font-bold px-2.5 py-0.5 rounded-full ${isAbsent ? 'bg-red-100 text-red-700 border border-red-300' : isCanceled ? 'bg-gray-200 text-gray-600 border border-gray-300' : 'bg-blue-100 text-blue-700 border border-blue-300'}`}>
                                  {rec.attendanceTag}
                                </span>
                              )}
                              {rec.memo && (
                                <span className="text-[14px] md:text-[16px] text-gray-700 font-medium">💬 {rec.memo}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
