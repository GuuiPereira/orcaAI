import type { OrganizationProfile } from '@/lib/organizations';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { LabeledInput } from '@/components/labeled-input';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type FormState = {
  tradeName: string;
  legalName: string;
  taxId: string;
  contactPhone: string;
  contactEmail: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  defaultValidityDays: string;
  defaultPaymentTerms: string;
  defaultObservations: string;
};

function toFormState(profile?: OrganizationProfile): FormState {
  return {
    tradeName: profile?.tradeName ?? '',
    legalName: profile?.legalName ?? '',
    taxId: profile?.taxId ?? '',
    contactPhone: profile?.contactPhone ?? '',
    contactEmail: profile?.contactEmail ?? '',
    street: profile?.address?.street ?? '',
    number: profile?.address?.number ?? '',
    neighborhood: profile?.address?.neighborhood ?? '',
    city: profile?.address?.city ?? '',
    state: profile?.address?.state ?? '',
    zipCode: profile?.address?.zip_code ?? '',
    defaultValidityDays:
      profile?.preferences.default_validity_days != null
        ? String(profile.preferences.default_validity_days)
        : '',
    defaultPaymentTerms: profile?.preferences.default_payment_terms ?? '',
    defaultObservations: profile?.preferences.default_observations ?? '',
  };
}

function toProfile(form: FormState): OrganizationProfile {
  const hasAddress = [form.street, form.number, form.neighborhood, form.city, form.state, form.zipCode].some(
    (value) => value.trim().length > 0,
  );
  const validityDays = form.defaultValidityDays.trim() ? Number(form.defaultValidityDays) : null;

  return {
    tradeName: form.tradeName.trim(),
    legalName: form.legalName.trim() || null,
    taxId: form.taxId.trim() || null,
    contactPhone: form.contactPhone.trim() || null,
    contactEmail: form.contactEmail.trim() || null,
    address: hasAddress
      ? {
          street: form.street.trim(),
          number: form.number.trim(),
          neighborhood: form.neighborhood.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          zip_code: form.zipCode.trim(),
        }
      : null,
    preferences: {
      default_validity_days: validityDays !== null && !Number.isNaN(validityDays) ? validityDays : null,
      default_payment_terms: form.defaultPaymentTerms.trim() || null,
      default_observations: form.defaultObservations.trim() || null,
    },
  };
}

export function OrganizationForm({
  initialValue,
  submitLabel,
  onSubmit,
}: {
  initialValue?: OrganizationProfile;
  submitLabel: string;
  onSubmit: (profile: OrganizationProfile) => Promise<void>;
}) {
  const theme = useTheme();
  const [form, setForm] = useState<FormState>(() => toFormState(initialValue));
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.tradeName.trim()) {
      setErrorMessage('Nome comercial é obrigatório.');
      return;
    }
    setErrorMessage(null);
    setSubmitting(true);
    try {
      await onSubmit(toProfile(form));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <ThemedText type="smallBold">Sobre o negócio</ThemedText>
        <LabeledInput
          label="Nome comercial *"
          value={form.tradeName}
          onChangeText={(value) => set('tradeName', value)}
          error={!form.tradeName.trim() && errorMessage ? errorMessage : undefined}
        />
        <LabeledInput label="Razão social" value={form.legalName} onChangeText={(value) => set('legalName', value)} />
        <LabeledInput label="CPF/CNPJ" value={form.taxId} onChangeText={(value) => set('taxId', value)} keyboardType="numeric" />
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold">Contato</ThemedText>
        <LabeledInput
          label="Telefone"
          value={form.contactPhone}
          onChangeText={(value) => set('contactPhone', value)}
          keyboardType="phone-pad"
        />
        <LabeledInput
          label="E-mail"
          value={form.contactEmail}
          onChangeText={(value) => set('contactEmail', value)}
          keyboardType="email-address"
        />
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold">Endereço (opcional)</ThemedText>
        <LabeledInput label="Rua" value={form.street} onChangeText={(value) => set('street', value)} />
        <View style={styles.row}>
          <View style={styles.rowItemSmall}>
            <LabeledInput label="Número" value={form.number} onChangeText={(value) => set('number', value)} />
          </View>
          <View style={styles.rowItem}>
            <LabeledInput label="Bairro" value={form.neighborhood} onChangeText={(value) => set('neighborhood', value)} />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <LabeledInput label="Cidade" value={form.city} onChangeText={(value) => set('city', value)} />
          </View>
          <View style={styles.rowItemSmall}>
            <LabeledInput label="Estado" value={form.state} onChangeText={(value) => set('state', value)} />
          </View>
        </View>
        <LabeledInput label="CEP" value={form.zipCode} onChangeText={(value) => set('zipCode', value)} keyboardType="numeric" />
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold">Condições padrão (opcional)</ThemedText>
        <LabeledInput
          label="Validade do orçamento (dias)"
          value={form.defaultValidityDays}
          onChangeText={(value) => set('defaultValidityDays', value)}
          keyboardType="numeric"
        />
        <LabeledInput
          label="Forma de pagamento padrão"
          value={form.defaultPaymentTerms}
          onChangeText={(value) => set('defaultPaymentTerms', value)}
        />
        <LabeledInput
          label="Observações padrão"
          value={form.defaultObservations}
          onChangeText={(value) => set('defaultObservations', value)}
          multiline
        />
      </View>

      {errorMessage && form.tradeName.trim() && (
        <ThemedText type="small" style={styles.errorText}>
          {errorMessage}
        </ThemedText>
      )}

      <Pressable
        accessibilityRole="button"
        disabled={submitting}
        onPress={handleSubmit}
        style={({ pressed }) => [styles.submitButton, { backgroundColor: theme.text }, pressed && styles.pressed]}>
        {submitting ? (
          <ActivityIndicator color={theme.background} />
        ) : (
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            {submitLabel}
          </ThemedText>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  rowItem: {
    flex: 2,
  },
  rowItemSmall: {
    flex: 1,
  },
  errorText: {
    color: '#dc2626',
  },
  submitButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.8,
  },
});
