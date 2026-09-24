import 'react-native-url-polyfill/auto';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { paperDarkTheme, paperLightTheme } from '@/constants/paper-theme';
import { useAuthGate } from '@/hooks/use-auth-gate';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { initMonitoring, setMonitoringUser, wrapRootComponent } from '@/lib/monitoring';

initMonitoring();

SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = useTheme();
  const status = useAuthGate();
  const segments = useSegments();
  const router = useRouter();
  const { session } = useSession();

  useEffect(() => {
    setMonitoringUser(session?.user.id ?? null);
  }, [session]);

  useEffect(() => {
    if (status === 'loading') return;
    const current = segments[0];
    if (status === 'unauthenticated') {
      // auth-callback (alvo web) precisa de tempo pra processar a sessão
      // vinda do hash da URL antes de virar 'ready'/'no-organization' -
      // só não expulsa pro /login enquanto isso ainda não aconteceu.
      if (current !== 'login' && current !== 'auth-callback') {
        router.replace('/login');
      }
    } else if (status === 'no-organization') {
      if (current !== 'onboarding') router.replace('/onboarding');
    } else if (status === 'pending-deletion') {
      // Conta agendada pra exclusão (Task 7): só a tela de cancelar/sair.
      if (current !== 'pending-deletion') router.replace('/pending-deletion');
    } else if (status === 'ready') {
      if (
        current === 'login' ||
        current === 'onboarding' ||
        current === 'auth-callback' ||
        current === 'pending-deletion'
      ) {
        router.replace('/');
      }
    }
  }, [status, segments, router]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <PaperProvider theme={colorScheme === 'dark' ? paperDarkTheme : paperLightTheme}>
        <AnimatedSplashOverlay />
        {status === 'loading' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : (
          <Stack screenOptions={{ headerShown: false }} />
        )}
      </PaperProvider>
    </ThemeProvider>
  );
}

export default wrapRootComponent(RootLayout);
