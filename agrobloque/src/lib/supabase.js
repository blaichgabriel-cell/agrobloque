import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://utdlehbifdfiliozxbif.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0ZGxlaGJpZmRmaWxpb3p4YmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4ODI0ODgsImV4cCI6MjA5NDQ1ODQ4OH0.VX99wvuZ258SDOcEG-ijFYo64RFAlWoKpsEU7C4R92U';

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
