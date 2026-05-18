const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const target = `<a href={getNoCacheUrl(SHEET_URLS[selectedTeam])} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center w-full rounded-xl text-[clamp(17px,4.5vw,24px)] lg:text-[20px] tracking-tight font-extrabold shadow-md text-blue-900 bg-orange-100 border-2 border-orange-300 hover:bg-orange-200 transition-all active:scale-95 min-h-[54px]">\r\n                      <CalendarDaysIcon className="w-6 h-6 sm:w-8 sm:h-8 lg:w-7 lg:h-7 mr-1.5 sm:mr-2" /> 팀 별 전체 일정 보기\r\n                    </a>`;
const replacement = `<button onClick={() => onNavigateToTeamSchedule(selectedTeam)} className="flex-1 flex items-center justify-center w-full rounded-xl text-[clamp(17px,4.5vw,24px)] lg:text-[20px] tracking-tight font-extrabold shadow-md text-blue-900 bg-orange-100 border-2 border-orange-300 hover:bg-orange-200 transition-all active:scale-95 touch-manipulation min-h-[54px]">\r\n                      <CalendarDaysIcon className="w-6 h-6 sm:w-8 sm:h-8 lg:w-7 lg:h-7 mr-1.5 sm:mr-2" /> 팀 별 전체 일정 보기\r\n                    </button>`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('index.html', content, 'utf8');
    console.log("Success with CRLF");
} else {
    console.log("Not found with CRLF, trying LF...");
    const targetLF = target.replace(/\r\n/g, '\n');
    const replacementLF = replacement.replace(/\r\n/g, '\n');
    if (content.includes(targetLF)) {
        content = content.replace(targetLF, replacementLF);
        fs.writeFileSync('index.html', content, 'utf8');
        console.log("Success with LF");
    } else {
        console.log("Still not found");
    }
}
