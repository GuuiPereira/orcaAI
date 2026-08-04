import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

// Só é alcançada no alvo web (redirecionamento de página inteira - ver
// apps/mobile/src/lib/auth.web.ts). No nativo o retorno do login é
// capturado direto pelo WebBrowser.openAuthSessionAsync, sem navegar
// pra cá.
export default function AuthCallbackScreen() {
  const theme = useTheme();
  const { code, error_description } = useLocalSearchParams<{
    code?: string;
    error_description?: string;
  }>();
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  useEffect(() => {
    if (error_description || !code) return;
    let cancelled = false;
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (!cancelled && error) setExchangeError(error.message);
      // Sucesso: não navega daqui - o gate em _layout.tsx reage à sessão
      // nova sozinho (pra /no-organization ou pro app, conforme o caso).
    });
    return () => {
      cancelled = true;
    };
  }, [code, error_description]);

  const errorMessage =
    error_description ?? (!code ? 'Link de login inválido ou incompleto.' : exchangeError);

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
  },
});
