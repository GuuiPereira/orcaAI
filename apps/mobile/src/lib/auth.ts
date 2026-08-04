import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from './supabase';

// Login somente com Google (decisão da Fase 2, ver .tasks/fase-2-mvp-fechado.md
// task 1) via fluxo OAuth do Supabase Auth: pega a URL de autorização,
// abre no navegador do sistema, e troca o `code` do redirect por uma sessão
// (PKCE - supabase-js já guarda o code_verifier internamente entre as duas
// chamadas).
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = Linking.createURL('auth-callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('O Supabase não retornou a URL de login do Google.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    throw new Error('Login cancelado.');
  }

  const { queryParams } = Linking.parse(result.url);
  const code = queryParams?.code;
  if (typeof code !== 'string') {
    const errorDescription = queryParams?.error_description;
    throw new Error(
      typeof errorDescription === 'string' ? errorDescription : 'Não foi possível concluir o login.',
    );
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
