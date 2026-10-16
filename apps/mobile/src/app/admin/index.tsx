import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Appbar,
  Card,
  Searchbar,
  Text,
  useTheme as usePaperTheme,
} from 'react-native-paper';

import { OrganizationChips } from '@/components/admin-organization-chips';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  formatDateTime,
  formatUsdFromCents,
  isPlatformAdmin,
  listAdminOrganizations,
  type AdminOrganization,
} from '@/lib/admin';
import { goBackOr } from '@/lib/navigation';

// Fase 6: lista das organizações para o admin da plataforma - só metadados
// (ver lib/admin.ts). O banco recusa quem não é admin; a checagem aqui só
// evita mostrar uma tela vazia com erro.
export default function AdminOrganizationsScreen() {
  const paperTheme = usePaperTheme();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [organizations, setOrganizations] = useState<AdminOrganization[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      setErrorMessage(null);
      isPlatformAdmin()
        .then(async (admin) => {
          if (cancelled) return;
          setAllowed(admin);
          if (admin) {
            const result = await listAdminOrganizations();
            if (!cancelled) setOrganizations(result);
          }
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
    }, []),
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return organizations;
    return organizations.filter(
      (org) => org.trade_name.toLowerCase().includes(term) || org.short_id.startsWith(term),
    );
  }, [organizations, search]);

  return (
    <View style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
      <SafeAreaView edges={['top']}>
        <Appbar.Header elevated={false} style={{ backgroundColor: paperTheme.colors.background }}>
          <Appbar.BackAction onPress={() => goBackOr('/profile')} />
          <Appbar.Content title="Painel admin" />
        </Appbar.Header>
      </SafeAreaView>

      <View style={styles.content}>
        {loading && organizations.length === 0 ? (
          <ActivityIndicator style={styles.centered} />
        ) : allowed === false ? (
          <Text variant="bodyLarge" style={styles.centered}>
            Acesso restrito a administradores.
          </Text>
        ) : (
          <>
            <Searchbar placeholder="Buscar por nome ou id…" value={search} onChangeText={setSearch} />
            <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
              {organizations.length} organização(ões). Só metadados - o conteúdo dos orçamentos nunca aparece aqui.
            </Text>
            {errorMessage && <Text style={{ color: paperTheme.colors.error }}>{errorMessage}</Text>}
            <FlatList
              data={filtered}
              keyExtractor={(org) => org.organization_id}
              contentContainerStyle={styles.list}
              renderItem={({ item: org }) => (
                <Card mode="outlined" onPress={() => router.push(`/admin/${org.organization_id}`)}>
                  <Card.Content style={styles.cardContent}>
                    <View style={styles.titleRow}>
                      <Text variant="titleMedium" style={styles.flex}>
                        {org.trade_name}
                      </Text>
                      <Text variant="labelSmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
                        {org.short_id}
                      </Text>
                    </View>
                    <OrganizationChips org={org} />
                    <Text variant="bodySmall">
                      IA nas últimas 24h: {org.interpretations_24h}/{org.daily_interpretations_limit} interpretações ·{' '}
                      {org.extractions_24h}/{org.daily_extractions_limit} leituras
                    </Text>
                    <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
                      30 dias: {formatUsdFromCents(org.cost_cents_30d)} · {org.quotes_total} orçamento(s) · último
                      acesso {formatDateTime(org.last_activity_at)}
                    </Text>
                  </Card.Content>
                </Card>
              )}
              ListEmptyComponent={
                <Text variant="bodyMedium" style={styles.centered}>
                  Nenhuma organização encontrada.
                </Text>
              }
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  list: { gap: Spacing.two, paddingBottom: Spacing.five },
  cardContent: { gap: Spacing.one },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  centered: { marginTop: Spacing.five, textAlign: 'center' },
});
