import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

const auth = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
  storageKey: 'agrobloque-session',
};

if (typeof window !== 'undefined') {
  auth.storage = window.localStorage;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth });
