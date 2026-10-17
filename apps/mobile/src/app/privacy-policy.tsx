import { buildPrivacyPolicyMarkdown, type PrivacyPolicyValues } from '@orcaai/shared';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Appbar, useTheme as usePaperTheme } from 'react-native-paper';

import { MarkdownText } from '@/components/markdown-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { goBackOr } from '@/lib/navigation';
import { EMPTY_PRIVACY_VALUES, getPrivacyPolicyValues } from '@/lib/privacy';

// Política de privacidade - abre sem login (tela de entrada) e pelo Perfil >
// Ajuda. O texto é o template versionado em @orcaai/shared; os dados do
// responsável vêm do painel admin. Se a leitura falhar, mostra o texto com
// "(a definir)" no lugar desses dados - nunca deixa a pessoa sem a política.
export default function PrivacyPolicyScreen() {
  const paperTheme = usePaperTheme();
  const [values, setValues] = useState<PrivacyPolicyValues | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPrivacyPolicyValues()
      .then((result) => {
        if (!cancelled) setValues(result);
      })
      .catch(() => {
        if (!cancelled) setValues(EMPTY_PRIVACY_VALUES);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
      <SafeAreaView edges={['top']}>
        <Appbar.Header elevated={false} style={{ backgroundColor: paperTheme.colors.background }}>
          <Appbar.BackAction onPress={() => goBackOr('/')} />
          <Appbar.Content title="Política de privacidade" />
        </Appbar.Header>
      </SafeAreaView>
      {values === null ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <MarkdownText markdown={buildPrivacyPolicyMarkdown(values)} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.five },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
});
