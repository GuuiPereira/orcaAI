import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Dialog,
  Divider,
  HelperText,
  Portal,
  Snackbar,
  Text,
  TextInput,
  useTheme as usePaperTheme,
} from 'react-native-paper';

import { OrganizationChips } from '@/components/admin-organization-chips';
import { AdminPlanDialog } from '@/components/admin-plan-dialog';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  ADMIN_ACTION_LABELS,
  DEFAULT_DAILY_EXTRACTIONS,
  DEFAULT_DAILY_INTERPRETATIONS,
  formatDateTime,
  formatUsdFromCents,
  getAdminOrganizationDetail,
  reactivateOrganization,
  setOrganizationLimits,
  setOrganizationPlan,
  suspendOrganization,
  unstickInterpretations,
  type AdminOrganizationDetail,
} from '@/lib/admin';
import { goBackOr } from '@/lib/navigation';

type DialogKind = 'limits' | 'suspend' | 'reactivate' | 'unstick';

const DIALOG_TITLES: Record<DialogKind, string> = {
  limits: 'Ajustar limite de IA',
  suspend: 'Suspender organização',
  reactivate: 'Reativar organização',
  unstick: 'Destravar interpretações',
};

const EVENT_LABELS: Record<string, string> = {
  criado: 'Criado',
  emitido: 'Emitido',
  reemitido: 'Reemitido',
  compartilhado: 'Compartilhado',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  expirado: 'Expirado',
};

// Campo vazio = padrão do sistema. Só pré-preenche quando o limite atual é
// diferente do padrão (é o que o admin definiu).
function limitInput(effective: number, fallback: number): string {
  return effective === fallback ? '' : String(effective);
}

function parseLimit(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isInteger(value) && value > 0 ? value : 'invalid';
}

