const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// 1. Modify MainApp props to accept onNavigateToTeamSchedule
content = content.replace(
  /function MainApp\(\{ onNavigateToClassroom, onNavigateToDailySchedule, onNavigateToStudentSearch, onNavigateToMyWeeklySchedule \}\) \{/g,
  `function MainApp({ onNavigateToClassroom, onNavigateToDailySchedule, onNavigateToStudentSearch, onNavigateToMyWeeklySchedule, onNavigateToTeamSchedule }) {`
);

// 2. Replace the <a> tag for "팀 별 전체 일정 보기" with a <button>
const oldButtonHtml = `<a href={getNoCacheUrl(SHEET_URLS[selectedTeam])} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center w-full rounded-xl text-[clamp(17px,4.5vw,24px)] lg:text-[20px] tracking-tight font-extrabold shadow-md text-blue-900 bg-orange-100 border-2 border-orange-300 hover:bg-orange-200 transition-all active:scale-95 min-h-[54px]">
                      <CalendarDaysIcon className="w-6 h-6 sm:w-8 sm:h-8 lg:w-7 lg:h-7 mr-1.5 sm:mr-2" /> 팀 별 전체 일정 보기
                    </a>`;
const newButtonHtml = `<button onClick={() => onNavigateToTeamSchedule(selectedTeam)} className="flex-1 flex items-center justify-center w-full rounded-xl text-[clamp(17px,4.5vw,24px)] lg:text-[20px] tracking-tight font-extrabold shadow-md text-blue-900 bg-orange-100 border-2 border-orange-300 hover:bg-orange-200 transition-all active:scale-95 touch-manipulation min-h-[54px]">
                      <CalendarDaysIcon className="w-6 h-6 sm:w-8 sm:h-8 lg:w-7 lg:h-7 mr-1.5 sm:mr-2" /> 팀 별 전체 일정 보기
                    </button>`;
content = content.replace(oldButtonHtml, newButtonHtml);

// 3. Add TeamScheduleApp component before RootApp
const teamScheduleAppCode = `
    // =====================================================================
    // 🖥️ 신규: 팀 별 전체 일정 보기 프로그램
    // =====================================================================
    function TeamScheduleApp({ team, onNavigateBack }) {
      const [data, setData] = useState([]);
      const [loading, setLoading] = useState(true);
      const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
      const [teacherFilter, setTeacherFilter] = useState("전체");
      const [uniqueTeachers, setUniqueTeachers] = useState([]);

      const fetchTeamData = async (month) => {
        setLoading(true);
        try {
          // 해당 달의 데이터만 가져오기 위해 like 쿼리 사용 (예: 2026-05%)
          const { data: records, error } = await window.supabaseClient
            .from('daily_logs')
            .select('*')
            .eq('team', team)
            .like('log_date', \`\${month}-%\`)
            .order('log_date', { ascending: false })
            .order('shift', { ascending: true });

          if (error) throw error;
          
          if (records) {
             setData(records);
             const tSet = new Set();
             records.forEach(r => { if (r.teacher) tSet.add(r.teacher); });
             setUniqueTeachers(Array.from(tSet).sort());
          }
        } catch (e) {
          console.error("데이터 로딩 실패:", e);
        } finally {
          setLoading(false);
        }
      };

      useEffect(() => {
        if (team) fetchTeamData(selectedMonth);
      }, [team, selectedMonth]);

      // 월 변경 핸들러
      const changeMonth = (offset) => {
        const [year, m] = selectedMonth.split('-');
        let d = new Date(parseInt(year), parseInt(m) - 1 + offset, 1);
        const newY = d.getFullYear();
        const newM = String(d.getMonth() + 1).padStart(2, '0');
        setSelectedMonth(\`\${newY}-\${newM}\`);
      };

      const filteredData = data.filter(d => teacherFilter === "전체" || d.teacher === teacherFilter);

      // 날짜별로 그룹화
      const groupedByDate = {};
      filteredData.forEach(item => {
        if (!groupedByDate[item.log_date]) groupedByDate[item.log_date] = [];
        groupedByDate[item.log_date].push(item);
      });

      return (
        <div className="max-w-4xl mx-auto min-h-screen bg-gray-50 flex flex-col font-sans sm:px-0 lg:px-4 lg:py-6">
          <div className="bg-white lg:rounded-2xl lg:shadow-xl lg:border lg:border-blue-100 flex-1 flex flex-col overflow-hidden relative">
            {/* Header */}
            <div className="relative bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 flex items-center h-[56px] sm:h-[64px] px-3 sm:px-4 shrink-0 shadow-md z-20">
              <button onClick={onNavigateBack} className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center text-white/90 hover:bg-white/15 rounded-full transition-colors active:scale-90 touch-manipulation">
                <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7" />
              </button>
              <h1 className="flex-1 text-center text-[19px] sm:text-[22px] font-black text-white tracking-tight flex items-center justify-center gap-2">
                <CalendarDaysIcon className="w-5 h-5 sm:w-6 sm:h-6 opacity-90" />
                {team} 전체 일정
              </h1>
              <div className="w-10 sm:w-11"></div>
            </div>

            {/* 필터 및 월 선택 */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex flex-col sm:flex-row gap-3 justify-between items-center z-10 shadow-sm relative">
              <div className="flex items-center gap-2 bg-blue-50 rounded-lg p-1 border border-blue-100 w-full sm:w-auto justify-center">
                <button onClick={() => changeMonth(-1)} className="p-1.5 text-blue-600 hover:bg-blue-200 rounded-md transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <div className="font-bold text-blue-900 px-2 min-w-[90px] text-center">{selectedMonth}</div>
                <button onClick={() => changeMonth(1)} className="p-1.5 text-blue-600 hover:bg-blue-200 rounded-md transition-colors"><ChevronRight className="w-5 h-5" /></button>
              </div>
              
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-sm font-bold text-gray-600 whitespace-nowrap">강사 필터:</span>
                <select 
                  className="flex-1 sm:w-40 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-bold text-blue-800 bg-white shadow-sm focus:ring-2 focus:ring-blue-400 outline-none"
                  value={teacherFilter}
                  onChange={(e) => setTeacherFilter(e.target.value)}
                >
                  <option value="전체">전체보기</option>
                  {uniqueTeachers.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* 콘텐츠 영역 */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-5 bg-slate-50">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-40 text-blue-500">
                  <RotateCcw className="w-8 h-8 animate-spin mb-3" />
                  <p className="font-bold">데이터를 불러오는 중입니다...</p>
                </div>
              ) : Object.keys(groupedByDate).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 bg-white rounded-xl border border-dashed border-gray-300">
                  <p className="text-gray-500 font-bold">해당 월에 등록된 일정이 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {Object.entries(groupedByDate).sort(([a], [b]) => b.localeCompare(a)).map(([dateStr, items]) => (
                    <div key={dateStr} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                      <div className="bg-blue-100/50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
                        <CalendarIcon className="w-5 h-5 text-blue-600" />
                        <span className="font-black text-blue-900 text-[17px]">{dateStr} ({getDayName(dateStr)})</span>
                      </div>
                      <div className="p-0">
                        <div className="hidden sm:grid sm:grid-cols-5 bg-gray-50 border-b border-gray-200 px-4 py-2 text-sm font-bold text-gray-600 text-center">
                          <div>강사명</div>
                          <div>시간</div>
                          <div>대상(학생)</div>
                          <div>장소/서명</div>
                          <div>출결 상태</div>
                        </div>
                        {items.map((item, idx) => (
                          <div key={idx} className="flex flex-col sm:grid sm:grid-cols-5 border-b border-gray-100 last:border-0 px-4 py-3 sm:py-2 text-center text-sm items-center hover:bg-sky-50 transition-colors">
                            <div className="flex items-center gap-2 sm:justify-center w-full sm:w-auto mb-1 sm:mb-0 text-left sm:text-center">
                              <span className="sm:hidden font-bold text-gray-400 text-xs w-16">강사명:</span>
                              <span className="font-bold text-gray-800">{item.teacher}</span>
                            </div>
                            <div className="flex items-center gap-2 sm:justify-center w-full sm:w-auto mb-1 sm:mb-0 text-left sm:text-center">
                              <span className="sm:hidden font-bold text-gray-400 text-xs w-16">시간:</span>
                              <span className="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded sm:bg-transparent sm:px-0 sm:py-0">{item.shift}</span>
                            </div>
                            <div className="flex items-center gap-2 sm:justify-center w-full sm:w-auto mb-1 sm:mb-0 text-left sm:text-center">
                              <span className="sm:hidden font-bold text-gray-400 text-xs w-16">대상:</span>
                              <span className={\`\${item.student?.includes('보조강사') ? 'bg-yellow-200 px-1 rounded' : ''} text-gray-700 font-medium\`}>{item.student || '-'}</span>
                            </div>
                            <div className="flex items-center gap-2 sm:justify-center w-full sm:w-auto mb-1 sm:mb-0 text-left sm:text-center">
                              <span className="sm:hidden font-bold text-gray-400 text-xs w-16">장소:</span>
                              {item.signature_url ? (
                                <a href={item.signature_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline text-xs font-bold hover:text-blue-700">서명 보기</a>
                              ) : (
                                <span className="text-gray-600 truncate max-w-[150px]">{item.location || '-'}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 sm:justify-center w-full sm:w-auto text-left sm:text-center">
                              <span className="sm:hidden font-bold text-gray-400 text-xs w-16">상태:</span>
                              <span className={\`font-bold \${item.status?.includes('결석') || item.status?.includes('취소') ? 'text-red-500' : 'text-green-600'}\`}>
                                {item.status || '-'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    function RootApp() {`;
content = content.replace('    function RootApp() {', teamScheduleAppCode);


// 4. Update RootApp to support teamSchedule view
content = content.replace(
/      if \(currentView === 'myWeeklySchedule'\) \{/g,
`      if (currentView === 'teamSchedule') {
        return <TeamScheduleApp team={selectedTeamForSchedule} onNavigateBack={() => setCurrentView('main')} />;
      }

      if (currentView === 'myWeeklySchedule') {`
);

// 5. Update MainApp inside RootApp to pass onNavigateToTeamSchedule
content = content.replace(
/        onNavigateToStudentSearch=\{.*?\}[\s]*\/>;/g,
`        onNavigateToStudentSearch={() => setCurrentView('studentSearch')}
        onNavigateToTeamSchedule={(team) => {
          setSelectedTeamForSchedule(team);
          setCurrentView('teamSchedule');
        }}
      />;`
);

fs.writeFileSync('index.html', content, 'utf8');
console.log('Successfully injected TeamScheduleApp');
