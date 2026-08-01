// react-native-webview não roda no target web - usa um iframe direto,
// que renderiza exatamente o mesmo HTML que vira o PDF.
export function PdfPreview({ html }: { html: string }) {
  return (
    <iframe
      srcDoc={html}
      style={{ flex: 1, width: '100%', height: '100%', border: 'none', backgroundColor: '#fff' }}
      title="Prévia do orçamento"
    />
  );
}
