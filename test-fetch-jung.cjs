import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vyfckxrybghyozntgmyz.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '...'; // I will just read the `.env` file to get the key instead.

