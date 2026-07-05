import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://oudrcfxkneopgtcfbwhd.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ');
supabase.from('daily_logs').select('*').like('student', '%권미희%').then(({data, error}) => {
  if(error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
});
