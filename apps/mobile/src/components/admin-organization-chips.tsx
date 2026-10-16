import { StyleSheet, View } from 'react-native';
import { Chip, useTheme as usePaperTheme } from 'react-native-paper';

import { Spacing } from '@/constants/theme';
import type { AdminOrganization } from '@/lib/admin';

// Fase 6: estados de uma organização que pedem atenção do admin.
export function OrganizationChips({ org }: { org: AdminOrganization }) {
  const paperTheme = usePaperTheme();
  const chips: { label: string; danger?: boolean }[] = [];
  if (org.suspended_at) chips.push({ label: 'Suspensa', danger: true });
  if (org.owner_pending_deletion) chips.push({ label: 'Exclusão agendada', danger: true });
  if (org.stuck_interpretations > 0) chips.push({ label: `${org.stuck_interpretations} presa(s)`, danger: true });
  if (org.limits_overridden) chips.push({ label: 'Limite próprio' });
  if (chips.length === 0) return null;
  return (
    <View style={styles.chipRow}>
      {chips.map((chip) => (
        <Chip
          key={chip.label}
          compact
          textStyle={chip.danger ? { color: paperTheme.colors.onErrorContainer } : undefined}
          style={chip.danger ? { backgroundColor: paperTheme.colors.errorContainer } : undefined}>
          {chip.label}
        </Chip>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
});
