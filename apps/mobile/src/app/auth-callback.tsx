import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// No web é o destino do redirecionamento de página inteira (ver
// apps/mobile/src/lib/auth.web.ts). No nativo o retorno do login é
// capturado por WebBrowser.openAuthSessionAsync, mas o Expo Router também
// abre esta rota quando o Android entrega o deep link - aqui ela só segura
// a tela ("Concluindo login…") até o gate em _layout.tsx sair dela.
//
// O GoTrue devolve os tokens direto no hash da URL
// (`#access_token=...&refresh_token=...`, não `?code=`) pra provedores
// OAuth externos como o Google - por isso o processamento é automático via
// `detectSessionInUrl: true` (só no web, ver apps/mobile/src/lib/supabase.ts),
// não manual aqui. Essa tela só existe pra dar um lugar (com rota de
// verdade, sem "Unmatched Route") pro navegador cair enquanto isso
// acontece, e pra mostrar erro devolvido pelo provedor, se houver.
function readErrorFromLocation(): string | null {
  // No React Native `window` existe, mas `window.location` não - sem esta
  // checagem, abrir esta rota pelo deep link `mobile://auth-callback`
  // (o Expo Router navega pra cá no nativo também) lança TypeError na
  // renderização e derruba o app de release.
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location) return null;
  const fromSearch = new URLSearchParams(window.location.search).get('error_description');
  if (fromSearch) return fromSearch;
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  return new URLSearchParams(hash).get('error_description');
}

const TIMEOUT_MS = 8000;

export default function AuthCallbackScreen() {
  const theme = useTheme();
  const { error_description } = useLocalSearchParams<{ error_description?: string }>();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  const errorMessage =
    error_description ??
    readErrorFromLocation() ??
    (timedOut ? 'O login demorou demais pra concluir. Tente de novo.' : null);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {errorMessage ? (
          <>
            <ThemedText type="smallBold" style={{ color: '#dc2626' }}>
              {errorMessage}
            </ThemedText>
            <ThemedText type="linkPrimary" onPress={() => router.replace('/login')}>
              Voltar pro login
            </ThemedText>
          </>
        ) : (
          <>
            <ActivityIndicator color={theme.text} />
            <ThemedText themeColor="textSecondary">Concluindo login…</ThemedText>
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeArea: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
});
