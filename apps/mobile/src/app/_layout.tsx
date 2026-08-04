import 'react-native-url-polyfill/auto';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useAuthGate } from '@/hooks/use-auth-gate';
import { useTheme } from '@/hooks/use-theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = useTheme();
  const status = useAuthGate();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    const current = segments[0];
    if (status === 'unauthenticated' && current !== 'login') {
      router.replace('/login');
    } else if (status === 'no-organization' && current !== 'no-organization') {
      router.replace('/no-organization');
    } else if (status === 'ready' && (current === 'login' || current === 'no-organization')) {
      router.replace('/');
    }
  }, [status, segments, router]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {status === 'loading' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
          <ActivityIndicator color={theme.text} />
        </View>
      ) : (
        <Stack screenOptions={{ headerShown: false }} />
      )}
    </ThemeProvider>
  );
}
