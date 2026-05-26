import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';

async function getExactCount(tableName) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}`, {
    method: 'HEAD',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'count=exact'
    }
  });
  if (!res.ok) throw new Error(`${tableName} 개수 조회 실패: ${await res.text()}`);
  const contentRange = res.headers.get('content-range');
  if (contentRange) return parseInt(contentRange.split('/')[1], 10);
  return 0;
}

async function fetchAllFromTable(tableName) {
  const allData = [];
  let offset = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const url = `${SUPABASE_URL}/rest/v1/${tableName}?order=id.asc&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!res.ok) throw new Error(`${tableName} 데이터 페치 실패 (offset: ${offset}): ${await res.text()}`);

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

async function backupTable(tableName, fileName) {
  console.log(`\n[${tableName}] 백업 시작...`);

  const expectedCount = await getExactCount(tableName);
  console.log(`  -> 전체 레코드 수: ${expectedCount}개`);

  if (expectedCount === 0) {
    console.log(`  -> 데이터가 없습니다. 빈 배열로 저장합니다.`);
    const filePath = path.join(__dirname, fileName);
    fs.writeFileSync(filePath, '[]', 'utf-8');
    console.log(`  -> 파일 저장 완료: ${filePath}`);
    return;
  }

  const data = await fetchAllFromTable(tableName);

  if (data.length !== expectedCount) {
    throw new Error(`[${tableName}] 데이터 수 불일치! 기대치: ${expectedCount}, 다운로드된 데이터: ${data.length}`);
  }

  const filePath = path.join(__dirname, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  const fileSizeKB = (fs.statSync(filePath).size / 1024).toFixed(1);
  console.log(`  -> 정합성 검증 완료. 파일 저장 완료: ${filePath} (${fileSizeKB} KB)`);
}

async function run() {
  const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  console.log(`=== Supabase 테이블 백업 시작 (${now}) ===`);

  const tables = [
    { name: 'daily_logs', file: 'backup_daily_logs_all.json' },
    { name: 'holidays',   file: 'backup_holidays_all.json' },
    { name: 'teachers',   file: 'backup_teachers_all.json' },
  ];

  for (const t of tables) {
    try {
      await backupTable(t.name, t.file);
    } catch (err) {
      console.error(`[${t.name}] 백업 중 에러 발생:`, err.message);
    }
  }

  console.log('\n=== 모든 테이블 백업이 완료되었습니다! ===');
}

run();
