import { formatCentsAsBRL, QUOTE_STATUS_LABELS, type QuoteStatus } from '@orcaai/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Chip, List, Searchbar, Text, useTheme as usePaperTheme } from 'react-native-paper';

import { BottomTabInset, Spacing, WebTopBarInset } from '@/constants/theme';
import { listQuotes, type QuoteListItem } from '@/lib/quotes';

const PERIOD_OPTIONS: { label: string; days: number | null }[] = [
  { label: 'Tudo', days: null },
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
];

// Só os estados que algum fluxo do app de fato atribui hoje -
// "pronto_para_revisao" e "substituido_por_nova_versao" (docs/PRD.md §8)
// ainda não são usados por nenhuma tela, então um filtro pra eles seria só
// ruído.
const FILTERABLE_STATUSES: QuoteStatus[] = ['rascunho', 'emitido', 'enviado', 'aprovado', 'recusado', 'expirado'];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

// RF-070 a RF-072: lista de orçamentos da organização, com busca e filtros
// de estado/período. Tocar num item abre o editor (que também serve de
// tela de detalhe/emissão - task 4).
export default function QuotesScreen() {
  const paperTheme = usePaperTheme();
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<QuoteStatus[]>([]);
  const [periodDays, setPeriodDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    listQuotes({ search, statuses: selectedStatuses, sinceDays: periodDays })
      .then((result) => {
        if (!cancelled) setQuotes(result);
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
  }, [search, selectedStatuses, periodDays]);

  useFocusEffect(
    useCallback(() => {
      const cancel = load();
      return cancel;
    }, [load]),
  );

  function toggleStatus(status: QuoteStatus) {
    setSelectedStatuses((current) =>
      current.includes(status) ? current.filter((s) => s !== status) : [...current, status],
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: paperTheme.colors.background }}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text variant="headlineMedium">Orçamentos</Text>

          <Searchbar placeholder="Buscar por cliente, número ou texto…" value={search} onChangeText={setSearch} />

          <View style={styles.chipRow}>
            {PERIOD_OPTIONS.map((option) => (
              <Chip
                key={option.label}
                selected={periodDays === option.days}
                onPress={() => setPeriodDays(option.days)}>
                {option.label}
              </Chip>
            ))}
          </View>

          <View style={styles.chipRow}>
            {FILTERABLE_STATUSES.map((status) => (
              <Chip key={status} selected={selectedStatuses.includes(status)} onPress={() => toggleStatus(status)}>
                {QUOTE_STATUS_LABELS[status]}
              </Chip>
            ))}
          </View>

          {errorMessage && <Text style={{ color: paperTheme.colors.error }}>{errorMessage}</Text>}

          {loading ? (
            <ActivityIndicator style={styles.loading} />
          ) : (
            <FlatList
              data={quotes}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <Text style={{ color: paperTheme.colors.onSurfaceVariant }}>Nenhum orçamento encontrado.</Text>
              }
              renderItem={({ item }) => (
                <List.Item
                  title={item.number ? `Nº ${item.number}` : 'Rascunho'}
                  description={`${item.customerName ?? 'Sem cliente'} · ${QUOTE_STATUS_LABELS[item.status]} · ${formatCentsAsBRL(item.totalCents)} · ${formatDate(item.createdAt)}`}
                  onPress={() => router.push(`/quote/${item.id}`)}
                  left={(props) => <List.Icon {...props} icon="file-document-outline" />}
                />
              )}
            />
          )}
        </View>
      </SafeAreaView>
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  loading: {
    marginTop: Spacing.six,
  },
  listContent: {
    paddingBottom: BottomTabInset + Spacing.six,
  },
});
