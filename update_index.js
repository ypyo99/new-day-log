const fs = require('fs');

let content = fs.readFileSync('index.html', 'utf8');

// 1. Add Supabase Client
const headEnd = '</head>';
const supabaseScript = `
  <!-- 5. Supabase 설정 -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script>
    const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';
    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  </script>
</head>`;
content = content.replace(headEnd, supabaseScript);

// 2. fetchTeachersFromSheet
const oldTeachers = `const response = await fetch(\`\${GOOGLE_SCRIPT_URL}?action=getTeachers&team=\${team}&t=\${Date.now()}\`);
          if (response.ok) {
            const data = await response.json();
            const fetchedTeachers = data.teachers || [];
            setTeachers(fetchedTeachers);
            window.localStorage.setItem(\`sungdong_teachers_\${team}\`, JSON.stringify(fetchedTeachers));
          }`;

const newTeachers = `// Supabase에서 강사 목록 불러오기 (해당 팀의 유니크한 강사명 추출)
          const { data, error } = await window.supabaseClient
            .from('daily_logs')
            .select('teacher')
            .eq('team', team);

          if (error) throw error;
          
          let fetchedTeachers = [];
          if (data && data.length > 0) {
            const teacherSet = new Set();
            data.forEach(row => { if (row.teacher) teacherSet.add(row.teacher); });
            fetchedTeachers = Array.from(teacherSet);
          }
          
          // 만약 데이터베이스가 처음이라 강사가 한 명도 없다면, 기본 선생님 목록 제공
          if (fetchedTeachers.length === 0) {
            fetchedTeachers = ["이름입력(직접타이핑)"]; 
          }
          
          setTeachers(fetchedTeachers);
          window.localStorage.setItem(\`sungdong_teachers_\${team}\`, JSON.stringify(fetchedTeachers));`;

content = content.replace(oldTeachers, newTeachers);

// 3. fetchScheduleAll
const oldSchedule = `const response = await fetch(\`\${GOOGLE_SCRIPT_URL}?action=getScheduleAll&team=\${selectedTeam}&teacher=\${encodeURIComponent(currentUser)}&t=\${Date.now()}\`);
            if (response.ok) {
              const data = await response.json();
              if (isMounted) {
                setAllScheduleData(data || {});
                window.localStorage.setItem(cacheKey, JSON.stringify(data || {}));
              }
            }`;

const newSchedule = `// Supabase에서 스케줄(해당 강사의 모든 기록) 가져오기
            let query = window.supabaseClient
              .from('daily_logs')
              .select('*')
              .eq('team', selectedTeam);
              
            if (currentUser !== "__ALL__") {
              query = query.eq('teacher', currentUser);
            }
            
            const { data: records, error } = await query;
            
            if (error) throw error;
            
            // Supabase 배열 데이터를 기존의 { date: { shift: { student, location, status } } } 구조로 변환
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
            }`;

content = content.replace(oldSchedule, newSchedule);

// 4. saveLogBatch
const oldSaveBatch = `          const payload = {
            action: 'saveLogBatch',
            team: selectedTeam,
            teacher: currentUser,
            date: date,
            items: JSON.stringify(batchItems)
          };

          const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: Object.keys(payload).map(k => \`\${encodeURIComponent(k)}=\${encodeURIComponent(payload[k])}\`).join('&')
          }, 45000); // 배치 처리는 시간이 좀 더 걸릴 수 있으므로 45초 타임아웃

          if (response.ok) {
            const json = await response.json();
            if (json && json.success) {
              isSuccess = true;
              const results = json.results || [];

              // 결과 매핑 및 상태 업데이트
              const validRecords = batchItems.map(item => {
                const res = results.find(r => r.shift === item.shift);
                const finalUrl = (res && res.url) ? res.url : item.location;`;

