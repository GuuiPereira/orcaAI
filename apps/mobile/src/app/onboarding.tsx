import { Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OrganizationForm } from '@/components/organization-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { notifyOrganizationChanged } from '@/hooks/use-auth-gate';
import { signOut } from '@/lib/auth';
import { createOrganization } from '@/lib/organizations';

// Primeiro acesso (RF-004): cria a organização do usuário. O gate em
// _layout.tsx só manda pra cá quando há sessão mas nenhuma organização
// vinculada ainda (estado 'no-organization'); sai sozinho assim que a
// organização é criada.
export default function OnboardingScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedView style={styles.header}>
            <ThemedText type="title" style={styles.title}>
              Conta pra gente sobre seu negócio
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              Esses dados aparecem nos orçamentos que você gerar. Só o nome comercial é
              obrigatório - o resto dá pra completar depois.
            </ThemedText>
          </ThemedView>

          <OrganizationForm
            submitLabel="Criar organização"
            onSubmit={async (profile) => {
              await createOrganization(profile);
              // Sucesso: não navega daqui - avisa o gate em _layout.tsx
              // (que não reagiria sozinho, já que a sessão não muda) e ele
              // sai daqui pro app assim que confirmar a organização nova.
              notifyOrganizationChanged();
            }}
          />

          <Pressable onPress={() => signOut()} style={styles.signOutButton}>
            <ThemedText type="link">Sair</ThemedText>
          </Pressable>
        </ScrollView>
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
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Platform.select({ web: Spacing.six, default: Spacing.four }),
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.two,
  },
  title: {
    fontSize: 28,
    lineHeight: 36,
  },
  signOutButton: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
});
