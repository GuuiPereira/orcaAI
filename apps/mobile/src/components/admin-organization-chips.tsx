import { StyleSheet, View } from 'react-native';
import { Chip, useTheme as usePaperTheme } from 'react-native-paper';

import { Spacing } from '@/constants/theme';
import { daysUntil, type AdminOrganization } from '@/lib/admin';

// Fase 6: estados de uma organização que pedem atenção do admin.
export function OrganizationChips({ org }: { org: AdminOrganization }) {
  const paperTheme = usePaperTheme();
  const chips: { label: string; danger?: boolean }[] = [];
  chips.push({ label: org.plan_name });
  if (org.plan_expires_at && daysUntil(org.plan_expires_at) <= 7) {
    chips.push({ label: `Vence em ${Math.max(daysUntil(org.plan_expires_at), 0)} dia(s)`, danger: true });
  }
  if (org.expired_plan_code) chips.push({ label: 'Plano venceu', danger: true });
  if (org.monthly_issued_quotes !== null && org.issued_this_month >= org.monthly_issued_quotes) {
    chips.push({ label: 'Limite do mês atingido', danger: true });
  }
  if (org.suspended_at) chips.push({ label: 'Suspensa', danger: true });
  if (org.owner_pending_deletion) chips.push({ label: 'Exclusão agendada', danger: true });
  if (org.stuck_interpretations > 0) chips.push({ label: `${org.stuck_interpretations} presa(s)`, danger: true });
  if (org.limits_overridden) chips.push({ label: 'Limite próprio' });
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
