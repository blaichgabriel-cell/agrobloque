import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Faltan REACT_APP_SUPABASE_URL o REACT_APP_SUPABASE_ANON_KEY en el archivo .env');
}

const authOptions = {
  persistSession: true,
  storageKey: 'agrobloque-session',
  autoRefreshToken: true,
  detectSessionInUrl: true,
};

if (typeof window !== 'undefined') {
  authOptions.storage = window.localStorage;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: authOptions,
});
