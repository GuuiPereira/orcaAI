import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Text, TextInput, useTheme as usePaperTheme } from 'react-native-paper';

import { Spacing } from '@/constants/theme';
import { getCustomer, setCustomerArchived, updateCustomer, type Customer, type CustomerInput } from '@/lib/customers';
import { goBackOr } from '@/lib/navigation';

type FormState = {
  name: string;
  phone: string;
  email: string;
  document: string;
  address: string;
  notes: string;
};

function toFormState(customer: Customer): FormState {
  return {
    name: customer.name,
    phone: customer.phone ?? '',
    email: customer.email ?? '',
    document: customer.document ?? '',
    address: customer.address ?? '',
    notes: customer.notes ?? '',
  };
}

function toInput(form: FormState): CustomerInput {
  return {
    name: form.name.trim(),
    phone: form.phone.trim() || null,
    email: form.email.trim() || null,
    document: form.document.trim() || null,
    address: form.address.trim() || null,
    notes: form.notes.trim() || null,
  };
}

// RF-010: edição e arquivamento de cliente.
export default function EditCustomerScreen() {
  const paperTheme = usePaperTheme();
  const { customerId } = useLocalSearchParams<{ customerId: string }>();

  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    getCustomer(customerId)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setLoadError('Cliente não encontrado.');
          return;
        }
        setCustomer(result);
        setForm(toFormState(result));
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!form || !customerId) return;
    if (!form.name.trim()) {
      setSaveError('Nome é obrigatório.');
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      await updateCustomer(customerId, toInput(form));
      goBackOr('/customers');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleArchived() {
    if (!customer || !customerId) return;
    setArchiving(true);
    try {
      await setCustomerArchived(customerId, !customer.archivedAt);
      setCustomer({ ...customer, archivedAt: customer.archivedAt ? null : new Date().toISOString() });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setArchiving(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: paperTheme.colors.background }} contentContainerStyle={styles.scrollContent}>
      <SafeAreaView style={styles.safeArea}>
        <Text variant="headlineSmall">Editar cliente</Text>

        {loading ? (
          <ActivityIndicator />
        ) : loadError ? (
          <Text style={{ color: paperTheme.colors.error }}>{loadError}</Text>
        ) : form && customer ? (
          <>
            {customer.archivedAt && (
              <Text style={{ color: paperTheme.colors.onSurfaceVariant }}>Este cliente está arquivado.</Text>
            )}

            <TextInput
              mode="outlined"
              label="Nome *"
              value={form.name}
              onChangeText={(value) => set('name', value)}
              error={!form.name.trim() && saveError !== null}
            />
            <TextInput
              mode="outlined"
              label="Telefone"
              value={form.phone}
              onChangeText={(value) => set('phone', value)}
              keyboardType="phone-pad"
            />
            <TextInput
              mode="outlined"
              label="E-mail"
              value={form.email}
              onChangeText={(value) => set('email', value)}
              keyboardType="email-address"
            />
            <TextInput
              mode="outlined"
              label="CPF/CNPJ"
              value={form.document}
              onChangeText={(value) => set('document', value)}
              keyboardType="numeric"
            />
            <TextInput
              mode="outlined"
              label="Endereço"
              value={form.address}
              onChangeText={(value) => set('address', value)}
              multiline
              numberOfLines={2}
            />
            <TextInput
              mode="outlined"
              label="Observações"
              value={form.notes}
              onChangeText={(value) => set('notes', value)}
              multiline
              numberOfLines={3}
            />

            {saveError && <Text style={{ color: paperTheme.colors.error }}>{saveError}</Text>}

            <View style={styles.navRow}>
              <Button mode="outlined" onPress={() => goBackOr('/customers')} disabled={saving} style={styles.flexButton}>
                Cancelar
              </Button>
              <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving} style={styles.flexButton}>
                Salvar
              </Button>
            </View>

            <Button onPress={handleToggleArchived} loading={archiving} disabled={archiving}>
              {customer.archivedAt ? 'Reativar cliente' : 'Arquivar cliente'}
            </Button>
          </>
        ) : null}
      </SafeAreaView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    paddingHorizontal: Spacing.four,
    paddingTop: Platform.select({ web: Spacing.six, default: Spacing.four }),
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  navRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  flexButton: {
    flex: 1,
  },
});
