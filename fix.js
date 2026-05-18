const fs = require('fs');

let content = fs.readFileSync('index.html', 'utf8');

// 1. fetchTeachersFromSheet
content = content.replace(
/const fetchTeachersFromSheet = async \(team\) => \{[\s\S]*?setIsFetchingTeachers\(false\);\s*\}\s*\};/,
`const fetchTeachersFromSheet = async (team) => {
        setIsFetchingTeachers(true);
        try {
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
          if (fetchedTeachers.length === 0) {
            fetchedTeachers = ["이름입력(직접타이핑)"]; 
          }
          setTeachers(fetchedTeachers);
          window.localStorage.setItem(\`sungdong_teachers_\${team}\`, JSON.stringify(fetchedTeachers));
        } catch (error) {
          console.error("⚠️ 선생님 목록 로딩 에러:", error);
        } finally {
          setIsFetchingTeachers(false);
        }
      };`
);

// 2. fetchScheduleAll
content = content.replace(
/const fetchScheduleAll = async \(\) => \{[\s\S]*?setIsSyncing\(false\);\s*\}\s*\}\s*\};\s*fetchScheduleAll\(\);/,
`const fetchScheduleAll = async () => {
          if (isMounted) setIsSyncing(true);
          if (isMounted && !cachedSchedule) setIsFetchingSchedule(true);
          try {
            let query = window.supabaseClient.from('daily_logs').select('*').eq('team', selectedTeam);
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
        fetchScheduleAll();`
);

// 3. saveLogBatch (the block inside try around 1616)
content = content.replace(
/const payload = \{[\s\S]*?isSuccess = true;\s*\n\s*return true;/g,
`// Supabase 배치(Upsert) 저장
          const upsertData = [];
          
          for (let i = 0; i < batchItems.length; i++) {
            const item = batchItems[i];
            let signature_url = null;
            let location = item.location;
            
            // 취업팀 싸인 처리
            if (selectedTeam.includes("취업팀") && location && location.startsWith("data:image")) {
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
                 
               if (uploadError) throw new Error("서명 업로드 실패: " + uploadError.message);
               
               const { data: publicUrlData } = window.supabaseClient.storage.from('signatures').getPublicUrl(fileName);
               signature_url = publicUrlData.publicUrl;
               location = signature_url; // 임시로 클라이언트에 보여줄 용도
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
          
          const { data: results, error } = await window.supabaseClient
            .from('daily_logs')
            .upsert(upsertData, { onConflict: 'team, log_date, teacher, shift' })
            .select();
            
          if (error) throw new Error("Supabase 저장 실패: " + error.message);
          
          isSuccess = true;
          
          const validRecords = batchItems.map(item => {
            const res = upsertData.find(r => r.shift === item.shift);
            const finalUrl = res ? (res.signature_url || res.location) : item.location;
            
            setLogs(prev => ({ ...prev, [item.index]: { ...prev[item.index], location: finalUrl } }));
            const backupKey = \`log_backup_\${selectedTeam}_\${currentUser}_\${date}_\${item.index}\`;
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
        return true;`
);

// 4. Fallback retry block
content = content.replace(
/let url, fetchOptions;[\s\S]*?return null;\s*\}\s*\);\s*const resolvedChunk = await Promise.all\(chunkPromises\);/g,
`            let location = task.location;
            let signature_url = null;

            for (let attempt = 1; attempt <= 5; attempt++) {
              try {
                setSaveProgress(prev => prev.map(item => item.id === task.id ? { ...item, status: attempt === 1 ? '저장 중...' : \`재시도 중...(\${attempt}/5)\` } : item));
                
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
            }
            return null;
          });

          const resolvedChunk = await Promise.all(chunkPromises);`
);

fs.writeFileSync('index.html', content, 'utf8');
console.log('Update script executed successfully!');
