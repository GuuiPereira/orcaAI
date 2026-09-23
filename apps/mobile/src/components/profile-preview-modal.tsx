import { Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from 'react-native-paper';

import { PdfPreview } from '@/components/pdf-preview';
import { Spacing } from '@/constants/theme';

// Prévia só de leitura (sem compartilhar) - diferente da prévia do editor de
// orçamento, aqui o conteúdo é um exemplo, nunca um documento real.
export function ProfilePreviewModal({ html, onClose }: { html: string | null; onClose: () => void }) {
  return (
    <Modal visible={html !== null} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {html && <PdfPreview html={html} />}
        <View style={styles.actions}>
          <Button mode="contained" onPress={onClose}>
            Fechar
          </Button>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  actions: { padding: Spacing.three },
});
