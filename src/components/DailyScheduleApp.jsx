// 팀 별 오늘 일정 보기






import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabaseClient } from '../utils/supabase';
import {
  getSavedItem,
  getLocalDateString,
  getInitialWeekday,
  getTeacherGroup,
  getTeacherSortWeight,
  getGroupWeight,
  getShiftWeight,
  getDirectImageUrl,
  getTeacherShifts,
  getTeamTeacherNames
} from '../utils/helpers';
import { Home, LucideCalendar, Clock, BookOpen, Sparkles } from './Icons';

// 문자열 내에 콤마나 슬래시로 구분된 특정 키워드가 정확히 일치하는지 검사하는 유틸리티 함수입니다.
const hasIndependentKeyword = (str, keywords) => {
  if (!str) return false;
  const tokens = str.split(/[,/]+/).map(t => t.trim());
  return tokens.some(token => keywords.includes(token));
};

const mapShiftToOfficial = (team, teacherName, originalShift) => {
  if (!originalShift || !teacherName) return originalShift;
  const officialShifts = getTeacherShifts(team, teacherName);
  if (!officialShifts || officialShifts.length === 0) return originalShift;
  if (officialShifts.includes(originalShift)) return originalShift;

  const standardDefaults = team === "3팀"
    ? ["13:00~14:00", "14:00~15:00", "15:00~16:00"]
    : ["9:30~10:30", "10:30~11:30", "11:30~12:30"];

  const idx = standardDefaults.indexOf(originalShift);
  if (idx !== -1 && officialShifts[idx]) {
    return officialShifts[idx];
  }
  return originalShift;
};

const checkIsCanceled = (status) => {
  if (!status) return false;
  
  // 텍스트를 콤마(,)나 슬래시(/)로 분리합니다.
  const tokens = status.split(/[,/]+/).map(t => t.trim());
  
  // 취소, 종료 단어는 첫 번째 또는 두 번째 단어로 온 경우만 인정합니다.
  const isFirstWord = tokens[0] === "취소" || tokens[0] === "종료";
  const isSecondWord = tokens.length > 1 && (tokens[1] === "취소" || tokens[1] === "종료");

  return isFirstWord || isSecondWord;
};

