const fs = require('fs');

let content = fs.readFileSync('index.html', 'utf8');

const oldSaveBatchRegex = /const payload = \{[\s\S]*?throw new Error\("네트워크 응답 오류"\);\s*\n\s*\}/g;

const newSaveBatch = `// Supabase 배치(Upsert) 저장
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
          setSaveProgress(prev => prev.map(item => changedIndices.includes(item.index) ? { ...item, status: '저장 완료' } : item));`;

content = content.replace(oldSaveBatchRegex, newSaveBatch);

fs.writeFileSync('index.html', content, 'utf8');
console.log('Final fix applied');
