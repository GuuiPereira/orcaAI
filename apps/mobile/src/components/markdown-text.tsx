import { Fragment, type ReactNode } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Text, useTheme as usePaperTheme } from 'react-native-paper';

import { Spacing } from '@/constants/theme';

// Renderizador mínimo do Markdown que a política de privacidade usa
// (packages/shared/src/legal/privacy-policy.ts): títulos `#`/`##`, parágrafos,
// listas `-` e `1.` (com linhas de continuação indentadas), **negrito** e
// links https. Sem biblioteca nova de propósito - o texto é nosso e só usa
// isso; se o template passar a usar outra coisa (tabela, itálico), estender
// aqui.

type Block =
  | { kind: 'h1' | 'h2' | 'p'; text: string }
  | { kind: 'li'; marker: string; text: string };

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^(#{1,2})\s+(.*)$/.exec(line);
    const bullet = /^-\s+(.*)$/.exec(line);
    const numbered = /^(\d+)\.\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: heading[1].length === 1 ? 'h1' : 'h2', text: heading[2] });
    } else if (bullet) {
      flush();
      current = { kind: 'li', marker: '•', text: bullet[1] };
    } else if (numbered) {
      flush();
      current = { kind: 'li', marker: `${numbered[1]}.`, text: numbered[2] };
    } else if (current && (current.kind === 'li' || current.kind === 'p')) {
      current.text += ` ${line.trim()}`;
    } else {
      flush();
      current = { kind: 'p', text: line.trim() };
    }
  }
  flush();
  return blocks;
}

// **negrito** e URLs https viram trechos estilizados; o resto é texto puro.
function renderInline(text: string, linkColor: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|(https:\/\/[^\s)]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      parts.push(
        <Text key={key++} style={styles.bold}>
          {match[1]}
        </Text>,
      );
    } else {
      const url = match[2];
      parts.push(
        <Text key={key++} style={{ color: linkColor, textDecorationLine: 'underline' }} onPress={() => void Linking.openURL(url)}>
          {url}
        </Text>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function MarkdownText({ markdown }: { markdown: string }) {
  const paperTheme = usePaperTheme();
  const linkColor = paperTheme.colors.primary;

  return (
    <View style={styles.container}>
      {parseBlocks(markdown).map((block, index) => {
        if (block.kind === 'h1') {
          return (
            <Text key={index} variant="headlineSmall">
              {renderInline(block.text, linkColor)}
            </Text>
          );
        }
        if (block.kind === 'h2') {
          return (
            <Text key={index} variant="titleMedium" style={styles.h2}>
              {renderInline(block.text, linkColor)}
            </Text>
          );
        }
        if (block.kind === 'li') {
          return (
            <View key={index} style={styles.listItem}>
              <Text variant="bodyMedium" style={styles.marker}>
                {block.marker}
              </Text>
              <Text variant="bodyMedium" style={styles.listText}>
                {renderInline(block.text, linkColor)}
              </Text>
            </View>
          );
        }
        return (
          <Fragment key={index}>
            <Text variant="bodyMedium">{renderInline(block.text, linkColor)}</Text>
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  h2: { marginTop: Spacing.three },
  bold: { fontWeight: 'bold' },
  listItem: { flexDirection: 'row', gap: Spacing.two, paddingLeft: Spacing.one },
  marker: { minWidth: 16 },
  listText: { flex: 1 },
});
