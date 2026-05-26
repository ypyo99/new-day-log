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

  console.log("1. 전체 데이터 다운로드 중...");

  while (hasMore) {
    const url = `${SUPABASE_URL}/rest/v1/daily_logs?order=id.asc&limit=${limit}&offset=${offset}`;
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
  const url = `${SUPABASE_URL}/rest/v1/daily_logs`;
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
    const expectedCount = await verifyCount();
    console.log(`기존 daily_logs 전체 데이터 수: ${expectedCount}개`);

    if (expectedCount === 0) {
      console.log("백업할 데이터가 없습니다.");
      return;
    }

    const backupData = await fetchAllData();
    
    if (backupData.length !== expectedCount) {
      throw new Error(`데이터 수 불일치! 기대치: ${expectedCount}, 다운로드된 데이터: ${backupData.length}`);
    }
    console.log("데이터 정합성 검증 완료. 백업을 파일로 저장합니다.");

    const backupFilePath = path.join(__dirname, 'backup_daily_logs_full.json');
    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');
    console.log(`백업 파일 저장 완료: ${backupFilePath}`);
    console.log("=== 백업 성공 ===");

  } catch (error) {
    console.error("백업 작업 중 에러 발생:", error.message);
    process.exit(1);
  }
}

run();
