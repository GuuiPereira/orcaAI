import { StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

const UNCERTAIN_ACCENT = '#eab308';
const ERROR_ACCENT = '#dc2626';

export function LabeledInput({
  label,
  value,
  onChangeText,
  uncertain,
  error,
  keyboardType,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  uncertain?: boolean;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  placeholder?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.fieldRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
        {uncertain && !error ? ' •' : ''}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.background },
          multiline && styles.multilineInput,
          uncertain && !error && styles.uncertainInput,
          error && styles.errorInput,
        ]}
      />
      {error && (
        <ThemedText type="small" style={styles.errorText}>
          {error}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldRow: {
    gap: Spacing.half,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 14,
  },
  multilineInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  uncertainInput: {
    borderWidth: 1,
    borderColor: UNCERTAIN_ACCENT,
  },
  errorInput: {
    borderWidth: 1,
    borderColor: ERROR_ACCENT,
  },
  errorText: {
    color: ERROR_ACCENT,
  },
});
