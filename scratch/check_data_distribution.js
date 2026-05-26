const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';

async function checkMonth(year, month) {
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = `${year}-${String(month).padStart(2, '0')}-31`; // 대략적인 조회
  // 정확한 마지막 날 계산
  const lastDayVal = new Date(year, month, 0).getDate();
  const lastDayStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDayVal).padStart(2, '0')}`;

  const url = `${SUPABASE_URL}/rest/v1/daily_logs?log_date=gte.${firstDay}&log_date=lte.${lastDayStr}&select=id`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  if (!res.ok) {
    console.error(`Error checking ${year}-${month}:`, await res.text());
    return 0;
  }
  const data = await res.json();
  return data.length;
}

async function run() {
  console.log("=== 연도별/월별 daily_logs 데이터 분포 확인 ===");
  const years = [2025, 2026];
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  for (const year of years) {
    console.log(`\n[${year}년]`);
    for (const month of months) {
      const count = await checkMonth(year, month);
      if (count > 0) {
        console.log(`  ${month}월: ${count}개`);
      }
    }
  }
}

run();