const newSaveBatch = `          // Supabase 배치(Upsert) 저장
          const upsertData = [];
          
          for (let i = 0; i < batchItems.length; i++) {
            const item = batchItems[i];
            let signature_url = null;
            let location = item.location;
            
            // 취업팀 싸인 처리
            if (selectedTeam.includes("취업팀") && location && location.startsWith("data:image")) {
               // 1. Supabase Storage 에 업로드
               const base64Data = location.split(',')[1];
               const byteCharacters = atob(base64Data);
               const byteNumbers = new Array(byteCharacters.length);
               for (let j = 0; j < byteCharacters.length; j++) {
                  byteNumbers[j] = byteCharacters.charCodeAt(j);
               }
               const byteArray = new Uint8Array(byteNumbers);
               const blob = new Blob([byteArray], { type: 'image/png' });
               
               const fileName = \`\${date}_\${currentUser}_\${item.shift.replace(/[^0-9]/g,"")}_\${Date.now()}.png\`;
               
               const { data: uploadData, error: uploadError } = await window.supabaseClient.storage
                 .from('signatures')
                 .upload(fileName, blob, { contentType: 'image/png', upsert: true });
                 
               if (uploadError) {
                  throw new Error("서명 업로드 실패: " + uploadError.message);
               }
               
               const { data: publicUrlData } = window.supabaseClient.storage.from('signatures').getPublicUrl(fileName);
               signature_url = publicUrlData.publicUrl;
               location = signature_url; // 임시로 클라이언트에 보여줄 용도
            } else if (selectedTeam.includes("취업팀") && (!location || location === "__DELETE__")) {
               // 싸인 삭제시
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
          
          const { data: results, error } = await window.supabaseClient
            .from('daily_logs')
            .upsert(upsertData, { onConflict: 'team, log_date, teacher, shift' })
            .select();
            
          if (error) {
             throw new Error("Supabase 저장 실패: " + error.message);
          }
          
          isSuccess = true;
          
          // 결과 매핑 및 상태 업데이트
          const validRecords = batchItems.map(item => {
            const res = upsertData.find(r => r.shift === item.shift);
            const finalUrl = res ? (res.signature_url || res.location) : item.location;`;

content = content.replace(oldSaveBatch, newSaveBatch);


// 5. saveLogsSlow (fallback logic)
const oldFallback = `            if (selectedTeam === '취업팀' && task.location && task.location.startsWith('data:image')) {
              url = GOOGLE_SCRIPT_URL;
              fetchOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: \`action=saveSignatureLog&team=\${encodeURIComponent(selectedTeam)}&teacher=\${encodeURIComponent(currentUser)}&date=\${task.date}&shift=\${encodeURIComponent(task.shift)}&student=\${encodeURIComponent(task.student)}&status=\${encodeURIComponent(task.statusStr)}&signatureData=\${encodeURIComponent(task.location)}\`
              };
            } else {
              url = \`\${GOOGLE_SCRIPT_URL}?action=saveLog&team=\${selectedTeam}&teacher=\${encodeURIComponent(currentUser)}&date=\${task.date}&shift=\${encodeURIComponent(task.shift)}&location=\${encodeURIComponent(task.location)}&student=\${encodeURIComponent(task.student)}&status=\${encodeURIComponent(task.statusStr)}&t=\${Date.now()}\`;
              fetchOptions = { method: 'GET' };
            }

            for (let attempt = 1; attempt <= 5; attempt++) {
              try {
                setSaveProgress(prev => prev.map(item => item.id === task.id ? { ...item, status: attempt === 1 ? '저장 중...' : \`재시도 중...(\${attempt}/5)\` } : item));
                const response = await fetchWithTimeout(url, fetchOptions, 15000);
                if (response.ok) {
                  const json = await response.json();
                  if (json && json.success === false) throw new Error(json.message || "시트 내부 에러");
                  setSaveProgress(prev => prev.map(item => item.id === task.id ? { ...item, status: '저장 완료' } : item));
                  if (json && json.url) {
                    task.location = json.url;
                  }
                  return task;
                } else throw new Error("네트워크 오류");
              } catch (e) {
                if (attempt === 5) {
                  setSaveProgress(prev => prev.map(item => item.id === task.id ? { ...item, status: '저장 실패' } : item));
                  return null;
                } else {
                  await new Promise(res => setTimeout(res, 1000 + Math.floor(Math.random() * 500)));
                }
              }
            }`;

