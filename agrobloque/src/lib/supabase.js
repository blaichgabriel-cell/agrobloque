import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://utdlehbifdfiliozxbif.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'TU_ANON_KEY_DE_SUPABASE';

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
