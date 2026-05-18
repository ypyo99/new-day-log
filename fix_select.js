const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const oldSelect = `<select className="flex-1 h-[48px] sm:h-[56px] px-3 sm:px-4 border border-sky-300 rounded-xl text-xl sm:text-2xl bg-sky-100 text-blue-700 outline-none font-bold shadow-md focus:ring-2 focus:ring-blue-400" value={currentUser} onChange={(e) => setCurrentUser(e.target.value)} disabled={isFetchingTeachers}>
                        <option value="">강사 선택</option>
                        {teachers.map((th, idx) => (
                          <option key={idx} value={th}>{th}</option>
                        ))}
                      </select>`;

const newSelect = `<input 
                        list="teachers-list"
                        placeholder="이름을 직접 입력하거나 선택하세요"
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
                      
content = content.replace(oldSelect, newSelect);

fs.writeFileSync('index.html', content, 'utf8');
console.log('Select replaced successfully');
