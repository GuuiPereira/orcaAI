import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Dialog, Portal, Text, TextInput, useTheme as usePaperTheme } from 'react-native-paper';

import { Spacing } from '@/constants/theme';
import { setSupportContact } from '@/lib/admin';
import { formatWhatsapp, getSupportContact, type SupportContact } from '@/lib/support';

// Painel admin: o contato de suporte que o app mostra (Perfil > Ajuda, conta
// suspensa, avisos de plano). Mudança auditada, com motivo; vale na hora, sem
// update do app.
export function AdminSupportContactCard({ onSaved }: { onSaved: (message: string) => void }) {
  const paperTheme = usePaperTheme();
  const [contact, setContact] = useState<SupportContact | null>(null);
  const [visible, setVisible] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSupportContact()
      .then((result) => {
        if (!cancelled) setContact(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function openDialog() {
    setWhatsapp(contact?.whatsapp ?? '');
    setEmail(contact?.email ?? '');
    setReason('');
    setError(null);
    setVisible(true);
  }

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      await setSupportContact(whatsapp, email, reason.trim());
      setContact(await getSupportContact());
      setVisible(false);
      onSaved('Contato de suporte atualizado.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSubmitting(false);
    }
  }

  const summary = [contact?.whatsapp ? formatWhatsapp(contact.whatsapp) : null, contact?.email]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <Card mode="contained">
        <Card.Content style={styles.row}>
          <View style={styles.flex}>
            <Text variant="bodyMedium">Contato de suporte</Text>
            <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
              {summary || 'Não configurado - o app mostra só "fale com a equipe do OrçaAI".'}
            </Text>
          </View>
          <Button compact onPress={openDialog} disabled={contact === null}>
            Editar
          </Button>
        </Card.Content>
      </Card>

      <Portal>
        <Dialog visible={visible} onDismiss={() => !submitting && setVisible(false)}>
          <Dialog.Title>Contato de suporte</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            <Text variant="bodyMedium">
              Aparece no app em Perfil &gt; Ajuda, na tela de conta suspensa e nos avisos para assinar o Profissional.
              Deixe vazio o canal que não quiser usar.
            </Text>
            <TextInput
              mode="outlined"
              label="WhatsApp com DDI e DDD (ex.: 5511999998888)"
              value={whatsapp}
              onChangeText={setWhatsapp}
              keyboardType="phone-pad"
            />
            <TextInput
              mode="outlined"
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
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
            <Button onPress={() => setVisible(false)} disabled={submitting}>
              Voltar
            </Button>
            <Button onPress={handleSave} loading={submitting} disabled={reason.trim().length < 3 || submitting}>
              Salvar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  dialogContent: { gap: Spacing.two },
});
