import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';

async function backup() {
  console.log("=== Supabase daily_logs 데이터 백업 시작 ===");
  const allRecords = [];
  let from = 0;
  const step = 1000;
  let hasMore = true;

  while (hasMore) {
    const to = from + step - 1;
    console.log(`fetching records from ${from} to ${to}...`);
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/daily_logs?select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Range': `${from}-${to}`
      }
    });

    if (!res.ok) {
      console.error("데이터 백업 실패:", await res.text());
      process.exit(1);
    }

    const data = await res.json();
    allRecords.push(...data);
    
    console.log(`Fetched ${data.length} records. Total so far: ${allRecords.length}`);
    
    if (data.length < step) {
      hasMore = false;
    } else {
      from += step;
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `daily_logs_backup_${timestamp}.json`;
  const filepath = path.join(process.cwd(), filename);
  
  fs.writeFileSync(filepath, JSON.stringify(allRecords, null, 2), 'utf-8');
  console.log(`=== 백업 완료! ===`);
  console.log(`저장된 레코드 수: ${allRecords.length}개`);
  console.log(`저장 경로: ${filepath}`);
}

backup();
