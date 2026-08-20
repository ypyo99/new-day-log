import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function copySchedule() {
  console.log("=== 8월 27일 수업 일정 -> 9월 3일 복사 작업 시작 ===");

  // 1. 2026-08-27 데이터 조회
  const { data: sourceLogs, error: sourceErr } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('log_date', '2026-08-27');

  if (sourceErr) {
    console.error("8월 27일 데이터 조회 실패:", sourceErr);
    process.exit(1);
  }

  console.log(`8월 27일 원본 데이터 레코드 수: ${sourceLogs.length}개`);

  // 2. 2026-09-03 기존 데이터 삭제
  const { data: existingTarget, error: existingErr } = await supabase
    .from('daily_logs')
    .select('id')
    .eq('log_date', '2026-09-03');

  if (existingErr) {
    console.error("9월 3일 기존 데이터 조회 실패:", existingErr);
    process.exit(1);
  }

  console.log(`9월 3일 기존 데이터 레코드 수: ${existingTarget.length}개 (삭제 예정)`);

  const { error: deleteErr } = await supabase
    .from('daily_logs')
    .delete()
    .eq('log_date', '2026-09-03');

  if (deleteErr) {
    console.error("9월 3일 기존 데이터 삭제 실패:", deleteErr);
    process.exit(1);
  }
  console.log("9월 3일 기존 데이터 삭제 완료!");

  // 3. 복사본 데이터 준비 (9월 3일 log_date로 변경)
  const newRecords = sourceLogs.map(row => ({
    team: row.team,
    log_date: '2026-09-03',
    teacher: row.teacher,
    shift: row.shift,
    student: row.student,
    location: row.location,
    status: row.status,
    is_20days: row.is_20days
  }));

  // 4. Supabase에 새 레코드 삽입 (batch)
  const chunkSize = 50;
  let totalInserted = 0;

  for (let i = 0; i < newRecords.length; i += chunkSize) {
    const chunk = newRecords.slice(i, i + chunkSize);
    const { data: insertedData, error: insertErr } = await supabase
      .from('daily_logs')
      .insert(chunk)
      .select();

    if (insertErr) {
      console.error(`레코드 삽입 실패 (index ${i}~${i + chunk.length}):`, insertErr);
      process.exit(1);
    }
    totalInserted += insertedData.length;
  }

  console.log(`=== 복사 완료! 총 ${totalInserted}개 레코드가 9월 3일 일정으로 저장되었습니다. ===`);

  // 5. 검증
  const { data: targetLogs, error: verifyErr } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('log_date', '2026-09-03');

  if (verifyErr) {
    console.error("검증 조회 실패:", verifyErr);
  } else {
    console.log(`검증 결과: 9월 3일 레코드 수 = ${targetLogs.length}개`);
  }
}

copySchedule();
