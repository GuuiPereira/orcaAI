import { Platform, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signOut } from '@/lib/auth';

// Estado esperado logo após o primeiro login: usuário autenticado, mas
// ainda sem organização, porque o cadastro de perfil/empresa (RF-003 a
// RF-006) é a Task 2 da Fase 2, ainda não implementada.
export default function NoOrganizationScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.content}>
          <ThemedText type="title" style={styles.title}>
            Quase lá
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            Login feito com sucesso, mas o cadastro do perfil/empresa ainda não está
            disponível nesta versão de teste. Volte em breve.
          </ThemedText>
        </ThemedView>

        <Pressable
          accessibilityRole="button"
          onPress={() => signOut()}
          style={({ pressed }) => [
            styles.signOutButton,
            { borderColor: theme.text },
            pressed && styles.pressed,
          ]}>
          <ThemedText type="smallBold">Sair</ThemedText>
        </Pressable>
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
  content: {
    gap: Spacing.two,
    marginTop: Spacing.six,
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
  },
  signOutButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.8,
  },
});
