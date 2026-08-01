import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

export function PdfPreview({ html }: { html: string }) {
  return <WebView originWhitelist={['*']} source={{ html }} style={styles.webview} />;
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
  },
});
