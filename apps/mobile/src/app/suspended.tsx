import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text, useTheme as usePaperTheme } from 'react-native-paper';

import { SupportContactButtons } from '@/components/support-contact-buttons';
import { Spacing } from '@/constants/theme';
import { notifyOrganizationChanged } from '@/hooks/use-auth-gate';
import { signOut } from '@/lib/auth';

// Fase 6: o gate em _layout.tsx manda pra cá quando o admin da plataforma
// suspendeu a organização. Nada foi apagado - as functions de IA/emissão
// também recusam enquanto durar. "Verificar de novo" reavalia o gate (volta
// pro app se a suspensão já tiver sido retirada).
export default function SuspendedScreen() {
  const paperTheme = usePaperTheme();
  const [checking, setChecking] = useState(false);

  function handleCheckAgain() {
    setChecking(true);
    notifyOrganizationChanged();
    setTimeout(() => setChecking(false), 1500);
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: paperTheme.colors.background }]}>
      <View style={styles.content}>
        <Text variant="headlineSmall">Sua conta está suspensa</Text>
        <Text variant="bodyLarge">
          O acesso ao OrçaAI foi suspenso pela equipe do aplicativo. Seus orçamentos, clientes e dados continuam
          guardados - nada foi apagado.
        </Text>
        <Text variant="bodyLarge">Se você acha que é um engano, fale com o suporte do OrçaAI.</Text>
        <SupportContactButtons message="Olá! Minha conta do OrçaAI está suspensa e gostaria de entender o motivo." showDetails />

        <Button mode="contained" onPress={handleCheckAgain} loading={checking} disabled={checking}>
          Verificar de novo
        </Button>
        <Button onPress={() => signOut()}>Sair</Button>
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
