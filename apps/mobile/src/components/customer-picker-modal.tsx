import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Appbar, List, Searchbar, Text, useTheme as usePaperTheme } from 'react-native-paper';

import { Spacing } from '@/constants/theme';
import { listCustomers, quickCreateCustomer, type Customer } from '@/lib/customers';

// RF-012/RF-013: selecionar um cliente existente ou criar um rápido (só
// nome), reaproveitado tanto no fluxo de "Novo orçamento" quanto no editor
// (troca de cliente vinculado).
export function CustomerPickerModal({
  visible,
  onClose,
  onSelect,
  onClear,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (customer: Customer) => void;
  // Presente só quando já existe um cliente vinculado - permite desvincular.
  onClear?: () => void;
}) {
  const paperTheme = usePaperTheme();
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      setLoading(true);
      listCustomers({ search })
        .then((result) => {
          if (!cancelled) setCustomers(result);
        })
        .catch((error) => {
          if (!cancelled) setErrorMessage(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [visible, search]);

  // Fecha e reseta o estado local - cobre todo caminho de saída (cancelar,
  // selecionar, criar rápido, limpar), já que o pai só troca `visible` em
  // resposta a um desses callbacks.
  function closeAndReset() {
    setSearch('');
    setErrorMessage(null);
  }

  function handleClose() {
    closeAndReset();
    onClose();
  }

  function handleSelect(customer: Customer) {
    closeAndReset();
    onSelect(customer);
  }

  function handleClear() {
    if (!onClear) return;
    closeAndReset();
    onClear();
  }

  const trimmedSearch = search.trim();
  const exactMatch = customers.some((customer) => customer.name.toLowerCase() === trimmedSearch.toLowerCase());
  const canQuickCreate = trimmedSearch.length > 0 && !exactMatch;

  async function handleQuickCreate() {
    if (!canQuickCreate) return;
    setCreating(true);
    setErrorMessage(null);
    try {
      const customer = await quickCreateCustomer(trimmedSearch);
      handleSelect(customer);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: paperTheme.colors.background }]}>
        <Appbar.Header elevated={false} style={{ backgroundColor: paperTheme.colors.background }}>
          <Appbar.Action icon="close" onPress={handleClose} />
          <Appbar.Content title="Selecionar cliente" />
        </Appbar.Header>

        <View style={styles.content}>
          <Searchbar placeholder="Buscar por nome…" value={search} onChangeText={setSearch} autoFocus />

          {errorMessage && <Text style={{ color: paperTheme.colors.error }}>{errorMessage}</Text>}

          <ScrollView keyboardShouldPersistTaps="handled">
            {onClear && (
              <List.Item
                title="Continuar sem cliente"
                onPress={handleClear}
                left={(props) => <List.Icon {...props} icon="account-off-outline" />}
              />
            )}

            {canQuickCreate && (
              <List.Item
                title={`Criar cliente rápido "${trimmedSearch}"`}
                onPress={handleQuickCreate}
                disabled={creating}
                left={(props) =>
                  creating ? <ActivityIndicator style={props.style} /> : <List.Icon {...props} icon="plus" />
                }
              />
            )}

            {loading ? (
              <ActivityIndicator style={styles.loading} />
            ) : (
              <>
                {customers.map((customer) => (
                  <List.Item
                    key={customer.id}
                    title={customer.name}
                    description={customer.phone ?? undefined}
                    onPress={() => handleSelect(customer)}
                    left={(props) => <List.Icon {...props} icon="account" />}
                  />
                ))}
                {customers.length === 0 && (
                  <Text style={[styles.emptyText, { color: paperTheme.colors.onSurfaceVariant }]}>
                    Nenhum cliente encontrado.
                  </Text>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  loading: {
    marginTop: Spacing.four,
  },
  emptyText: {
    marginTop: Spacing.four,
    textAlign: 'center',
  },
});
