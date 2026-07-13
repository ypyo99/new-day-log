const fs = require('fs');

let studentHistoryMap = { "정갑년": [] };
let seenDateShiftMap = { "정갑년": new Set() };
let team = '2팀';
let name = '정갑년';
let hGroup = 'A그룹';

const data = [
  { log_date: "2026-07-08", shift: "9:30~10:30", teacher: "김경숙", status: "출석" },
  { log_date: "2026-07-08", shift: "10:30~11:30", teacher: "김경숙", status: "출석" },
];

data.forEach(hRow => {
    let dateObj = hRow.log_date;
    let hShift = hRow.shift;
    
    let dateShiftKey = `${dateObj}|${hShift}|${hGroup}`;
    if (seenDateShiftMap[name].has(dateShiftKey)) {
        return;
    }
    seenDateShiftMap[name].add(dateShiftKey);
    
    let isNew = false;
    let isAbsent = false;
    
    if (!isAbsent) {
        const alreadyHas = studentHistoryMap[name].some(d => {
            if (team === '취업팀') {
                return d.date === dateObj && d.shift === hShift && d.group === hGroup;
            } else {
                return d.date === dateObj && d.group === hGroup;
            }
        });
        if (!alreadyHas) isNew = true;
    }
    
    if (isNew) {
        studentHistoryMap[name].push({ date: dateObj, shift: hShift, group: hGroup });
    }
});

console.log("studentHistoryMap length:", studentHistoryMap[name].length);
console.log("shifts in history:", studentHistoryMap[name].map(d => d.shift));

const getTLocal = (s) => {
    if (!s) return 9999;
    const m = s.match(/(\d+):(\d+)/) || s.match(/(\d+)\s*시/);
    return m ? parseInt(m[1]) * 60 + (m[2] ? parseInt(m[2]) : 0) : 9999;
};

// Now simulate validDates calculation
["9:30~10:30", "10:30~11:30"].forEach(currentShift => {
    const currentShiftT = getTLocal(currentShift);
    const validDates = studentHistoryMap[name].filter(h => {
        if (h.date < "2026-07-08") return true;
        if (h.date === "2026-07-08") return getTLocal(h.shift) <= currentShiftT;
        return false;
    });
    console.log(`For cell ${currentShift}, validDates length = ${validDates.length}`);
});
