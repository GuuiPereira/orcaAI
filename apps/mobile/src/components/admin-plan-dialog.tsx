import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, Dialog, HelperText, Portal, SegmentedButtons, Text, TextInput, useTheme as usePaperTheme } from 'react-native-paper';

import { Spacing } from '@/constants/theme';
import { expiresAtFromDays, PLAN_LABELS, type PlanCode } from '@/lib/admin';

type Props = {
  visible: boolean;
  title: string;
  description: string;
  initialPlan: PlanCode;
  onDismiss: () => void;
  // Lança erro com mensagem pronta pra exibir (ver lib/admin.ts).
  onSubmit: (plan: PlanCode, expiresAt: string | null, reason: string) => Promise<void>;
};

const PLAN_OPTIONS = (['gratuito', 'profissional'] as PlanCode[]).map((code) => ({ value: code, label: PLAN_LABELS[code] }));

// Fase 3 - planos (cobrança manual): escolher plano + validade em dias (vazio
// = sem vencimento) + motivo, que vai pra auditoria junto com a mudança.
export function AdminPlanDialog({ visible, title, description, initialPlan, onDismiss, onSubmit }: Props) {
  const paperTheme = usePaperTheme();
  const [plan, setPlan] = useState<PlanCode>(initialPlan);
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);

  // Reabriu: volta ao estado inicial (ajuste de estado durante o render, sem efeito).
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setPlan(initialPlan);
      setDays('');
      setReason('');
      setError(null);
    }
  }

  const trimmedDays = days.trim();
  const parsedDays = trimmedDays ? Number(trimmedDays) : null;
  const daysInvalid = parsedDays !== null && !(Number.isInteger(parsedDays) && parsedDays > 0);
  const canSubmit = reason.trim().length >= 3 && !(plan === 'profissional' && daysInvalid) && !submitting;

  async function handleConfirm() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const expiresAt = plan === 'profissional' && parsedDays !== null ? expiresAtFromDays(parsedDays) : null;
      await onSubmit(plan, expiresAt, reason.trim());
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={() => !submitting && onDismiss()}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content style={styles.content}>
          <Text variant="bodyMedium">{description}</Text>
          <SegmentedButtons value={plan} onValueChange={(value) => setPlan(value as PlanCode)} buttons={PLAN_OPTIONS} />
          {plan === 'profissional' && (
            <>
              <TextInput
                mode="outlined"
                label="Validade em dias (vazio = sem vencimento)"
                value={days}
                onChangeText={setDays}
                keyboardType="number-pad"
              />
              {daysInvalid && (
                <HelperText type="error" visible>
                  Use um número inteiro de dias maior que zero (ou deixe vazio).
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
          {error && <Text style={{ color: paperTheme.colors.error }}>{error}</Text>}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={submitting}>
            Voltar
          </Button>
          <Button onPress={handleConfirm} loading={submitting} disabled={!canSubmit}>
            Confirmar
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.two },
});
