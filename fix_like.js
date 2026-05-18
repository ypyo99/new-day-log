const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const targetOld = `          // 해당 달의 데이터만 가져오기 위해 like 쿼리 사용 (예: 2026-05%)
          const { data: records, error } = await window.supabaseClient
            .from('daily_logs')
            .select('*')
            .eq('team', team)
            .like('log_date', \`\${month}-%\`)
            .order('log_date', { ascending: false })
            .order('shift', { ascending: true });`;

const targetNew = `          // 해당 달의 시작일과 마지막일 계산하여 범위 쿼리 처리 (DATE 컬럼에 like 사용 불가 해결)
          const [year, monthStr] = month.split('-');
          const firstDay = \`\${month}-01\`;
          const lastDay = new Date(parseInt(year), parseInt(monthStr), 0).getDate();
          const lastDayStr = \`\${month}-\${String(lastDay).padStart(2, '0')}\`;

          const { data: records, error } = await window.supabaseClient
            .from('daily_logs')
            .select('*')
            .eq('team', team)
            .gte('log_date', firstDay)
            .lte('log_date', lastDayStr)
            .order('log_date', { ascending: false })
            .order('shift', { ascending: true });`;

if (content.includes(targetOld)) {
  content = content.replace(targetOld, targetNew);
  fs.writeFileSync('index.html', content, 'utf8');
  console.log("Replaced successfully with LF");
} else {
  // Try CRLF
  const targetOldCRLF = targetOld.replace(/\n/g, '\r\n');
  const targetNewCRLF = targetNew.replace(/\n/g, '\r\n');
  if (content.includes(targetOldCRLF)) {
    content = content.replace(targetOldCRLF, targetNewCRLF);
    fs.writeFileSync('index.html', content, 'utf8');
    console.log("Replaced successfully with CRLF");
  } else {
    console.log("Target not found!");
  }
}
