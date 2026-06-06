import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('team', '2팀')
    .eq('log_date', '2026-06-08')
    .eq('teacher', '표영');

  console.log("Error:", error);
  console.log("Data:", data);
}

checkData();