const newFallback = `            for (let attempt = 1; attempt <= 5; attempt++) {
              try {
                setSaveProgress(prev => prev.map(item => item.id === task.id ? { ...item, status: attempt === 1 ? '저장 중...' : \`재시도 중...(\${attempt}/5)\` } : item));
                
                let location = task.location;
                let signature_url = null;
                
                // 취업팀 서명 처리
                if (selectedTeam.includes('취업팀') && location && location.startsWith('data:image')) {
                   const base64Data = location.split(',')[1];
                   const byteCharacters = atob(base64Data);
                   const byteNumbers = new Array(byteCharacters.length);
                   for (let j = 0; j < byteCharacters.length; j++) {
                      byteNumbers[j] = byteCharacters.charCodeAt(j);
                   }
                   const byteArray = new Uint8Array(byteNumbers);
                   const blob = new Blob([byteArray], { type: 'image/png' });
                   
                   const fileName = \`\${task.date}_\${currentUser}_\${task.shift.replace(/[^0-9]/g,"")}_\${Date.now()}.png\`;
                   
                   const { data: uploadData, error: uploadError } = await window.supabaseClient.storage
                     .from('signatures')
                     .upload(fileName, blob, { contentType: 'image/png', upsert: true });
                     
                   if (uploadError) throw new Error("서명 업로드 실패: " + uploadError.message);
                   
                   const { data: publicUrlData } = window.supabaseClient.storage.from('signatures').getPublicUrl(fileName);
                   signature_url = publicUrlData.publicUrl;
                   location = signature_url;
                } else if (selectedTeam.includes('취업팀') && (!location || location === "__DELETE__")) {
                   location = "";
                   signature_url = null;
                }
                
                const { error: upsertError } = await window.supabaseClient
                  .from('daily_logs')
                  .upsert({
                    team: selectedTeam,
                    log_date: task.date,
                    teacher: currentUser,
                    shift: task.shift,
                    student: task.student || "",
                    location: signature_url ? "" : location || "",
                    status: task.statusStr || "",
                    signature_url: signature_url
                  }, { onConflict: 'team, log_date, teacher, shift' });
                  
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
            }`;

content = content.replace(oldFallback, newFallback);

// 6. Update select box for teachers to allow typing directly.
const selectBlockOld = `<select className="flex-1 h-[48px] sm:h-[56px] px-3 sm:px-4 border border-sky-300 rounded-xl text-xl sm:text-2xl bg-sky-100 text-blue-700 outline-none font-bold shadow-md focus:ring-2 focus:ring-blue-400" value={currentUser} onChange={(e) => setCurrentUser(e.target.value)} disabled={isFetchingTeachers}>
                        <option value="">강사 선택</option>
                        {teachers.map((th, idx) => (
                          <option key={idx} value={th}>{th}</option>
                        ))}
                      </select>`;
                      
const selectBlockNew = `<input 
                        list="teachers-list"
                        placeholder="이름을 입력하거나 선택하세요"
                        className="flex-1 h-[48px] sm:h-[56px] px-3 sm:px-4 border border-sky-300 rounded-xl text-xl sm:text-2xl bg-sky-100 text-blue-700 outline-none font-bold shadow-md focus:ring-2 focus:ring-blue-400" 
                        value={currentUser} 
                        onChange={(e) => setCurrentUser(e.target.value)} 
                        disabled={isFetchingTeachers}
                      />
                      <datalist id="teachers-list">
                        {teachers.map((th, idx) => (
                          <option key={idx} value={th}>{th}</option>
                        ))}
                      </datalist>`;
                      
content = content.replace(selectBlockOld, selectBlockNew);


// Handle Weekly Schedule select block if it exists
const selectBlockWeeklyOld = `<select className="flex-1 h-[48px] sm:h-[56px] px-3 sm:px-4 border border-sky-300 rounded-xl text-xl sm:text-2xl bg-sky-100 text-blue-700 outline-none font-bold shadow-md focus:ring-2 focus:ring-blue-400" value={selectedTeacherForWeekly} onChange={(e) => setSelectedTeacherForWeekly(e.target.value)}>
                        <option value="">강사 선택</option>
                        {teachers.map((th, idx) => (
                          <option key={idx} value={th}>{th}</option>
                        ))}
                      </select>`;
const selectBlockWeeklyNew = `<input 
                        list="weekly-teachers-list"
                        placeholder="이름을 입력하거나 선택하세요"
                        className="flex-1 h-[48px] sm:h-[56px] px-3 sm:px-4 border border-sky-300 rounded-xl text-xl sm:text-2xl bg-sky-100 text-blue-700 outline-none font-bold shadow-md focus:ring-2 focus:ring-blue-400" 
                        value={selectedTeacherForWeekly} 
                        onChange={(e) => setSelectedTeacherForWeekly(e.target.value)} 
                      />
                      <datalist id="weekly-teachers-list">
                        {teachers.map((th, idx) => (
                          <option key={idx} value={th}>{th}</option>
                        ))}
                      </datalist>`;
content = content.replace(selectBlockWeeklyOld, selectBlockWeeklyNew);

fs.writeFileSync('index.html', content, 'utf8');
console.log('Update complete!');
