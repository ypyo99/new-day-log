const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'MainApp.jsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add getMyOriginalRecord helper if not exists
if (!content.includes('const getMyOriginalRecord = (d, shiftTime)')) {
  const helperStr = `
  const getMyOriginalRecord = (d, shiftTime) => {
    const dayData = allScheduleData[d] || {};
    const shiftData = dayData[shiftTime] || [];
    if (Array.isArray(shiftData)) {
      return shiftData.find(r => r.teacher === currentUser) || {};
    }
    return shiftData || {};
  };
`;
  content = content.replace('const [debouncedStudentsKey, setDebouncedStudentsKey] = useState("");', helperStr + '\n  const [debouncedStudentsKey, setDebouncedStudentsKey] = useState("");');
}

// 2. Fix hasChanges
content = content.replace(
  /const original = todaysOriginalData\[shift\] \|\| \{\};\s*const originalStatus = formatStatusIfDate\(original\.status\);/g,
  `const original = getMyOriginalRecord(date, shift);
      const originalStatus = formatStatusIfDate(original.status);`
);

// 3. Fix performAutoSave initial check
content = content.replace(
  /const original = todaysOriginalData\[shiftTime\] \|\| \{\};\s*const originalStatus = formatStatusIfDate\(original\.status\);/g,
  `const original = getMyOriginalRecord(date, shiftTime);
      const originalStatus = formatStatusIfDate(original.status);`
);

// 4. Fix performAutoSave repeatTargetDates check
content = content.replace(
  /const targetOriginalData = allScheduleData\[targetDate\] \|\| \{\};\s*const currentLog = logs\[index\];\s*const targetOriginal = targetOriginalData\[shifts\[index\]\] \|\| \{\};/g,
  `const currentLog = logs[index];
      const targetOriginal = getMyOriginalRecord(targetDate, shifts[index]);`
);

// 5. Fix handleRepeatScheduleForShift check
content = content.replace(
  /const todaysOriginalData = allScheduleData\[date\] \|\| \{\};\s*const original = todaysOriginalData\[shifts\[index\]\] \|\| \{\};/g,
  `const original = getMyOriginalRecord(date, shifts[index]);`
);

// 6. Fix executeRepeatScheduleForShift check
content = content.replace(
  /const targetOriginalData = allScheduleData\[targetDate\] \|\| \{\};\s*const original = targetOriginalData\[shiftTime\] \|\| \{\};/g,
  `const original = getMyOriginalRecord(targetDate, shiftTime);`
);

// 7. Fix noNewScheduleToRepeat
content = content.replace(
  /const targetData = allScheduleData\[d\] \|\| \{\};\s*return Object\.values\(targetData\)\.some\(s => \{\s*const student = s\?\.student \|\| "";\s*const location = s\?\.location \|\| "";/g,
  `const targetData = allScheduleData[d] || {};
      return Object.keys(targetData).some(shiftTime => {
        const original = getMyOriginalRecord(d, shiftTime);
        const student = original?.student || "";
        const location = original?.location || "";`
);

// 8. Fix noNewScheduleToRepeat targetDates check
content = content.replace(
  /const targetOriginalData = allScheduleData\[targetDate\] \|\| \{\};\s*return shifts\.some\(\(shiftTime, i\) => \{\s*const log = logs\[i\];\s*const original = targetOriginalData\[shiftTime\] \|\| \{\};/g,
  `return shifts.some((shiftTime, i) => {
        const log = logs[i];
        const original = getMyOriginalRecord(targetDate, shiftTime);`
);

// 9. Fix shouldRepeatPerShift check
content = content.replace(
  /const targetData = allScheduleData\[targetDate\] \|\| \{\};\s*const original = targetData\[shiftTime\] \|\| \{\};/g,
  `const original = getMyOriginalRecord(targetDate, shiftTime);`
);

// 10. Fix isSkipDate
content = content.replace(
  /const targetData = allScheduleData\[d\] \|\| \{\};\s*const items = Object\.values\(targetData\)\.filter\(s => \(s\?\.student \|\| ""\)\.trim\(\) !== ""\);\s*if \(items\.length === 0\) return false;\s*return items\.every\(s => \{\s*const student = \(s\?\.student \|\| ""\)\.trim\(\);\s*const location = \(s\?\.location \|\| ""\)\.trim\(\);/g,
  `const targetData = allScheduleData[d] || {};
    const items = Object.keys(targetData).map(shiftTime => getMyOriginalRecord(d, shiftTime)).filter(s => (s?.student || "").trim() !== "");
    if (items.length === 0) return false;

    return items.every(s => {
      const student = (s?.student || "").trim();
      const location = (s?.location || "").trim();`
);

// 11. Fix performAutoSave & executeRepeatScheduleForShift setAllScheduleData
// Both of them have exact same block:
/*
          newData[record.date][record.shift] = {
            student: record.student,
            location: record.location,
            status: record.statusStr
          };
*/
const oldSetLogic = `          newData[record.date][record.shift] = {
            student: record.student,
            location: record.location,
            status: record.statusStr
          };`;

const newSetLogic = `          const shiftData = newData[record.date][record.shift] || [];
          let shiftArr = Array.isArray(shiftData) ? [...shiftData] : [{ teacher: currentUser, ...shiftData }];
          
          const existingIdx = shiftArr.findIndex(r => r.teacher === currentUser);
          if (existingIdx !== -1) {
            shiftArr[existingIdx] = {
              ...shiftArr[existingIdx],
              student: record.student,
              location: record.location,
              status: record.statusStr
            };
          } else {
            shiftArr.push({
              teacher: currentUser,
              student: record.student,
              location: record.location,
              status: record.statusStr
            });
          }
          newData[record.date][record.shift] = shiftArr;`;

content = content.split(oldSetLogic).join(newSetLogic);

fs.writeFileSync(filePath, content, 'utf-8');
console.log("Fix completed.");
