import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';

async function fetchAllData() {
  const allData = [];
  let offset = 0;
  const limit = 1000;
  let hasMore = true;

  console.log("1. 데이터 백업을 위해 Supabase에서 7월 데이터 다운로드 중...");

  while (hasMore) {
    const url = `${SUPABASE_URL}/rest/v1/daily_logs?log_date=gte.2026-07-01&log_date=lte.2026-07-31&order=id.asc&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!res.ok) {
      throw new Error(`데이터 페치 실패 (offset: ${offset}): ${await res.text()}`);
    }

    const data = await res.json();
    allData.push(...data);
    console.log(`  - offset ${offset}에서 ${data.length}개 로드 완료 (누적: ${allData.length}개)`);

    if (data.length < limit) {
      hasMore = false;
    } else {
      offset += limit;
    }
  }

  return allData;
}

async function verifyCount() {
  const url = `${SUPABASE_URL}/rest/v1/daily_logs?log_date=gte.2026-07-01&log_date=lte.2026-07-31`;
  const res = await fetch(url, {
    method: 'HEAD',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'count=exact'
    }
  });

  if (!res.ok) {
    throw new Error(`개수 조회 실패: ${await res.text()}`);
  }

  const contentRange = res.headers.get('content-range');
  if (contentRange) {
    return parseInt(contentRange.split('/')[1], 10);
  }
  return 0;
}

async function run() {
  try {
    // 1. 사전 카운트 확인
    const expectedCount = await verifyCount();
    console.log(`삭제 대상 전체 7월 데이터 수: ${expectedCount}개`);

    if (expectedCount === 0) {
      console.log("삭제할 7월 데이터가 없습니다.");
      return;
    }

    // 2. 전체 데이터 다운로드 (백업용)
    const backupData = await fetchAllData();
    
    // 3. 백업 데이터 정합성 검증
    if (backupData.length !== expectedCount) {
      throw new Error(`데이터 수 불일치! 기대치: ${expectedCount}, 다운로드된 데이터: ${backupData.length}`);
    }
    console.log("데이터 정합성 검증 완료. 백업을 파일로 저장합니다.");

    // 4. 로컬 JSON 백업 파일 저장
    const backupFilePath = path.join(__dirname, 'backup_daily_logs_2026_07.json');
    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');
    console.log(`백업 파일 저장 완료: ${backupFilePath}`);

    // 5. 데이터 삭제 실행
    console.log("2. Supabase에서 7월 데이터 삭제 실행 중...");
    const deleteUrl = `${SUPABASE_URL}/rest/v1/daily_logs?log_date=gte.2026-07-01&log_date=lte.2026-07-31`;
    const deleteRes = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!deleteRes.ok) {
      throw new Error(`데이터 삭제 실패: ${await deleteRes.text()}`);
    }
    console.log("데이터 삭제 명령 전송 완료.");

    // 6. 삭제 결과 확인
    const finalCount = await verifyCount();
    console.log(`삭제 후 남은 7월 데이터 수: ${finalCount}개`);
    
    if (finalCount === 0) {
      console.log("=== 작업이 성공적으로 완료되었습니다! ===");
    } else {
      console.error(`경고: 삭제 후에도 ${finalCount}개의 데이터가 남아있습니다.`);
    }

  } catch (error) {
    console.error("작업 중 에러 발생:", error.message);
  }
}

run();
