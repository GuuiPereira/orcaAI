import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text, useTheme as usePaperTheme } from 'react-native-paper';

import { Spacing } from '@/constants/theme';
import {
  emailUrl,
  formatWhatsapp,
  getSupportContact,
  hasSupportContact,
  openSupportUrl,
  whatsappUrl,
  type SupportContact,
} from '@/lib/support';

type Props = {
  // Mensagem já escrita no WhatsApp e assunto do e-mail (ex.: "Quero assinar o Profissional").
  message: string;
  // Mostra o número/e-mail por escrito embaixo dos botões.
  showDetails?: boolean;
};

// Botões "WhatsApp" e "E-mail" com o contato definido no painel admin. Sem
// contato configurado (ou se a leitura falhar), não mostra nada - quem usa
// este componente já tem um texto genérico ao lado.
export function SupportContactButtons({ message, showDetails = false }: Props) {
  const paperTheme = usePaperTheme();
  const [contact, setContact] = useState<SupportContact | null>(null);

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

  if (!contact || !hasSupportContact(contact)) return null;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {contact.whatsapp && (
          <Button
            mode="outlined"
            icon="whatsapp"
            onPress={() => void openSupportUrl(whatsappUrl(contact.whatsapp!, message))}>
            WhatsApp
          </Button>
        )}
        {contact.email && (
          <Button mode="outlined" icon="email-outline" onPress={() => void openSupportUrl(emailUrl(contact.email!, message))}>
            E-mail
          </Button>
        )}
      </View>
      {showDetails && (
        <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
          {[contact.whatsapp ? formatWhatsapp(contact.whatsapp) : null, contact.email].filter(Boolean).join(' · ')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
