import * as Linking from 'expo-linking';

import { supabase } from './supabase';

// No navegador, o popup + postMessage (usado no nativo, ver auth.ts) esbarra
// na Cross-Origin-Opener-Policy que o próprio Google define na tela de
// login (proteção contra sequestro de aba) - isso quebra a comunicação
// entre o popup e a janela que abriu. Por isso aqui usamos o redirecionamento
// de página inteira padrão da web: o supabase-js já faz
// `window.location.assign(url)` sozinho (signInWithOAuth com
// skipBrowserRedirect não setado); a volta é tratada em
// apps/mobile/src/app/auth-callback.tsx.
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = Linking.createURL('auth-callback');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
