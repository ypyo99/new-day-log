const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const startStr = '2026-02-16';
  const endStr = '2026-02-20';
  const team = '1팀';
  const teacher = '김종철';

  console.log(`Checking data for team: ${team}, teacher: ${teacher}, range: ${startStr} ~ ${endStr}`);

  let query = supabase
    .from('daily_logs')
    .select('id, log_date, teacher, student')
    .eq('team', team)
    .gte('log_date', startStr)
    .lte('log_date', endStr);

  if (teacher !== "__ALL__") {
    query = query.eq('teacher', teacher);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("Result length:", data.length);
  console.log("Data:", data);
}

run();