// Fase 6: detalhe de uma organização para o admin da plataforma, com as
// ações (limite, suspender/reativar, destravar). Toda ação pede um motivo,
// que vai pra auditoria junto com a mudança (mesma transação, no banco).
export default function AdminOrganizationScreen() {
  const paperTheme = usePaperTheme();
  const { organizationId } = useLocalSearchParams<{ organizationId: string }>();
  const [detail, setDetail] = useState<AdminOrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [reason, setReason] = useState('');
  const [interpretationsLimit, setInterpretationsLimit] = useState('');
  const [extractionsLimit, setExtractionsLimit] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [planDialogVisible, setPlanDialogVisible] = useState(false);

  // O estado só muda na resposta (nunca de forma síncrona dentro do efeito).
  const load = useCallback(
    () =>
      getAdminOrganizationDetail(organizationId)
        .then((result) => {
          setDetail(result);
          setLoadError(null);
        })
        .catch((error) => setLoadError(error instanceof Error ? error.message : String(error)))
        .finally(() => setLoading(false)),
    [organizationId],
  );

  useEffect(() => {
    if (organizationId) void load();
  }, [organizationId, load]);

  function openDialog(kind: DialogKind) {
    setReason('');
    setActionError(null);
    if (kind === 'limits' && detail) {
      setInterpretationsLimit(limitInput(detail.organization.daily_interpretations_limit, DEFAULT_DAILY_INTERPRETATIONS));
      setExtractionsLimit(limitInput(detail.organization.daily_extractions_limit, DEFAULT_DAILY_EXTRACTIONS));
    }
    setDialog(kind);
  }

  const parsedInterpretations = parseLimit(interpretationsLimit);
  const parsedExtractions = parseLimit(extractionsLimit);
  const limitsInvalid = parsedInterpretations === 'invalid' || parsedExtractions === 'invalid';
  const canSubmit = reason.trim().length >= 3 && !(dialog === 'limits' && limitsInvalid) && !submitting;

  async function handleSubmit() {
    if (!organizationId || !dialog || !canSubmit) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const why = reason.trim();
      if (dialog === 'limits') {
        await setOrganizationLimits(
          organizationId,
          {
            dailyInterpretations: parsedInterpretations as number | null,
            dailyExtractions: parsedExtractions as number | null,
          },
          why,
        );
        setNotice('Limite atualizado.');
      } else if (dialog === 'suspend') {
        await suspendOrganization(organizationId, why);
        setNotice('Organização suspensa.');
      } else if (dialog === 'reactivate') {
        await reactivateOrganization(organizationId, why);
        setNotice('Organização reativada.');
      } else {
        const count = await unstickInterpretations(organizationId, why);
        setNotice(`${count} interpretação(ões) destravada(s).`);
      }
      setDialog(null);
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }

  const org = detail?.organization;
  const activeDays = (detail?.daily ?? [])
    .filter((d) => d.interpretations + d.extractions + d.quotes_created + d.quotes_issued > 0)
    .reverse();

  return (
    <View style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
      <SafeAreaView edges={['top']}>
        <Appbar.Header elevated={false} style={{ backgroundColor: paperTheme.colors.background }}>
          <Appbar.BackAction onPress={() => goBackOr('/admin')} />
          <Appbar.Content title={org?.trade_name ?? 'Organização'} />
        </Appbar.Header>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator style={styles.centered} />
      ) : loadError || !detail || !org ? (
        <Text style={[styles.centered, { color: paperTheme.colors.error }]}>{loadError ?? 'Sem dados.'}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text variant="labelSmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
            id {org.short_id} · criada em {formatDateTime(org.created_at)} · último acesso{' '}
            {formatDateTime(org.last_activity_at)}
          </Text>
          <OrganizationChips org={org} />
          {org.suspended_at && (
            <Text variant="bodyMedium" style={{ color: paperTheme.colors.error }}>
              Suspensa desde {formatDateTime(org.suspended_at)} - IA e emissão bloqueadas; o app mostra o aviso.
            </Text>
          )}

          <Card mode="outlined">
            <Card.Content style={styles.cardContent}>
              <Text variant="titleMedium">Resumo</Text>
              <Text variant="bodyMedium">
                {org.members} membro(s) · {org.quotes_total} orçamento(s), {org.quotes_issued} emitido(s)
              </Text>
              <Text variant="bodyMedium">
                Últimos 30 dias: {org.interpretations_30d} interpretações · {org.extractions_30d} leituras de
                áudio/imagem · {formatUsdFromCents(org.cost_cents_30d)} (estimado)
              </Text>
            </Card.Content>
          </Card>

          <Card mode="outlined">
            <Card.Content style={styles.cardContent}>
              <Text variant="titleMedium">Plano</Text>
              <Text variant="bodyMedium">
                {org.plan_name}
                {org.plan_expires_at
                  ? ` · até ${formatDateTime(org.plan_expires_at)}`
                  : org.plan_code === 'profissional'
                    ? ' · sem vencimento'
                    : ''}
              </Text>
              {org.expired_plan_code && org.expired_at && (
                <Text variant="bodySmall" style={{ color: paperTheme.colors.error }}>
                  O Profissional venceu em {formatDateTime(org.expired_at)} - voltou ao Gratuito.
                </Text>
              )}
              <Text variant="bodyMedium">
                Emitidos neste mês: {org.issued_this_month}
                {org.monthly_issued_quotes !== null ? ` de ${org.monthly_issued_quotes}` : ' (sem limite)'}
              </Text>
            </Card.Content>
          </Card>

          <Card mode="outlined">
            <Card.Content style={styles.cardContent}>
              <Text variant="titleMedium">IA nas últimas 24h</Text>
              <Text variant="bodyMedium">
                Interpretações: {org.interpretations_24h} de {org.daily_interpretations_limit}
              </Text>
              <Text variant="bodyMedium">
                Leituras de áudio/imagem: {org.extractions_24h} de {org.daily_extractions_limit}
              </Text>
              <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
                {org.limits_overridden
                  ? 'Limite definido pelo admin.'
                  : `Padrão do sistema (${DEFAULT_DAILY_INTERPRETATIONS}/${DEFAULT_DAILY_EXTRACTIONS}).`}
              </Text>
            </Card.Content>
          </Card>

          <Card mode="outlined">
            <Card.Content style={styles.cardContent}>
              <Text variant="titleMedium">Ações</Text>
              <Button mode="contained-tonal" icon="card-account-details-star-outline" onPress={() => setPlanDialogVisible(true)}>
                Definir plano
              </Button>
              <Button mode="outlined" icon="speedometer" onPress={() => openDialog('limits')}>
                Ajustar limite de IA
              </Button>
              {org.suspended_at ? (
                <Button mode="contained" icon="play-circle-outline" onPress={() => openDialog('reactivate')}>
                  Reativar organização
                </Button>
              ) : (
                <Button
                  mode="outlined"
                  icon="pause-circle-outline"
                  textColor={paperTheme.colors.error}
                  onPress={() => openDialog('suspend')}>
                  Suspender organização
                </Button>
              )}
              {org.stuck_interpretations > 0 && (
                <Button mode="outlined" icon="lock-open-variant-outline" onPress={() => openDialog('unstick')}>
                  Destravar {org.stuck_interpretations} interpretação(ões) presa(s)
                </Button>
              )}
            </Card.Content>
          </Card>

          <Section title="Uso por dia (30 dias, só dias com atividade)">
            {activeDays.length === 0 ? (
              <Muted>Sem atividade.</Muted>
            ) : (
              activeDays.map((d) => (
                <Text key={d.day} variant="bodySmall">
                  {new Date(`${d.day}T12:00:00`).toLocaleDateString('pt-BR')}: {d.quotes_created} criado(s) ·{' '}
                  {d.interpretations} interpretação(ões) · {d.extractions} leitura(s) · {d.quotes_issued} emitido(s) ·{' '}
                  {formatUsdFromCents(d.cost_cents)}
                </Text>
              ))
            )}
          </Section>

          <Section title="Erros recentes (só o código)">
            {detail.recent_errors.length === 0 ? (
              <Muted>Nenhum.</Muted>
            ) : (
              detail.recent_errors.map((e) => (
                <Text key={`${e.at}-${e.source}`} variant="bodySmall">
                  {formatDateTime(e.at)} · {e.source} · {e.code ?? 'sem código'}
                </Text>
              ))
            )}
          </Section>

          <Section title="Linha do tempo">
            {detail.timeline.length === 0 ? (
              <Muted>Nenhum evento.</Muted>
            ) : (
              detail.timeline.map((ev) => (
                <Text key={`${ev.at}-${ev.event}`} variant="bodySmall">
                  {formatDateTime(ev.at)} · {EVENT_LABELS[ev.event] ?? ev.event}
                  {ev.quote_number ? ` · nº ${ev.quote_number}` : ''}
                </Text>
              ))
            )}
          </Section>

          <Section title="Membros">
            {detail.members.map((m) => (
              <Text key={m.user_short_id} variant="bodySmall">
                {m.user_short_id} · {m.role} · {m.status} · desde {formatDateTime(m.joined_at)}
              </Text>
            ))}
          </Section>

          <Section title="Ações de admin nesta organização">
            {detail.admin_actions.length === 0 ? (
              <Muted>Nenhuma.</Muted>
            ) : (
              detail.admin_actions.map((a) => (
                <Text key={a.at} variant="bodySmall">
                  {formatDateTime(a.at)} · {ADMIN_ACTION_LABELS[a.action] ?? a.action} · “{a.reason}”
                </Text>
              ))
            )}
          </Section>
        </ScrollView>
      )}

      <Portal>
        <Dialog visible={dialog !== null} onDismiss={() => !submitting && setDialog(null)}>
          <Dialog.Title>{dialog ? DIALOG_TITLES[dialog] : ''}</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            {dialog === 'suspend' && (
              <Text variant="bodyMedium">
                A organização perde o acesso ao app (vê um aviso de conta suspensa) e a IA/emissão ficam bloqueadas.
                Nenhum dado é apagado; dá pra reativar a qualquer momento.
              </Text>
            )}
            {dialog === 'reactivate' && <Text variant="bodyMedium">A organização volta a usar o app normalmente.</Text>}
            {dialog === 'unstick' && (
              <Text variant="bodyMedium">
                Marca como falha as interpretações paradas há mais de 10 minutos. O usuário consegue pedir de novo.
              </Text>
            )}
            {dialog === 'limits' && (
              <>
                <Text variant="bodyMedium">
                  Por organização, a cada 24h. Deixe vazio para usar o padrão do sistema.
                </Text>
                <TextInput
                  mode="outlined"
                  label={`Interpretações (padrão ${DEFAULT_DAILY_INTERPRETATIONS})`}
                  value={interpretationsLimit}
                  onChangeText={setInterpretationsLimit}
                  keyboardType="number-pad"
                />
                <TextInput
                  mode="outlined"
                  label={`Leituras de áudio/imagem (padrão ${DEFAULT_DAILY_EXTRACTIONS})`}
                  value={extractionsLimit}
                  onChangeText={setExtractionsLimit}
                  keyboardType="number-pad"
                />
                {limitsInvalid && (
                  <HelperText type="error" visible>
                    Use números inteiros maiores que zero (ou deixe vazio).
                  </HelperText>
                )}
              </>
            )}
            <TextInput
              mode="outlined"
              label="Motivo (vai para a auditoria)"
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={500}
            />
            {actionError && <Text style={{ color: paperTheme.colors.error }}>{actionError}</Text>}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialog(null)} disabled={submitting}>
              Voltar
            </Button>
            <Button
              onPress={handleSubmit}
              loading={submitting}
              disabled={!canSubmit}
              textColor={dialog === 'suspend' ? paperTheme.colors.error : undefined}>
              Confirmar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <AdminPlanDialog
        visible={planDialogVisible}
        title="Definir plano"
        description="Cobrança manual: ative o Profissional depois de receber (Pix ou link). Sem validade = não vence; vencido, volta sozinho ao Gratuito."
        initialPlan={org?.plan_code ?? 'gratuito'}
        onDismiss={() => setPlanDialogVisible(false)}
        onSubmit={async (plan, expiresAt, why) => {
          if (!organizationId) return;
          await setOrganizationPlan(organizationId, plan, expiresAt, why);
          setPlanDialogVisible(false);
          setNotice('Plano atualizado.');
          await load();
        }}
      />

      <Snackbar visible={notice !== null} onDismiss={() => setNotice(null)} duration={3000}>
        {notice}
      </Snackbar>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="titleSmall">{title}</Text>
      {children}
      <Divider style={styles.divider} />
    </View>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  const paperTheme = usePaperTheme();
  return (
    <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  cardContent: { gap: Spacing.two },
  section: { gap: Spacing.one },
  divider: { marginTop: Spacing.two },
  dialogContent: { gap: Spacing.two },
  centered: { marginTop: Spacing.five, textAlign: 'center' },
});
