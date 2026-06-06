import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oudrcfxkneopgtcfbwhd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91ZHJjZnhrbmVvcGd0Y2Zid2hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzk0MTYsImV4cCI6MjA5NDY1NTQxNn0.ovAp6X3VogCeyKa74pC3x2f4lKR6m3gkE0kEEhJbGpQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
  const { data: maxData } = await supabase
    .from('holidays')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);

  let nextId = 1;
  if (maxData && maxData.length > 0) {
    nextId = maxData[0].id + 1;
  }

  const payload = {
    id: nextId,
    date: '12-31',
    name: 'Test',
    content1: 'test',
    content2: ''
  };

  const { data, error } = await supabase
    .from('holidays')
    .insert(payload);

  console.log("Insert Error:", error);
  console.log("Insert Data:", data);
  
  if (!error) {
    await supabase.from('holidays').delete().eq('id', nextId);
  }
}

testInsert();
