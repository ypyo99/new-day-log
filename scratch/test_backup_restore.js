const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';

async function testPagination() {
  console.log("=== 1. daily_logs 테이블 Pagination 조회 테스트 ===");
  let existingData = [];
  let start = 0;
  const limit = 1000;
  let hasMore = true;
  let page = 1;

  while (hasMore) {
    console.log(`페이지 #${page} 로딩 중... (시작 인덱스: ${start})`);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs?select=id`, {
      headers: { 
        'apikey': SUPABASE_KEY, 
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Range': `${start}-${start + limit - 1}`
      }
    });

    if (!res.ok) {
      console.error(`조회 에러:`, await res.text());
      return;
    }

    const chunk = await res.json();
    console.log(`- 이번 페이지 조회 완료: ${chunk.length}건 수집`);

    if (chunk && chunk.length > 0) {
      existingData = existingData.concat(chunk);
      if (chunk.length < limit) {
        hasMore = false;
      } else {
        start += limit;
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  console.log(`=> daily_logs 전수 조회 완료! 총 ${existingData.length}개의 레코드가 페이지네이션을 통해 수집되었습니다.`);

  console.log("\n=== 2. daily_logs_backup 테이블 Pagination 조회 테스트 ===");
  // 가장 최근의 backup_id를 조회
  const bRes = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs_backup?select=backup_id&limit=1&order=created_at.desc`, {
     headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  
  if (!bRes.ok) {
     console.error(`백업 조회 실패:`, await bRes.text());
     return;
  }
  const lastBackup = await bRes.json();
  if (lastBackup.length === 0) {
     console.log("기록된 백업 내역이 없습니다.");
     return;
  }
  const lastBackupId = lastBackup[0].backup_id;
  console.log(`최근 확인된 백업 ID: ${lastBackupId}`);

  let backupData = [];
  start = 0;
  hasMore = true;
  page = 1;

  while (hasMore) {
    console.log(`백업 페이지 #${page} 로딩 중... (시작 인덱스: ${start})`);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs_backup?backup_id=eq.${lastBackupId}&select=original_id`, {
      headers: { 
        'apikey': SUPABASE_KEY, 
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Range': `${start}-${start + limit - 1}`
      }
    });

    if (!res.ok) {
      console.error(`백업 조회 에러:`, await res.text());
      return;
    }

    const chunk = await res.json();
    console.log(`- 이번 페이지 백업 조회 완료: ${chunk.length}건 수집`);

    if (chunk && chunk.length > 0) {
      backupData = backupData.concat(chunk);
      if (chunk.length < limit) {
        hasMore = false;
      } else {
        start += limit;
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  console.log(`=> daily_logs_backup 전수 조회 완료! 총 ${backupData.length}개의 백업 레코드가 페이지네이션을 통해 수집되었습니다.`);
}

testPagination();
