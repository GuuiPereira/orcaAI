import { isPrivacyPolicyComplete, type PrivacyPolicyValues } from '@orcaai/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Dialog, HelperText, Portal, Text, TextInput, useTheme as usePaperTheme } from 'react-native-paper';

import { Spacing } from '@/constants/theme';
import { setPrivacySettings } from '@/lib/admin';
import { getPrivacyPolicyValues } from '@/lib/privacy';

function missingFields(values: PrivacyPolicyValues): string[] {
  return [
    !values.controllerName?.trim() ? 'responsável' : null,
    !values.privacyEmail?.trim() ? 'e-mail' : null,
    !values.responseDays ? 'prazo de resposta' : null,
  ].filter((field): field is string => field !== null);
}

// Painel admin: os dados do responsável que entram no texto da política de
// privacidade. O texto em si é versionado no código; isto vale na hora, sem
// update do app. Auditado, com motivo.
export function AdminPrivacyCard({ onSaved }: { onSaved: (message: string) => void }) {
  const paperTheme = usePaperTheme();
  const [values, setValues] = useState<PrivacyPolicyValues | null>(null);
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPrivacyPolicyValues()
      .then((result) => {
        if (!cancelled) setValues(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function openDialog() {
    setName(values?.controllerName ?? '');
    setDocument(values?.controllerDocument ?? '');
    setEmail(values?.privacyEmail ?? '');
    setDays(values?.responseDays ? String(values.responseDays) : '15');
    setReason('');
    setError(null);
    setVisible(true);
  }

  const parsedDays = days.trim() ? Number(days.trim()) : null;
  const daysInvalid = parsedDays !== null && !(Number.isInteger(parsedDays) && parsedDays >= 1 && parsedDays <= 15);

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      await setPrivacySettings(
        { controllerName: name, controllerDocument: document, privacyEmail: email, responseDays: parsedDays },
        reason.trim(),
      );
      setValues(await getPrivacyPolicyValues());
      setVisible(false);
      onSaved('Dados da política atualizados.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSubmitting(false);
    }
  }

  const complete = values ? isPrivacyPolicyComplete(values) : false;
  const missing = values ? missingFields(values) : [];

  return (
    <>
      <Card mode="contained">
        <Card.Content style={styles.row}>
          <View style={styles.flex}>
            <Text variant="bodyMedium">Política de privacidade</Text>
            <Text
              variant="bodySmall"
              style={{ color: complete ? paperTheme.colors.onSurfaceVariant : paperTheme.colors.error }}>
              {values === null
                ? 'Carregando…'
                : complete
                  ? `Completa · ${values.controllerName}`
                  : `Incompleta - falta: ${missing.join(', ')} (o app mostra "(a definir)")`}
            </Text>
          </View>
          <Button compact onPress={() => router.push('/privacy-policy')}>
            Ver
          </Button>
          <Button compact onPress={openDialog} disabled={values === null}>
            Editar
          </Button>
        </Card.Content>
      </Card>

      <Portal>
        <Dialog visible={visible} onDismiss={() => !submitting && setVisible(false)}>
          <Dialog.ScrollArea style={styles.scrollArea}>
            <View style={styles.dialogContent}>
              <Text variant="titleLarge">Dados da política</Text>
              <Text variant="bodyMedium">
                Entram no texto da política de privacidade (seções “Quem é o responsável”, “Seus direitos” e
                “Contato”). Valem na hora, sem update do app.
              </Text>
              <TextInput mode="outlined" label="Responsável (nome ou razão social)" value={name} onChangeText={setName} />
              <TextInput
                mode="outlined"
                label="CPF/CNPJ (opcional)"
                value={document}
                onChangeText={setDocument}
                keyboardType="numbers-and-punctuation"
              />
              <HelperText type="info" visible style={styles.helper}>
                A LGPD pede a identificação e o contato do responsável, não a publicação do CPF de uma pessoa física -
                prefira deixar vazio se não tiver CNPJ.
              </HelperText>
              <TextInput
                mode="outlined"
                label="E-mail para assuntos de privacidade"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextInput
                mode="outlined"
                label="Prazo de resposta (dias, até 15)"
                value={days}
                onChangeText={setDays}
                keyboardType="number-pad"
              />
              {daysInvalid && (
                <HelperText type="error" visible style={styles.helper}>
                  Use de 1 a 15 dias (a LGPD fala em até 15 dias).
                </HelperText>
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
            </View>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setVisible(false)} disabled={submitting}>
              Voltar
            </Button>
            <Button onPress={handleSave} loading={submitting} disabled={reason.trim().length < 3 || daysInvalid || submitting}>
              Salvar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  flex: { flex: 1 },
  scrollArea: { maxHeight: 520, paddingHorizontal: 0 },
  dialogContent: { gap: Spacing.two, padding: Spacing.four },
  helper: { paddingHorizontal: 0 },
});
