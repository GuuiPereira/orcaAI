import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Text, useTheme as usePaperTheme } from 'react-native-paper';

import { Spacing } from '@/constants/theme';
import { notifyOrganizationChanged } from '@/hooks/use-auth-gate';
import { cancelAccountDeletion, getAccountDeletion } from '@/lib/account-deletion';
import { signOut } from '@/lib/auth';

// Task 7 (RF-007): o gate em _layout.tsx só manda pra cá quando existe um
// pedido de exclusão em vigor. Única saída além de "Sair": cancelar (o gate
// reavalia e volta pro app) - enquanto isso as functions de IA/emissão
// também recusam esta conta.
export default function PendingDeletionScreen() {
  const paperTheme = usePaperTheme();
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAccountDeletion()
      .then((deletion) => {
        if (!cancelled) setScheduledFor(deletion?.scheduledFor ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCancel() {
    setErrorMessage(null);
    setCancelling(true);
    try {
      await cancelAccountDeletion();
      notifyOrganizationChanged();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: paperTheme.colors.background }]}>
      <View style={styles.content}>
        <Text variant="headlineSmall">Sua conta será excluída</Text>
        {loading ? (
          <ActivityIndicator />
        ) : (
          <Text variant="bodyLarge">
            {scheduledFor
              ? `A exclusão definitiva está marcada para ${new Date(scheduledFor).toLocaleDateString('pt-BR')}. `
              : ''}
            Até lá, seus dados continuam guardados, mas o app fica bloqueado. Se foi engano, cancele a exclusão e
            continue de onde parou.
          </Text>
        )}
        {errorMessage && <Text style={{ color: paperTheme.colors.error }}>{errorMessage}</Text>}

        <Button mode="contained" onPress={handleCancel} loading={cancelling} disabled={cancelling}>
          Cancelar exclusão
        </Button>
        <Button onPress={() => signOut()} disabled={cancelling}>
          Sair
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Platform.select({ web: Spacing.six, default: Spacing.four }),
    gap: Spacing.three,
  },
});