// =====================================================================
// ✨ 교육 요약 & 인사이트 컴포넌트
// =====================================================================
function SummarySection({ data, date, team, onTouchStart, onTouchEnd }) {
  const contents = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data
      .filter(row => row.status && row.status.length > 2 && !/^\d+$/.test(row.status) && !row.status.includes("복지관으로 이동"))
      .map(row => ({
        teacher: row.teacher,
        content: row.status,
        student: row.student
      }));
  }, [data]);

  const themes = [
    { name: 'AI & 스마트 도구', keywords: ['Gemini', 'AI', 'GPT', '제미나이', '구글렌즈', '클로바', '챗지피티', '인공지능', '이미지', '파파고', '번역', '음성인식', '스마트렌즈', '빅스비', '시리', '챗봇'], icon: '✨', color: 'bg-indigo-50 text-indigo-700 border-indigo-100', baseInsight: '최신 AI 도구 활용이 두드러졌습니다. 단순 검색을 넘어 이미지 생성 및 문제 해결 단계로 교육이 고도화되고 있습니다.' },
    { name: '기기 & 보안 설정', keywords: ['와이파이', '블루투스', '화면', '소리', '벨소리', '알림', '글자', '업데이트', '비밀번호', '잠금', '보안', '용량', '배터리', '설정', '스미싱', '보이스피싱', '스팸', '바이러스', '백신'], icon: '⚙️', color: 'bg-gray-50 text-gray-700 border-gray-200', baseInsight: '스마트폰 기본 설정 및 보안 교육이 진행되어, 어르신들의 안전하고 편리한 스마트폰 사용 환경이 마련되었습니다.' },
    { name: '교통 & 이동', keywords: ['지도', '카카오T', '카카오티', '택시', '코레일', '따릉이', 'SRT', '고속버스', '길찾기', '내비게이션', '지하철', '버스', '노선', '승차권', '티켓', '기차', '예매'], icon: '🚲', color: 'bg-green-50 text-green-700 border-green-100', baseInsight: '교통 앱 활용 교육을 통해 어르신들의 이동 편의성과 자립적인 외출 능력이 크게 향상되었습니다.' },
    { name: '금융 & 결제', keywords: ['페이', '이체', '은행', '지로', '보험', '증권', '토스', '카드', '서울페이', '제로페이', '카카오페이', '삼성페이', '네이버페이', '계좌', '송금', '환전'], icon: '💰', color: 'bg-yellow-50 text-yellow-700 border-yellow-100', baseInsight: '모바일 금융 및 간편 결제 교육이 진행되었습니다. 안전한 디지털 금융 활용을 위한 보안 주의사항도 함께 강조되었습니다.' },
    { name: '소셜 & 커뮤니케이션', keywords: ['카카오톡', '카톡', '메시지', '문자', '이메일', '페이스톡', '밴드', '인스타그램', '페이스북', '유선', '연락처', '전화', '단톡방', '오픈채팅'], icon: '💬', color: 'bg-blue-50 text-blue-700 border-blue-100', baseInsight: '다양한 메신저와 SNS 활용법이 중점적으로 다루어져 어르신들의 온라인 소통 창구가 넓어졌습니다.' },
    { name: '미디어 & 콘텐츠', keywords: ['유튜브', '유트브', '사진', '영상', '편집', '갤러리', '숏츠', '릴스', '틱톡', '키네마스터', 'VITA', '캡처', '촬영', '음악', '멜론', '라디오', '팟캐스트'], icon: '🎥', color: 'bg-red-50 text-red-700 border-red-100', baseInsight: '사진/영상 촬영 및 편집 교육을 통해 디지털 콘텐츠 창작에 대한 높은 흥미와 성취감을 보였습니다.' },
    { name: '쇼핑 & 배달', keywords: ['배민', '배달의민족', '요기요', '쿠팡', '당근', '당근마켓', '중고나라', '쇼핑', '마트', '장보기', '이마트', '홈플러스', 'G마켓', '11번가', '주문', '키오스크', '무인'], icon: '🛒', color: 'bg-orange-50 text-orange-700 border-orange-100', baseInsight: '비대면 쇼핑, 배달 앱 및 키오스크 활용 교육이 이루어져 일상생활의 디지털 자립도가 높아졌습니다.' },
    { name: '공공행정 & 의료', keywords: ['정부24', '홈택스', '주민등록', '증명서', '민원', '국세청', '보조금', '복지로', 'PASS', '패스', '모바일신분증', '병원', '약국', '건강', '만보기', '혈압', '진료', '똑닥', '예방'], icon: '🏥', color: 'bg-teal-50 text-teal-700 border-teal-100', baseInsight: '공공 서비스 앱과 의료/건강 관리 앱 교육이 진행되어, 생활에 필수적인 디지털 행정 및 건강 관리 역량이 강화되었습니다.' }
  ];

  const categorized = useMemo(() => {
    return themes.map(theme => {
      const matched = contents.filter(c => theme.keywords.some(k => c.content.toLowerCase().includes(k.toLowerCase())));
      return { ...theme, items: matched };
    }).filter(t => t.items.length > 0);
  }, [contents]);

  const uncategorized = useMemo(() => {
    return contents.filter(c => !themes.some(theme => theme.keywords.some(k => c.content.toLowerCase().includes(k.toLowerCase()))));
  }, [contents]);

  const attendanceStats = useMemo(() => {
    if (!data || data.length === 0) return null;
    let total = 0, attended = 0, absent = 0, canceled = 0, vacation = 0;
    const absentReasons = [];

    data.forEach(row => {
      const studentStr = (row.student || "").trim();
      if (!studentStr || studentStr === "-" || studentStr.includes("자체학습") || studentStr.includes("대상자발굴")) return;

      const statusStr = (row.status || "").trim();
      if (statusStr.includes("복지관으로 이동")) return; // '선생님휴가' 제외 로직 제거

      const studentNames = studentStr.split(/[/,]/).map(s => s.trim()).filter(Boolean);
      const statusParts = statusStr.includes('/') ? statusStr.split('/') : [statusStr];

      const isShowHeadcount = (studentStr.includes("보조강사") || studentStr.includes("경로당")) && studentNames.length < 2;

      studentNames.forEach((name, idx) => {
        const isAssistant = name.includes("보조강사");
        if (isAssistant && !statusStr) return;

        let studentStatus = (statusParts.length > idx) ? statusParts[idx].trim() : statusParts[0].trim();

        let headcount = 1;
        if (isShowHeadcount) {
          const hcMatch = studentStatus.match(/^(\d+)/);
          if (hcMatch) {
            headcount = parseInt(hcMatch[1], 10);
          }
        }

        total += headcount;

        const hasAttendanceMark = hasIndependentKeyword(studentStatus, ["1", "출석"]);

        if (studentStatus.includes("결석")) {
          absent += headcount;
          if (studentStatus.includes("병원") || studentStatus.includes("진료")) absentReasons.push("병원 진료");
          else if (studentStatus.includes("행사") || studentStatus.includes("일정") || studentStatus.includes("집안")) absentReasons.push("개인 일정");
          else if (studentStatus.includes("여행")) absentReasons.push("여행");
        } else if (studentStatus.includes("휴가") || studentStatus.includes("선생님휴가")) {
          vacation += headcount;
        } else if (checkIsCanceled(studentStatus)) {
          canceled += headcount;
          if (hasAttendanceMark) {
            attended += headcount;
          }
        } else if (studentStatus) {
          const isAttended = isAssistant || /^[1-9]\d*/.test(studentStatus) || studentStatus.length > 2 || studentStatus === "1" || studentStatus === "출석";
          if (isAttended) attended += headcount;
        }
      });
    });

    const rate = total > 0 ? Math.round((attended / total) * 100) : 0;
    return { total, attended, absent, canceled, vacation, rate, absentReasons: [...new Set(absentReasons)] };
  }, [data]);

  const dynamicInsights = useMemo(() => {
    const insights = [];

    if (attendanceStats) {
      if (attendanceStats.rate >= 90) {
        insights.push(`오늘 **${team}**은 **${attendanceStats.rate}%**의 높은 참여율을 기록하며 교육 열기가 매우 높았습니다.`);
      } else if (attendanceStats.rate < 70 && attendanceStats.absent > 0) {
        const reasons = attendanceStats.absentReasons.length > 0 ? attendanceStats.absentReasons.join(', ') : '개인 일정';
        insights.push(`오늘은 **${reasons}** 등의 사유로 결석이 다소 발생했으나, 출석하신 어르신들은 밀도 높은 1:1 맞춤형 수업을 진행했습니다.`);
      }
    }

    const sorted = [...categorized].sort((a, b) => b.items.length - a.items.length);
    if (sorted.length > 0) {
      const top = sorted[0];
      const foundKeywords = [];
      top.items.forEach(item => {
        top.keywords.forEach(kw => {
          if (item.content.toLowerCase().includes(kw.toLowerCase()) && !foundKeywords.includes(kw)) {
            foundKeywords.push(kw);
          }
        });
      });

      let themeText = `**[${top.name}]** 분야가 오늘 교육의 핵심이었습니다. `;
      if (foundKeywords.length > 0) {
        themeText += `특히 **${foundKeywords.slice(0, 3).join(', ')}** 등에 대한 실질적인 활용법 교육이 활발히 이루어졌습니다. `;
      }
      themeText += top.baseInsight;
      insights.push(themeText);
    }

    if (sorted.length >= 2) {
      const name1 = sorted[0].name;
      const name2 = sorted[1].name;
      const getParticle = (name) => {
        if (name.includes('설정') || name.includes('이동') || name.includes('커뮤니케이션') || name.includes('배달')) return '과';
        return '와';
      };
      const particle = getParticle(name1);
      insights.push(`**${name1}**${particle} **${name2}** 등 여러 영역을 넘나드는 복합적인 디지털 교육이 진행되어 어르신들의 종합적인 활용 능력이 강화되었습니다.`);
    }

    const allContent = contents.map(c => c.content).join(' ');
    if (allContent.includes('키오스크') && (allContent.includes('페이') || allContent.includes('이체'))) {
      insights.push(`실생활 결제와 직결되는 **키오스크 및 금융 앱** 연계 교육이 진행되어 어르신들의 독립적인 일상생활 수행 능력이 크게 향상될 것으로 기대됩니다.`);
    }
    if (allContent.includes('Gemini') || allContent.includes('제미나이') || allContent.includes('AI')) {
      insights.push(`**생성형 AI(Gemini 등)**를 활용한 최첨단 교육이 시도되어, 어르신들이 최신 디지털 트렌드에 발맞추어 나가는 모습이 인상적입니다.`);
    }

    if (attendanceStats && attendanceStats.attended === 0) {
      return ["입력된 학습 관련 데이터가 없습니다."];
    }

    return insights.length > 0 ? insights : ["현재 기록된 데이터로 보아 기초 디지털 역량 강화에 집중하고 있는 시기입니다."];
  }, [categorized, attendanceStats, team, contents]);

  if (contents.length === 0 && (!attendanceStats || attendanceStats.total === 0)) {
    return (
      <div className="mt-8 bg-white rounded-2xl shadow-lg border border-gray-100 p-10 text-center animate-fadeIn">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-50 rounded-full mb-6">
          <BookOpen className="w-10 h-10 text-gray-200" />
        </div>
        <h3 className="text-xl font-bold text-gray-400 mb-2">오늘 기록된 상세 교육 내용이 없습니다.</h3>
        <p className="text-gray-400 text-base">서포터즈들의 활동 기록이 입력되면 AI 기반 요약이 자동으로 생성됩니다.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 animate-fadeIn mb-0" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="bg-white rounded-2xl shadow-xl border border-blue-100 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-sm">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <div>
              <h3 className="text-white font-black text-xl leading-tight">오늘의 교육 요약 & 인사이트</h3>
              <p className="text-blue-100 text-sm font-medium opacity-90">{team} 활동 보고</p>
            </div>
          </div>
          <div className="hidden sm:block bg-blue-500/30 px-3 py-1 rounded-full border border-white/20 text-white text-xs font-bold uppercase tracking-wider">
            AI Analytics
          </div>
        </div>

        <div className="p-6 md:p-8">
          {attendanceStats && (
            <div className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100 flex flex-col items-center justify-center shadow-sm">
                <span className="text-blue-600 text-xs font-black mb-1 uppercase tracking-wider">전체 학생</span>
                <span className="text-2xl font-black text-blue-900">{attendanceStats.total}명</span>
              </div>
              <div className="bg-green-50 rounded-2xl p-4 border border-green-100 flex flex-col items-center justify-center shadow-sm">
                <span className="text-green-600 text-xs font-black mb-1 uppercase tracking-wider">출석 완료</span>
                <span className="text-2xl font-black text-green-900">{attendanceStats.attended}명</span>
              </div>
              <div className="bg-red-50 rounded-2xl p-4 border border-red-100 flex flex-col items-center justify-center shadow-sm">
                <span className="text-red-600 text-xs font-black mb-1 uppercase tracking-wider">결석/종료/휴가</span>
                <span className="text-2xl font-black text-red-900">{attendanceStats.absent}/{attendanceStats.canceled}/{attendanceStats.vacation}명</span>
              </div>
              <div className="bg-purple-50 rounded-2xl p-4 border border-purple-100 flex flex-col items-center justify-center shadow-sm">
                <span className="text-purple-600 text-xs font-black mb-1 uppercase tracking-wider">출석률</span>
                <span className="text-2xl font-black text-purple-900">{attendanceStats.rate}%</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-0">
            <div className="space-y-5">
              <h4 className="font-black text-gray-800 flex items-center gap-2 text-lg">
                <div className="w-2 h-7 bg-blue-500 rounded-full"></div>
                핵심 교육 테마
              </h4>
              <div className="flex flex-wrap gap-2.5">
                {categorized.map((t, i) => (
                  <div key={i} className={`px-4 py-2.5 rounded-2xl border-2 font-bold text-sm flex items-center gap-2.5 shadow-sm transition-all hover:scale-105 ${t.color}`}>
                    <span className="text-lg">{t.icon}</span>
                    {t.name}
                    <span className="bg-white/60 px-2 py-0.5 rounded-lg text-xs border border-current/10">{t.items.length}건</span>
                  </div>
                ))}
                {uncategorized.length > 0 && (
                  <div className="px-4 py-2.5 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-700 font-bold text-sm flex items-center gap-2.5 shadow-sm">
                    <span className="text-lg">📝</span> 기타 실습
                    <span className="bg-white/60 px-2 py-0.5 rounded-lg text-xs border border-gray-200">{uncategorized.length}건</span>
                  </div>
                )}
                {categorized.length === 0 && uncategorized.length === 0 && (
                  <div className="px-4 py-2.5 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-500 font-bold text-sm flex items-center shadow-sm w-full justify-center">
                    기록된 상세 교육 내용(메모)이 없습니다.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-5">
              <h4 className="font-black text-gray-800 flex items-center gap-2 text-lg">
                <div className="w-2 h-7 bg-indigo-500 rounded-full"></div>
                오늘의 인사이트
              </h4>
              {dynamicInsights.length > 0 ? (
                <div className="bg-indigo-50/50 rounded-2xl p-5 border-2 border-indigo-100 shadow-inner">
                  <ul className="space-y-4">
                    {dynamicInsights.map((insight, i) => (
                      <li key={i} className="flex gap-3 text-[15px] md:text-[16px] text-gray-700 leading-relaxed">
                        <span className="text-indigo-500 mt-1.5 font-black shrink-0">●</span>
                        <p className="font-medium" dangerouslySetInnerHTML={{ __html: insight.replace(/\*\*(.*?)\*\*/g, '<span class="text-indigo-800 font-extrabold">$1</span>') }}></p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200 text-gray-500 text-center font-medium">
                  인사이트를 분석할 충분한 데이터가 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// 📅 DailyScheduleApp 메인 컴포넌트
// =====================================================================
export default function DailyScheduleApp({ initialTeam, onNavigateBack, onTeamChange }) {
  const [selectedTeam, setSelectedTeam] = useState(initialTeam || "1팀");
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const [currentDisplayDate, setCurrentDisplayDate] = useState(() => {
    try {
      const savedDate = window.sessionStorage.getItem('sungdong_daily_schedule_date');
      if (savedDate) {
        const parsedDate = new Date(parseInt(savedDate, 10));
        if (!isNaN(parsedDate.getTime())) return parsedDate;
      }
    } catch (e) { }

    let d = new Date();
    d.setHours(0, 0, 0, 0);
    if (d.getDay() === 6) d.setDate(d.getDate() + 2);
    else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d;
  });

  useEffect(() => {
    try {
      window.sessionStorage.setItem('sungdong_daily_schedule_date', currentDisplayDate.getTime().toString());
    } catch (e) { }
  }, [currentDisplayDate]);

  const [scheduleData, setScheduleData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [holidaysDbList, setHolidaysDbList] = useState([]);

  useEffect(() => {
    const loadHolidays = async () => {
      try {
        const { data, error } = await supabaseClient.from('holidays').select('date');
        if (!error && data) {
          const list = data.map(d => d.date);
          console.log("Loaded holidaysDbList:", list);
          setHolidaysDbList(list);
        }
      } catch (e) { console.error("holidays fetch error", e); }
    };
    loadHolidays();
  }, []);

  useEffect(() => {
    if (holidaysDbList.length > 0) {
      setCurrentDisplayDate(prev => {
        let temp = new Date(prev);
        let changed = false;
        while (
          temp.getDay() === 0 ||
          temp.getDay() === 6 ||
          holidaysDbList.includes(getLocalDateString(temp)) ||
          holidaysDbList.includes(getLocalDateString(temp).substring(5))
        ) {
          temp.setDate(temp.getDate() + 1);
          changed = true;
        }
        return changed ? temp : prev;
      });
    }
  }, [holidaysDbList]);


  const [selectedStudentDates, setSelectedStudentDates] = useState(null);

  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const latestFetchRef = useRef(null);

  useEffect(() => {
    document.documentElement.style.overscrollBehaviorY = 'auto';
    document.body.style.overscrollBehaviorY = 'auto';
  }, []);

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

    if (isLoading) {
      touchStartX.current = null;
      touchStartY.current = null;
      return;
    }

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 150) {
      if (deltaX > 0) handleDateChange(1);
      else handleDateChange(-1);
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  const fetchTeamData = useCallback(async (teamName, displayDate) => {
    if (!teamName) return;

    const fetchId = Date.now().toString() + Math.random().toString();
    latestFetchRef.current = fetchId;

    setIsLoading(true);
    setScheduleData([]);
    setNotice("");

    try {
      const dateStr = getLocalDateString(displayDate);
      const { data: supabaseRecords, error: supabaseError } = await supabaseClient
        .from('daily_logs')
        .select('*')
        .eq('team', teamName)
        .eq('log_date', dateStr);

      if (supabaseError) throw supabaseError;

      const records = supabaseRecords || [];

      if (records.length === 0) {
        if (latestFetchRef.current !== fetchId) return;
        setScheduleData([]);
        setNotice(`⚠️ 해당 날짜(${dateStr})의 일지 데이터가 없습니다.`);
        setIsLoading(false);
        return;
      }

      const parsedData = [];
      const teamTeachers = getTeamTeacherNames(teamName);

      teamTeachers.forEach(teacher => {
        const officialShifts = getTeacherShifts(teamName, teacher) || [];
        const group = getTeacherGroup(teamName, teacher);
        officialShifts.forEach(shift => {
          parsedData.push({
            group: group,
            teacher: teacher,
            time: shift,
            student: "-",
            status: "-",
            location: "",
            sessionCounts: null,
            isSpecial: false
          });
        });
      });

      records.forEach(r => {
        const group = getTeacherGroup(teamName, r.teacher);
        const mappedTime = mapShiftToOfficial(teamName, r.teacher, r.shift);

        const existingIdx = parsedData.findIndex(p => p.teacher === r.teacher && p.time === mappedTime && p.student === "-");
        const formattedRecord = {
          group: group,
          teacher: r.teacher,
          time: mappedTime,
          student: r.student || "",
          status: r.status || "",
          location: r.location || "",
          sessionCounts: null,
          isSpecial: false
        };

        if (existingIdx !== -1) {
          parsedData[existingIdx] = formattedRecord;
        } else {
          parsedData.push(formattedRecord);
        }
      });

      let allTeamRecords = [];
      let histFrom = 0;
      const histStep = 1000;
      let histHasMore = true;

      while (histHasMore) {
        const histTo = histFrom + histStep - 1;
        const { data: histData, error: histError } = await supabaseClient
          .from('daily_logs')
          .select('log_date, student, status, teacher, shift')
          .eq('team', teamName)
          .neq('student', '')
          .not('student', 'is', null)
          .lte('log_date', dateStr)
          .order('log_date', { ascending: true })
          .order('id', { ascending: true })
          .range(histFrom, histTo);

        if (histError) throw histError;
        if (histData && histData.length > 0) {
          allTeamRecords = allTeamRecords.concat(histData);
          if (histData.length < histStep) {
            histHasMore = false;
          } else {
            histFrom += histStep;
          }
        } else {
          histHasMore = false;
        }
      }

      const studentDatesMap = {};
      const studentOffsetsMap = {};
      allTeamRecords.forEach(hRow => {
        if (!hRow.student) return;
        const names = hRow.student.split(/[/,]/).map(s => s.trim().split('(')[0].trim()).filter(Boolean);
        names.forEach((name, nameIdx) => {
          const excludeKeywords = ["보조강사", "자체학습", "대상자발굴", "도선복지관", "소양교육", "간담회", "수업", "준비", "컴기초", "공휴일", "근로자의날", "근로자의 날", "삼일절", "3.1절", "어린이날", "현충일", "광복절", "개천절", "한글날", "석가탄신일", "부처님오신날", "성탄절", "제헌절", "추석", "설날", "신정", "대체공휴일", "지방선거일", "지방 선거일", "선거일"];
          if (excludeKeywords.some(keyword => name.includes(keyword))) return;

          let personalStatus = hRow.status || "";
          if (personalStatus.includes('/')) {
            const segments = personalStatus.split('/');
            if (segments.length > nameIdx) {
              personalStatus = segments[nameIdx].trim();
            }
          }

          const hasEndOrCancel = checkIsCanceled(personalStatus);
          const hasAttendance = hasIndependentKeyword(personalStatus, ["1", "출석"]);
          const isAbsentOrCanceled = personalStatus.includes("결석") || personalStatus.includes("선생님휴가") || (hasEndOrCancel && !hasAttendance);
          const textToMatch = (hRow.memo || hRow.status || "");
          const memoMatches = Array.from(textToMatch.matchAll(/(\d+)\s*회차/g));
          const hasExplicitCount = memoMatches.length > 0;

          if (!isAbsentOrCanceled || hasExplicitCount) {
            if (hRow.log_date === dateStr) return; // SKIP TODAY'S RECORDS

            if (!studentDatesMap[name]) {
              studentDatesMap[name] = [];
            }
            if (studentOffsetsMap[name] === undefined) studentOffsetsMap[name] = 0;
            const dParts = hRow.log_date.split('-');
            const dateObj = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10));
            const hGroup = getTeacherGroup(teamName, hRow.teacher);
            const hShift = hRow.shift || "";

            let isNew = false;
            if (teamName === "취업팀") {
              const alreadyHas = studentDatesMap[name].some(d => d.date.getTime() === dateObj.getTime() && d.shift === hShift && d.group === hGroup);
              if (!alreadyHas) {
                isNew = true;
              }
            } else {
              const alreadyHas = studentDatesMap[name].some(d => d.date.getTime() === dateObj.getTime());
              if (!alreadyHas) {
                isNew = true;
              }
            }

            if (isNew) {
              if (hasExplicitCount) {
                const matchObj = memoMatches.length > nameIdx ? memoMatches[nameIdx] : memoMatches[0];
                const explicitCount = parseInt(matchObj[1], 10);
                const currentLen = studentDatesMap[name].length;
                studentOffsetsMap[name] = explicitCount - (currentLen + 1);
              }
              studentDatesMap[name].push({ date: dateObj, shift: hShift, group: hGroup });
            }
          }
        });
      });

      // 시간대가 빠른 것부터 회차 계산을 위해 정렬
      Object.keys(studentDatesMap).forEach(name => {
        studentDatesMap[name].sort((a, b) => {
          if (a.date.getTime() !== b.date.getTime()) return a.date.getTime() - b.date.getTime();
          const getT = (s) => {
            if (!s) return 9999;
            const m = s.match(/(\d+):(\d+)/) || s.match(/(\d+)\s*시/);
            return m ? parseInt(m[1]) * 60 + (m[2] ? parseInt(m[2]) : 0) : 9999;
          };
          return getT(a.shift) - getT(b.shift);
        });
      });

      parsedData.sort((a, b) => {
        const weightA = getGroupWeight(a.group);
        const weightB = getGroupWeight(b.group);
        if (weightA !== weightB) return weightA - weightB;

        if (a.teacher !== b.teacher) {
          return getTeacherSortWeight(teamName, a.teacher) - getTeacherSortWeight(teamName, b.teacher);
        }

        return getShiftWeight(a.time) - getShiftWeight(b.time);
      });

      const currentDatesMap = {};
      const currentOffsetsMap = {};
      for (const [k, v] of Object.entries(studentDatesMap)) {
        currentDatesMap[k] = [...v];
      }
      for (const [k, v] of Object.entries(studentOffsetsMap)) {
        currentOffsetsMap[k] = v;
      }

      const todayParts = dateStr.split('-');
      const todayDateObj = new Date(parseInt(todayParts[0], 10), parseInt(todayParts[1], 10) - 1, parseInt(todayParts[2], 10));

      const timeSortedData = [...parsedData].sort((a, b) => {
        const getT = (s) => {
          if (!s) return 9999;
          const m = s.match(/(\d+):(\d+)/) || s.match(/(\d+)\s*시/);
          return m ? parseInt(m[1]) * 60 + (m[2] ? parseInt(m[2]) : 0) : 9999;
        };
        return getT(a.time) - getT(b.time);
      });

      timeSortedData.forEach(row => {
        if (!row.student || row.student.trim() === '-') {
          row.sessionCounts = null;
          return;
        }

        const names = row.student.split(/[/,]/).map(s => s.trim().split('(')[0].trim()).filter(Boolean);
        const countsForThisRow = [];

        names.forEach((name, nameIdx) => {
          const excludeKeywords = ["보조강사", "자체학습", "대상자발굴", "도선복지관", "소양교육", "간담회", "수업", "준비", "컴기초", "공휴일", "근로자의날", "근로자의 날", "삼일절", "3.1절", "어린이날", "현충일", "광복절", "개천절", "한글날", "석가탄신일", "부처님오신날", "성탄절", "제헌절", "추석", "설날", "신정", "대체공휴일", "지방선거일", "지방 선거일", "선거일"];
          if (excludeKeywords.some(keyword => name.includes(keyword))) return;

          let personalStatus = row.status || "";
          if (personalStatus.includes('/')) {
            const segments = personalStatus.split('/');
            if (segments.length > nameIdx) {
              personalStatus = segments[nameIdx].trim();
            }
          }
          const hasCurrentEndOrCancel = checkIsCanceled(personalStatus);
          const hasCurrentAttendance = hasIndependentKeyword(personalStatus, ["1", "출석"]);
          const isAbsent = personalStatus.includes("결석") || personalStatus.includes("선생님휴가") || (hasCurrentEndOrCancel && !hasCurrentAttendance);
          const textToMatch = (row.memo || row.status || "");
          const memoMatches = Array.from(textToMatch.matchAll(/(\d+)\s*회차/g));
          const hasExplicitCount = memoMatches.length > 0;

          if (!currentDatesMap[name]) currentDatesMap[name] = [];
          if (currentOffsetsMap[name] === undefined) currentOffsetsMap[name] = 0;

          if (!isAbsent || hasExplicitCount) {
            let isNew = false;
            if (teamName === "취업팀") {
              const alreadyHas = currentDatesMap[name].some(d => d.date.getTime() === todayDateObj.getTime() && d.shift === row.time && d.group === row.group);
              if (!alreadyHas) {
                isNew = true;
              }
            } else {
              const alreadyHas = currentDatesMap[name].some(d => d.date.getTime() === todayDateObj.getTime());
              if (!alreadyHas) {
                isNew = true;
              }
            }
            if (isNew) {
              currentDatesMap[name].push({ date: todayDateObj, shift: row.time, group: row.group });
            }

            if (hasExplicitCount) {
              const matchObj = memoMatches.length > nameIdx ? memoMatches[nameIdx] : memoMatches[0];
              const explicitCount = parseInt(matchObj[1], 10);
              const currentLen = currentDatesMap[name].length;
              currentOffsetsMap[name] = explicitCount - currentLen;

              // 이전 행들에도 동일한 학생이 있다면 회차를 소급 적용하되, 순서를 유지합니다.
              parsedData.forEach(prevRow => {
                if (prevRow.sessionCounts) {
                  prevRow.sessionCounts.forEach(sc => {
                    if (sc.name === name) {
                      sc.count = sc.dates.length + currentOffsetsMap[name];
                    }
                  });
                }
              });
            }
          }

          const dates = currentDatesMap[name];
          const offset = currentOffsetsMap[name] || 0;
          countsForThisRow.push({
            name: name,
            count: dates.length + offset,
            dates: [...dates]
          });
        });

        if (countsForThisRow.length > 0) {
          row.sessionCounts = countsForThisRow;
        } else {
          row.sessionCounts = null;
        }
      });

      for (let i = 0; i < parsedData.length; i++) {
        parsedData[i].rowspan = { group: 1, teacher: 1, time: 1 };
        parsedData[i].render = { group: true, teacher: true, time: true };
      }

      const colsToMerge = ['group', 'teacher', 'time'];
      for (let c = 0; c < colsToMerge.length; c++) {
        const col = colsToMerge[c];
        let startRow = 0;
        while (startRow < parsedData.length) {
          let count = 1;
          for (let nextRow = startRow + 1; nextRow < parsedData.length; nextRow++) {
            let sameAsParent = true;
            for (let p = 0; p < c; p++) {
              if (parsedData[startRow][colsToMerge[p]] !== parsedData[nextRow][colsToMerge[p]]) {
                sameAsParent = false;
                break;
              }
            }
            if (sameAsParent && parsedData[startRow][col] === parsedData[nextRow][col]) {
              count++;
              parsedData[nextRow].render[col] = false;
            } else {
              break;
            }
          }
          parsedData[startRow].rowspan[col] = count;
          startRow += count;
        }
      }

      if (latestFetchRef.current !== fetchId) return;
      setScheduleData(parsedData);
    } catch (error) {
      if (latestFetchRef.current !== fetchId) return;
      console.error("데이터 로드 에러:", error);
      setNotice("⚠️ 데이터를 가져오지 못했습니다.");
    } finally {
      if (latestFetchRef.current === fetchId) {
        setIsLoading(false);
        setIsInitialLoad(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchTeamData(selectedTeam, currentDisplayDate);
  }, [selectedTeam, currentDisplayDate, fetchTeamData]);

  const handleDateChange = (daysToAdd) => {
    setCurrentDisplayDate(prevDate => {
      let tempDate = new Date(prevDate);
      do {
        tempDate.setDate(tempDate.getDate() + daysToAdd);
      } while (
        tempDate.getDay() === 0 ||
        tempDate.getDay() === 6 ||
        holidaysDbList.includes(getLocalDateString(tempDate)) ||
        holidaysDbList.includes(getLocalDateString(tempDate).substring(5))
      );
      tempDate.setHours(0, 0, 0, 0);
      return tempDate;
    });
    setNotice("");
  };

  const handleToday = () => {
    let d = new Date();
    d.setHours(0, 0, 0, 0);
    while (
      d.getDay() === 0 ||
      d.getDay() === 6 ||
      holidaysDbList.includes(getLocalDateString(d)) ||
      holidaysDbList.includes(getLocalDateString(d).substring(5))
    ) {
      d.setDate(d.getDate() + 1);
    }
    setCurrentDisplayDate(d);
    setNotice("");
  };

  const handleDatePick = (e) => {
    if (!e.target.value) return;
    const parts = e.target.value.split('-');
    const selectedDate = new Date(parts[0], parseInt(parts[1]) - 1, parts[2]);
    selectedDate.setHours(0, 0, 0, 0);
    setCurrentDisplayDate(selectedDate);
    setNotice("");
  };

  const y = currentDisplayDate.getFullYear();
  const m = String(currentDisplayDate.getMonth() + 1).padStart(2, '0');
  const d = String(currentDisplayDate.getDate()).padStart(2, '0');
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const day = dayNames[currentDisplayDate.getDay()];
  const datePickerValue = `${y}-${m}-${d}`;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-transparent font-sans text-gray-800 overflow-y-auto">
      <div className="shrink-0 bg-[#2b5ce6] text-white shadow-md z-40 relative">
        <div className="max-w-5xl mx-auto px-4 pb-4 pt-safe-4 flex justify-between items-start">
          <div>
            <div className="flex items-center mb-1">
              <img src="/Logo_of_Seoul.jpg" alt="서울시 로고" className="h-7 bg-white px-2 py-1 rounded-md object-contain mr-2" onError={(e) => e.target.style.display = 'none'} />
              <h1 className="font-black text-xl leading-tight">성동노인종합복지관</h1>
            </div>
            <p className="text-lg font-bold text-yellow-300 mb-1">디지털교육 서포터즈</p>
          </div>
          <button onClick={onNavigateBack} className="text-xs flex flex-col items-center font-bold p-2 rounded-lg shadow-md transition-all touch-manipulation bg-blue-800 text-white opacity-90 active:scale-95">
            <Home className="w-5 h-5 mb-1" /> 처음으로
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col pb-0">
        <div className="max-w-5xl w-full mx-auto flex-1 flex flex-col p-3 md:p-6 pb-0 mt-2">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col overflow-hidden">
            <div className="shrink-0 z-30 bg-white px-4 md:px-6 pt-4 md:pt-6 pb-4 shadow-[0_4px_10px_-2px_rgba(0,0,0,0.1)] relative">
              <div className="flex flex-row flex-wrap items-center justify-between gap-2 mb-0 border-b border-gray-100 pb-0.5 w-full">
                <h2 className="text-[16px] min-[360px]:text-[18px] landscape:text-[22px] md:text-xl font-bold flex items-center gap-1 md:gap-2 text-gray-800 whitespace-nowrap min-w-0 tracking-tighter sm:tracking-normal">
                  <LucideCalendar className="w-4 h-4 md:w-5 md:h-5 text-blue-500" />
                  오늘의 수업 일정
                </h2>

                <div className="flex border border-gray-300 rounded-lg overflow-hidden shadow-sm shrink-0 ml-auto">
                  {["1팀", "2팀", "3팀", "취업팀"].map(team => (
                    <button key={team} onClick={() => {
                      setSelectedTeam(team);
                      if (onTeamChange) onTeamChange(team);
                    }} className={`px-1 min-[360px]:px-2 md:px-4 py-1 md:py-1.5 border-r border-gray-300 text-[11px] min-[360px]:text-[13px] landscape:text-[18px] md:text-lg font-semibold tracking-tighter transition last:border-r-0 ${selectedTeam === team ? 'bg-[#2b5ce6] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                      {team}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-center min-h-[18px] mt-0 mb-0.5 flex items-center justify-center">
                {isLoading ? (
                  <div className="flex items-center justify-center text-[#DC2626] font-bold text-sm md:text-base animate-pulse tracking-tight">
                    <Clock className="w-5 h-5 md:w-6 md:h-6 mr-1.5 animate-spin" />
                    최신 데이터 확인 중...
                  </div>
                ) : notice ? (
                  <span className="text-red-500 text-sm md:text-base font-bold">{notice}</span>
                ) : null}
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 w-full max-w-md mx-auto">
                <button onClick={() => handleDateChange(-1)} className="w-10 sm:w-12 h-10 sm:h-12 flex items-center justify-center border-[1.5px] border-gray-300 rounded-xl bg-white shadow-sm hover:bg-gray-50 active:bg-gray-100 active:scale-95 touch-manipulation text-gray-700 shrink-0 transition-all">
                  <svg className="w-6 h-6 sm:w-7 sm:h-7" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" /></svg>
                </button>

                <div className="flex-1 h-10 sm:h-12 relative flex items-center justify-center border-[1.5px] border-blue-400 rounded-xl bg-[#f0f7ff] text-center shadow-sm overflow-hidden transition-all">
                  <input
                    type="date"
                    value={datePickerValue}
                    onChange={handleDatePick}
                    onClick={(e) => {
                      try {
                        if (e.target.showPicker) e.target.showPicker();
                      } catch (err) { }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    title="달력 열기"
                  />
                  <div className={`flex items-center justify-center pointer-events-none relative z-0 -translate-y-[1px] whitespace-nowrap px-1`}>
                    <span className="font-extrabold text-[#1e3a8a] text-[15px] min-[360px]:text-[17px] landscape:text-[22px] sm:text-[20px] tracking-tighter whitespace-nowrap">{currentDisplayDate.getMonth() + 1}/{currentDisplayDate.getDate()}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1e3a8a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mx-1 sm:mx-1.5 w-4 h-4 sm:w-5 sm:h-5 shrink-0">
                      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                      <line x1="16" x2="16" y1="2" y2="6" />
                      <line x1="8" x2="8" y1="2" y2="6" />
                      <line x1="3" x2="21" y1="10" y2="10" />
                    </svg>
                    <span className="font-extrabold text-[#1e3a8a] text-[15px] min-[360px]:text-[17px] landscape:text-[22px] sm:text-[20px] tracking-tighter whitespace-nowrap shrink-0">({day})</span>
                  </div>
                </div>

                <button onClick={handleToday} className="text-[13px] sm:text-[15px] px-3 sm:px-4 h-10 sm:h-12 border border-blue-600 rounded-xl font-bold bg-blue-600 text-white shadow-sm flex items-center justify-center hover:bg-blue-700 active:bg-blue-800 active:scale-95 touch-manipulation whitespace-nowrap shrink-0 transition-all">오늘</button>
                <button onClick={() => handleDateChange(1)} className="w-10 sm:w-12 h-10 sm:h-12 flex items-center justify-center border-[1.5px] border-gray-300 rounded-xl bg-white shadow-sm hover:bg-gray-50 active:bg-gray-100 active:scale-95 touch-manipulation text-gray-700 shrink-0 transition-all">
                  <svg className="w-6 h-6 sm:w-7 sm:h-7" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" /></svg>
                </button>
              </div>
            </div>

            <div
              className="flex-1 flex flex-col overflow-hidden px-4 md:px-6 pb-4 md:pb-6 pt-3 bg-gray-50/30"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <div className="bg-white rounded-xl shadow-sm border border-gray-400 w-full flex-1 flex flex-col overflow-hidden">
                <div className="overflow-auto relative rounded-xl flex-1">
                  <table className="w-full table-fixed text-center border-collapse">
                    <thead className="sticky top-0 z-20 shadow-md outline outline-1 outline-blue-500">
                      <tr className="bg-blue-600 text-white text-sm landscape:text-[17px] md:text-base leading-normal">
                        <th className="border border-blue-500 py-1.5 px-1 md:py-2 md:px-4 font-semibold w-[10%] md:w-[10%] break-keep bg-blue-600">조</th>
                        <th className="border border-blue-500 py-1.5 px-1 md:py-2 md:px-4 font-semibold w-[20%] md:w-[18%] break-keep sticky left-0 z-30 bg-blue-600 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.2)]">선생님</th>
                        <th className="border border-blue-500 py-1.5 px-1 md:py-2 md:px-4 font-semibold w-[17%] md:w-[18%] break-keep bg-blue-600">시간</th>
                        <th className="border border-blue-500 py-1.5 px-1 md:py-2 md:px-2 font-semibold w-[37%] md:w-[38%] break-keep bg-blue-600 text-white">학생(장소)</th>
                        <th className="border border-blue-500 py-1.5 px-1 md:py-2 md:px-2 font-semibold w-[16%] md:w-[16%] break-keep bg-blue-600 text-white">회차</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-700 text-xs md:text-sm">
                      {scheduleData.length === 0 ? (
                        <tr><td colSpan="5" className="border border-gray-300 py-6 text-center bg-white">일정 데이터가 없습니다.</td></tr>
                      ) : (
                        scheduleData.map((row, index) => {
                          const isNewTeacher = index > 0 && row.render.teacher;
                          const topBorderStyle = isNewTeacher ? { borderTop: '2px solid #9ca3af' } : {};

                          const tdClass = "border border-gray-400 py-1 px-1 md:py-1.5 md:px-3 align-middle break-keep";

                          let statusColorClass = "text-black font-bold";
                          if (row.status) {
                            const hasEnd = row.status.includes("종료");
                            const hasAbsenceOrCancel = row.status.includes("결석") || checkIsCanceled(row.status);
                            const hasVacation = row.status.includes("휴가");
                            
                            if (hasEnd) {
                              statusColorClass = "text-gray-600 font-bold";
                            } else if (hasAbsenceOrCancel) {
                              statusColorClass = "text-red-600 font-bold";
                            } else if (hasVacation) {
                              statusColorClass = "text-gray-800 font-bold";
                            }
                          }

                          let studentCellBg = "";
                          const combinedText = (row.student || "") + " " + (row.location || "");
                          if (row.status && row.status.includes("선생님휴가")) {
                            studentCellBg = "bg-gray-100";
                          } else if (row.isSpecial || combinedText.includes("공휴일") || combinedText.includes("간담회")) {
                            studentCellBg = "bg-red-200";
                          } else if (combinedText.includes("보조강사")) {
                            studentCellBg = "bg-[#FFFF00]";
                          } else if (combinedText.includes("경로당") || combinedText.includes("도선복지관")) {
                            studentCellBg = "bg-orange-100";
                          } else {
                            const pinkLocs = ["방문", "사근복지관", "삼부", "성원"];
                            if (row.location && pinkLocs.some(loc => row.location.includes(loc))) {
                              studentCellBg = "bg-pink-100";
                            }
                          }

                          const locTextForDisplay = (row.location && row.location.trim() !== '-') ? row.location.trim() : "";
                          const isLocationUrl = locTextForDisplay && (locTextForDisplay.startsWith('http') || locTextForDisplay.startsWith('//') || locTextForDisplay.startsWith('data:') || locTextForDisplay.includes('drive.google.com'));
                          const showLocationText = locTextForDisplay && locTextForDisplay !== "복지관" && !(row.student || "").includes("보조강사") && selectedTeam !== '취업팀' && !isLocationUrl;

                          const hasKiosk = ((row.student || "") + (locTextForDisplay)).includes("키오스크");
                          const studentNames = (row.student || "").split(/[/,]/).map(s => s.trim()).filter(Boolean);
                          const isMultipleStudents = studentNames.length >= 2;
                          const stuLen = (row.student || "").length;

                          let dynamicStuSizeClass = hasKiosk ? "text-[15px] md:text-[16px] landscape:text-[19px]" : "text-[16px] md:text-[18px] landscape:text-[20px]";
                          if (stuLen >= 9) {
                            dynamicStuSizeClass = "text-[12px] min-[360px]:text-[13px] md:text-[15px] landscape:text-[17px] tracking-tighter";
                          } else if (stuLen >= 6) {
                            dynamicStuSizeClass = "text-[14px] min-[360px]:text-[15px] md:text-[16px] landscape:text-[18px] tracking-tight";
                          }

                          return (
                            <tr key={index} className="border-b border-gray-400 hover:bg-blue-50 transition bg-white">
                              {row.render.group && <td className={`${tdClass} font-medium text-gray-800 text-[1.2em] landscape:text-[1.5em]`} rowSpan={row.rowspan.group} style={topBorderStyle}>{typeof row.group === 'string' ? row.group.replace('조', '').trim() : row.group}</td>}

                              {row.render.teacher && (
                                <td className={`${tdClass} bg-blue-100 font-bold text-gray-900 text-[16px] landscape:text-[20px] md:text-[18px] sticky left-0 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]`} rowSpan={row.rowspan.teacher} style={topBorderStyle}>
                                  {typeof row.teacher === 'string' ? (
                                    row.teacher.includes('/') ? (
                                      row.teacher.split('/').map((namePart, idx, arr) => {
                                        const displayName = idx < arr.length - 1 ? namePart.trim() + '/' : namePart.trim();
                                        return (
                                          <div key={idx} className="leading-tight whitespace-nowrap">{displayName}</div>
                                        );
                                      })
                                    ) : (
                                      row.teacher.trim().split(/\s+/).map((namePart, idx) => (
                                        <div key={idx} className="leading-tight whitespace-nowrap">{namePart}</div>
                                      ))
                                    )
                                  ) : (
                                    <div className="leading-tight whitespace-nowrap">{row.teacher}</div>
                                  )}
                                </td>
                              )}

                              {row.render.time && (
                                <td className={`${tdClass} text-gray-700 text-[14px] landscape:text-[18px] md:text-[17px] tracking-tighter`} rowSpan={row.rowspan.time} style={topBorderStyle}>
                                  {typeof row.time === 'string' && row.time.includes('~') ? (
                                    <>
                                      {(() => {
                                        let displayTime = row.time;
                                        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
                                        const dayStr = dayNames[currentDisplayDate.getDay()];
                                        if (selectedTeam === '취업팀' && dayStr === '금') {
                                          const mapping = { "13:00~14:00": "9:30~10:30", "14:00~15:00": "10:30~11:30", "15:00~16:00": "11:30~12:30" };
                                          displayTime = mapping[row.time] || row.time;
                                        }
                                        return (
                                          <>
                                            <div className="flex md:hidden landscape:hidden w-full justify-center items-center leading-tight whitespace-nowrap">
                                              {displayTime.split('~')[0].trim()}~
                                            </div>
                                            <div className="hidden md:flex landscape:flex w-full justify-center items-center leading-tight whitespace-nowrap text-center">
                                              {displayTime.replace(/\s+/g, '')}
                                            </div>
                                          </>
                                        );
                                      })()}
                                    </>
                                  ) : (
                                    <div className="flex w-full justify-center items-center whitespace-nowrap text-center">{row.time}</div>
                                  )}
                                </td>
                              )}

                              <td className={`${tdClass} ${studentCellBg}`} style={topBorderStyle}>
                                <div className={`font-bold text-blue-600 ${dynamicStuSizeClass} leading-[1.1] w-full flex flex-col items-center justify-center`}>
                                  {(!row.student || row.student.trim() === '-') ? null : (
                                    <span className="whitespace-nowrap text-center">{row.student.replace(/\n/g, ' ')}</span>
                                  )}
                                  {showLocationText && row.student && row.student.trim() !== '-' && !locTextForDisplay?.startsWith('http') && !locTextForDisplay?.startsWith('data:') && (
                                    <span className="whitespace-nowrap text-center mt-0.5 font-medium text-gray-500 text-[1.0em]">({locTextForDisplay})</span>
                                  )}
                                </div>
                                <div className={`text-[14px] landscape:text-[18px] md:text-[16px] ${statusColorClass} mt-1 whitespace-pre-wrap break-words break-keep leading-tight text-center`}>
                                  {(!row.status || row.status.trim() === '-') ? null : row.status.split(/(\d+회차)/g).map((part, i) =>
                                    /^\d+회차$/.test(part) ? <span key={i} className="text-[#3366ff]">{part}</span> : part
                                  )}
                                </div>

                                {(selectedTeam?.trim() === '취업팀' || selectedTeam?.toLowerCase().includes('취업')) && row.location && (row.location.toLowerCase().startsWith('http') || row.location.toLowerCase().startsWith('data:') || row.location.toLowerCase().includes('drive.google.com') || row.location.toLowerCase().startsWith('=image')) && (
                                  <div className="mt-2 w-full flex flex-col items-center">
                                    <div className="relative overflow-hidden rounded-lg border border-blue-400 shadow-sm bg-pink-50 p-1">
                                      <img
                                        src={getDirectImageUrl(row.location)}
                                        alt="Sign"
                                        className={`${isMultipleStudents ? 'h-28 sm:h-32' : 'h-14 sm:h-16'} w-auto object-contain mix-blend-multiply`}
                                        onError={(e) => {
                                          const parent = e.target.closest('div');
                                          if (parent) parent.style.display = 'none';
                                        }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </td>

                              <td className={`${tdClass} font-bold text-center text-[13px] landscape:text-[16px] md:text-[15px] transition-colors`} style={topBorderStyle}>
                                {row.sessionCounts && !row.student?.includes("간담회") ? (
                                  <div className="flex flex-col w-full justify-center items-center gap-1">
                                    {row.sessionCounts.map((sc, scIdx) => {
                                      let sessionCellBg = "bg-gray-300";
                                      let sessionTextCol = "text-black";

                                      if (sc.count >= 15) {
                                        sessionCellBg = "bg-orange-600";
                                        sessionTextCol = "text-white";
                                      } else if (sc.count >= 10) {
                                        sessionCellBg = "bg-purple-900";
                                        sessionTextCol = "text-white";
                                      } else if (sc.count >= 7) {
                                        sessionCellBg = "bg-purple-400";
                                        sessionTextCol = "text-white";
                                      }

                                      return (
                                        <div key={scIdx} onClick={() => setSelectedStudentDates(sc)} className={`px-1.5 py-0.5 rounded w-full whitespace-nowrap ${sessionCellBg} ${sessionTextCol} shadow-sm cursor-pointer hover:brightness-95 active:scale-95 transition-all`}>
                                          {sc.count}회차
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <span className="text-purple-700">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <SummarySection
              data={scheduleData}
              date={currentDisplayDate}
              team={selectedTeam}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            />

          </div>
        </div>
      </div>

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
                  const isToday = d.date.getFullYear() === today.getFullYear() && d.date.getMonth() === today.getMonth() && d.date.getDate() === today.getDate();
                  return (
                    <div key={idx} className={`${isToday ? 'bg-purple-300 border-purple-500 shadow-md text-purple-950' : 'bg-purple-50 border-purple-200 shadow-sm text-purple-900'} rounded-lg py-2.5 sm:py-3 px-0.5 sm:px-1 text-center text-[13.5px] min-[360px]:text-[15.5px] sm:text-[18px] font-bold flex justify-center items-center whitespace-nowrap tracking-tighter sm:tracking-normal`}>
                      {d.date.getMonth() + 1}/{d.date.getDate()} ({['일', '월', '화', '수', '목', '금', '토'][d.date.getDay()]})
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
