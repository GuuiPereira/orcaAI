import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OrganizationForm } from '@/components/organization-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, WebTopBarInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signOut } from '@/lib/auth';
import { getCurrentOrganizationId, getCurrentOrganizationProfile, updateOrganization } from '@/lib/organizations';
import type { OrganizationProfile } from '@/lib/organizations';

export default function ProfileScreen() {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCurrentOrganizationId(), getCurrentOrganizationProfile()])
      .then(([id, currentProfile]) => {
        if (cancelled) return;
        setOrganizationId(id);
        setProfile(currentProfile);
      })
      .catch((error) => {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.scrollContent}>
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="title" style={styles.title}>
            Perfil
          </ThemedText>

          {loading ? (
            <ActivityIndicator color={theme.text} />
          ) : errorMessage ? (
            <ThemedText type="small" style={styles.errorText}>
              {errorMessage}
            </ThemedText>
          ) : organizationId && profile ? (
            <>
              {savedMessage && (
                <ThemedText type="small" themeColor="textSecondary">
                  Dados salvos.
                </ThemedText>
              )}
              <OrganizationForm
                initialValue={profile}
                submitLabel="Salvar"
                onSubmit={async (updated) => {
                  await updateOrganization(organizationId, updated);
                  setProfile(updated);
                  setSavedMessage(true);
                }}
              />
            </>
          ) : null}

          <Pressable onPress={() => signOut()} style={styles.signOutButton}>
            <ThemedText type="link">Sair</ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  safeArea: {
    paddingHorizontal: Spacing.four,
    paddingTop: Platform.select({ web: WebTopBarInset + Spacing.three, default: Spacing.four }),
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.four,
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
  },
  errorText: {
    color: '#dc2626',
  },
  signOutButton: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
});
