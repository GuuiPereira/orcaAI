import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signInWithGoogle } from '@/lib/auth';

export default function LoginScreen() {
  const theme = useTheme();
  const [signingIn, setSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handlePress() {
    setSigningIn(true);
    setErrorMessage(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            OrçaAI
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            Transforme a mensagem que você já escreveria pro cliente em um orçamento
            profissional.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.footer}>
          {errorMessage && (
            <ThemedText type="small" style={{ color: '#dc2626' }}>
              {errorMessage}
            </ThemedText>
          )}

          <Pressable
            accessibilityRole="button"
            disabled={signingIn}
            onPress={handlePress}
            style={({ pressed }) => [
              styles.googleButton,
              { backgroundColor: theme.text },
              pressed && styles.pressed,
            ]}>
            {signingIn ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                Entrar com Google
              </ThemedText>
            )}
          </Pressable>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    justifyContent: 'space-between',
    paddingTop: Platform.select({ web: Spacing.six, default: Spacing.four }),
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.two,
    marginTop: Spacing.six,
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
  },
  footer: {
    gap: Spacing.two,
  },
  googleButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.8,
  },
});
