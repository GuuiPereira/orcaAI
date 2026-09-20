import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Chip, FAB, List, Searchbar, Text, useTheme as usePaperTheme } from 'react-native-paper';

import { BottomTabInset, Spacing, WebTopBarInset } from '@/constants/theme';
import { listCustomers, type Customer } from '@/lib/customers';

// RF-010: lista/busca de clientes, com opção de mostrar arquivados.
export default function CustomersScreen() {
  const paperTheme = usePaperTheme();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    listCustomers({ search, includeArchived: showArchived })
      .then((result) => {
        if (!cancelled) setCustomers(result);
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
  }, [search, showArchived]);

  useFocusEffect(
    useCallback(() => {
      const cancel = load();
      return cancel;
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: paperTheme.colors.background }}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text variant="headlineMedium">Clientes</Text>

          <Searchbar placeholder="Buscar por nome…" value={search} onChangeText={setSearch} />

          <Chip selected={showArchived} onPress={() => setShowArchived((v) => !v)} style={styles.archivedChip}>
            Mostrar arquivados
          </Chip>

          {errorMessage && (
            <Text style={{ color: paperTheme.colors.error }}>{errorMessage}</Text>
          )}

          {loading ? (
            <ActivityIndicator style={styles.loading} />
          ) : (
            <FlatList
              data={customers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <Text style={{ color: paperTheme.colors.onSurfaceVariant }}>
                  Nenhum cliente encontrado.
                </Text>
              }
              renderItem={({ item }) => (
                <List.Item
                  title={item.name}
                  description={item.archivedAt ? `${item.phone ?? 'Sem telefone'} · Arquivado` : item.phone ?? undefined}
                  onPress={() => router.push(`/customer/${item.id}`)}
                  left={(props) => <List.Icon {...props} icon="account" />}
                />
              )}
            />
          )}
        </View>
      </SafeAreaView>

      <FAB icon="plus" style={styles.fab} onPress={() => router.push('/customer/new')} label="Novo cliente" />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Platform.select({ web: WebTopBarInset + Spacing.three, default: Spacing.four }),
    gap: Spacing.three,
  },
  archivedChip: {
    alignSelf: 'flex-start',
  },
  loading: {
    marginTop: Spacing.six,
  },
  listContent: {
    paddingBottom: BottomTabInset + Spacing.six,
  },
  fab: {
    position: 'absolute',
    right: Spacing.four,
    bottom: BottomTabInset + Spacing.four,
  },
});
