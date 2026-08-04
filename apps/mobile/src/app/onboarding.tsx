import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text, TextInput, useTheme as usePaperTheme } from 'react-native-paper';

import { Spacing } from '@/constants/theme';
import { signOut } from '@/lib/auth';
import { notifyOrganizationChanged } from '@/hooks/use-auth-gate';
import { createOrganization, type OrganizationProfile } from '@/lib/organizations';
import { supabase } from '@/lib/supabase';

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

const STEPS = ['Dados da empresa', 'Contato', 'Endereço', 'Condições padrão'] as const;

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

// Primeiro acesso (RF-004): cria a organização do usuário, em passos, pra
// não jogar 14 campos de uma vez (só o nome comercial é obrigatório). O
// gate em _layout.tsx só manda pra cá quando há sessão mas nenhuma
// organização vinculada ainda; sai sozinho assim que a organização é
// criada (via notifyOrganizationChanged()).
export default function OnboardingScreen() {
  const paperTheme = usePaperTheme();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => ({
    tradeName: '',
    legalName: '',
    taxId: '',
    contactPhone: '',
    contactEmail: '',
    street: '',
    number: '',
    neighborhood: '',
    city: '',
    state: '',
    zipCode: '',
    defaultValidityDays: '',
    defaultPaymentTerms: '',
    defaultObservations: '',
  }));

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    // Já veio do login com Google - pré-preenche o e-mail de contato assim
    // que a sessão responder, sem sobrescrever se o usuário já tiver
    // editado o campo.
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email;
      if (!cancelled && email) {
        setForm((prev) => (prev.contactEmail ? prev : { ...prev, contactEmail: email }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isLastStep = step === STEPS.length - 1;
  const isFirstStep = step === 0;

  function handleNext() {
    if (step === 0 && !form.tradeName.trim()) {
      setErrorMessage('Nome comercial é obrigatório.');
      return;
    }
    setErrorMessage(null);
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function handleBack() {
    setErrorMessage(null);
    setStep((current) => Math.max(current - 1, 0));
  }

  async function handleFinish() {
    if (!form.tradeName.trim()) {
      setErrorMessage('Nome comercial é obrigatório.');
      setStep(0);
      return;
    }
    setErrorMessage(null);
    setSubmitting(true);
    try {
      await createOrganization(toProfile(form));
      // Sucesso: não navega daqui - avisa o gate em _layout.tsx (que não
      // reagiria sozinho, já que a sessão não muda) e ele sai daqui pro
      // app assim que confirmar a organização nova.
      notifyOrganizationChanged();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: paperTheme.colors.background }]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text variant="headlineSmall">Conta pra gente sobre seu negócio</Text>
          <Text variant="bodyMedium" style={{ color: paperTheme.colors.onSurfaceVariant }}>
            Esses dados aparecem nos orçamentos que você gerar.
          </Text>
        </View>

        <View style={styles.stepIndicatorRow}>
          {STEPS.map((label, index) => (
            <View key={label} style={styles.stepIndicatorItem}>
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor:
                      index <= step ? paperTheme.colors.primary : paperTheme.colors.surfaceVariant,
                  },
                ]}
              />
              {index < STEPS.length - 1 && (
                <View
                  style={[
                    styles.stepLine,
                    { backgroundColor: index < step ? paperTheme.colors.primary : paperTheme.colors.surfaceVariant },
                  ]}
                />
              )}
            </View>
          ))}
        </View>
        <Text variant="labelMedium" style={{ color: paperTheme.colors.onSurfaceVariant }}>
          Passo {step + 1} de {STEPS.length} · {STEPS[step]}
        </Text>

        <View style={styles.fields}>
          {step === 0 && (
            <>
              <TextInput
                mode="outlined"
                label="Nome comercial *"
                value={form.tradeName}
                onChangeText={(value) => set('tradeName', value)}
                error={!form.tradeName.trim() && errorMessage !== null}
              />
              <TextInput
                mode="outlined"
                label="Razão social"
                value={form.legalName}
                onChangeText={(value) => set('legalName', value)}
              />
              <TextInput
                mode="outlined"
                label="CPF/CNPJ"
                value={form.taxId}
                onChangeText={(value) => set('taxId', value)}
                keyboardType="numeric"
              />
            </>
          )}

          {step === 1 && (
            <>
              <TextInput
                mode="outlined"
                label="Telefone"
                value={form.contactPhone}
                onChangeText={(value) => set('contactPhone', value)}
                keyboardType="phone-pad"
              />
              <TextInput
                mode="outlined"
                label="E-mail"
                value={form.contactEmail}
                onChangeText={(value) => set('contactEmail', value)}
                keyboardType="email-address"
              />
            </>
          )}

          {step === 2 && (
            <>
              <TextInput mode="outlined" label="Rua" value={form.street} onChangeText={(value) => set('street', value)} />
              <View style={styles.row}>
                <TextInput
                  mode="outlined"
                  label="Número"
                  value={form.number}
                  onChangeText={(value) => set('number', value)}
                  style={styles.rowItemSmall}
                />
                <TextInput
                  mode="outlined"
                  label="Bairro"
                  value={form.neighborhood}
                  onChangeText={(value) => set('neighborhood', value)}
                  style={styles.rowItem}
                />
              </View>
              <View style={styles.row}>
                <TextInput
                  mode="outlined"
                  label="Cidade"
                  value={form.city}
                  onChangeText={(value) => set('city', value)}
                  style={styles.rowItem}
                />
                <TextInput
                  mode="outlined"
                  label="Estado"
                  value={form.state}
                  onChangeText={(value) => set('state', value)}
                  style={styles.rowItemSmall}
                />
              </View>
              <TextInput
                mode="outlined"
                label="CEP"
                value={form.zipCode}
                onChangeText={(value) => set('zipCode', value)}
                keyboardType="numeric"
              />
            </>
          )}

          {step === 3 && (
            <>
              <TextInput
                mode="outlined"
                label="Validade do orçamento (dias)"
                value={form.defaultValidityDays}
                onChangeText={(value) => set('defaultValidityDays', value)}
                keyboardType="numeric"
              />
              <TextInput
                mode="outlined"
                label="Forma de pagamento padrão"
                value={form.defaultPaymentTerms}
                onChangeText={(value) => set('defaultPaymentTerms', value)}
              />
              <TextInput
                mode="outlined"
                label="Observações padrão"
                value={form.defaultObservations}
                onChangeText={(value) => set('defaultObservations', value)}
                multiline
                numberOfLines={3}
              />
            </>
          )}
        </View>

        {errorMessage && (
          <Text variant="bodySmall" style={{ color: paperTheme.colors.error }}>
            {errorMessage}
          </Text>
        )}

        <View style={styles.navRow}>
          {!isFirstStep && (
            <Button mode="outlined" onPress={handleBack} disabled={submitting}>
              Voltar
            </Button>
          )}
          {isLastStep ? (
            <Button mode="contained" onPress={handleFinish} loading={submitting} disabled={submitting} style={styles.flexButton}>
              Criar organização
            </Button>
          ) : (
            <Button mode="contained" onPress={handleNext} style={styles.flexButton}>
              Avançar
            </Button>
          )}
        </View>

        <Button onPress={() => signOut()}>Sair</Button>
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
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.one,
  },
  stepIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepIndicatorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginHorizontal: Spacing.one,
  },
  fields: {
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
  navRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flexButton: {
    flex: 1,
  },
});
