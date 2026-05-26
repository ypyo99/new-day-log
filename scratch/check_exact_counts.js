const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';

async function checkExactCount(year, month) {
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDayVal = new Date(year, month, 0).getDate();
  const lastDayStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDayVal).padStart(2, '0')}`;

  const url = `${SUPABASE_URL}/rest/v1/daily_logs?log_date=gte.${firstDay}&log_date=lte.${lastDayStr}`;
  const res = await fetch(url, {
    method: 'HEAD',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'count=exact'
    }
  });

  if (!res.ok) {
    console.error(`Error checking ${year}-${month}:`, await res.text());
    return 0;
  }
  
  const contentRange = res.headers.get('content-range');
  if (contentRange) {
    const total = contentRange.split('/')[1];
    return parseInt(total, 10);
  }
  return 0;
}

async function run() {
  console.log("=== 7월~11월 daily_logs 정확한 데이터 개수 확인 ===");
  const targetMonths = [7, 8, 9, 10, 11];
  let totalToDelete = 0;

  for (const month of targetMonths) {
    const count = await checkExactCount(2026, month);
    console.log(`2026년 ${month}월 데이터 개수: ${count}개`);
    totalToDelete += count;
  }
  console.log(`\n총 삭제 대상 데이터 개수 (7월~11월): ${totalToDelete}개`);
}

run();
