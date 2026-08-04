import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY precisam estar definidas (ver apps/mobile/.env.example).',
  );
}

// No-op durante a renderização estática do Expo Router para web (roda em
// Node, sem `window`) - sem isso, o adaptador web do AsyncStorage tenta
// acessar `window.localStorage` e derruba o SSR.
const ssrSafeStorage = {
  getItem: (key: string) => (typeof window === 'undefined' ? Promise.resolve(null) : AsyncStorage.getItem(key)),
  setItem: (key: string, value: string) =>
    typeof window === 'undefined' ? Promise.resolve() : AsyncStorage.setItem(key, value),
  removeItem: (key: string) =>
    typeof window === 'undefined' ? Promise.resolve() : AsyncStorage.removeItem(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ssrSafeStorage,
    autoRefreshToken: true,
    persistSession: true,
    // O retorno do login com Google (alvo web) vem com os tokens no hash
    // da URL (`#access_token=...&refresh_token=...`) - precisa do
    // supabase-js processando isso sozinho (ver
    // apps/mobile/src/app/auth-callback.tsx). No nativo não existe URL
    // de página de verdade pra isso fazer sentido.
    detectSessionInUrl: Platform.OS === 'web',
  },
});
