import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://utdlehbifdfiliozxbif.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0ZGxlaGJpZmRmaWxpb3p4YmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4ODI0ODgsImV4cCI6MjA5NDQ1ODQ4OH0.VX99wvuZ258SDOcEG-ijFYo64RFAlWoKpsEU7C4R92U';

const getGuestTokenFromPath = () => {
  if (typeof window === 'undefined') return '';
  const match = window.location.pathname.match(/^\/invitado\/([^/]+)/);
  return match?.[1] || '';
};

const auth = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
  storageKey: 'agrobloque-session',
};

if (typeof window !== 'undefined') {
  auth.storage = window.localStorage;
}

export const guestToken = getGuestTokenFromPath();

const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, { auth });
const supabaseGuestClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: guestToken ? { 'x-guest-token': guestToken } : {},
  },
});

export const supabase = guestToken ? supabaseGuestClient : supabaseAuth;

export const clearLocalAuth = () => {
  if (typeof window === 'undefined') return;

  const limpiarStorage = (storage) => {
    if (!storage) return;
    Object.keys(storage).forEach((key) => {
      const debeLimpiar =
        key === 'agrobloque-session' ||
        key === 'agrobloque-campo-activo' ||
        key.startsWith('sb-') ||
        key.toLowerCase().includes('supabase');

      if (debeLimpiar) storage.removeItem(key);
    });
  };

  limpiarStorage(window.localStorage);
  limpiarStorage(window.sessionStorage);
};

export const forceLocalSignOut = async (reload = true) => {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (error) {
    console.warn('No se pudo cerrar sesion contra Supabase, se limpia localmente.', error);
  }

  clearLocalAuth();

  if (reload && typeof window !== 'undefined') {
    window.location.assign('/');
  }
};
