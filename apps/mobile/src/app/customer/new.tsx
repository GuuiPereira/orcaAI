import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text, TextInput, useTheme as usePaperTheme } from 'react-native-paper';

import { Spacing } from '@/constants/theme';
import { createCustomer, type CustomerInput } from '@/lib/customers';

type FormState = {
  name: string;
  phone: string;
  email: string;
  document: string;
  address: string;
  notes: string;
};

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

// RF-010/RF-011: cadastro completo de cliente (nome obrigatório, resto
// opcional). O "cliente rápido" (RF-012, só o nome) tem seu próprio fluxo
// embutido no seletor de cliente (components/customer-picker-modal.tsx).
export default function NewCustomerScreen() {
  const paperTheme = usePaperTheme();
  const [form, setForm] = useState<FormState>({
    name: '',
    phone: '',
    email: '',
    document: '',
    address: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setErrorMessage('Nome é obrigatório.');
      return;
    }
    setErrorMessage(null);
    setSaving(true);
    try {
      await createCustomer(toInput(form));
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: paperTheme.colors.background }]}>
      <View style={styles.content}>
        <Text variant="headlineSmall">Novo cliente</Text>

        <TextInput
          mode="outlined"
          label="Nome *"
          value={form.name}
          onChangeText={(value) => set('name', value)}
          error={!form.name.trim() && errorMessage !== null}
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

        {errorMessage && <Text style={{ color: paperTheme.colors.error }}>{errorMessage}</Text>}

        <View style={styles.navRow}>
          <Button mode="outlined" onPress={() => router.back()} disabled={saving} style={styles.flexButton}>
            Cancelar
          </Button>
          <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving} style={styles.flexButton}>
            Salvar
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
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
