const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';

async function run() {
  console.log("=== 6월 daily_logs 데이터 삭제 시작 ===");
  
  // 1. 삭제 전 6월 데이터 카운트 조회
  const countRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs?log_date=gte.2026-06-01&log_date=lte.2026-06-30&select=id`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  
  if (!countRes.ok) {
     console.error("데이터 조회 실패:", await countRes.text());
     return;
  }
  const beforeData = await countRes.json();
  console.log(`삭제 전 6월 레코드 수: ${beforeData.length}개`);

  if (beforeData.length === 0) {
    console.log("삭제할 6월 데이터가 없습니다.");
    return;
  }

  // 2. 6월 데이터 삭제 실행
  const deleteRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs?log_date=gte.2026-06-01&log_date=lte.2026-06-30`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });

  if (!deleteRes.ok) {
     console.error("데이터 삭제 실패:", await deleteRes.text());
     return;
  }
  console.log("6월 레코드 삭제 완료!");

  // 3. 삭제 후 확인
  const countAfterRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs?log_date=gte.2026-06-01&log_date=lte.2026-06-30&select=id`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  const afterData = await countAfterRes.json();
  console.log(`삭제 후 남은 6월 레코드 수: ${afterData.length}개`);
}

run();
