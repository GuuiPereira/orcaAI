import { useEffect, useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Avatar,
  Button,
  Dialog,
  Divider,
  Portal,
  Text,
  TextInput,
  useTheme as usePaperTheme,
} from 'react-native-paper';

import { notifyOrganizationChanged } from '@/hooks/use-auth-gate';
import { BottomTabInset, Spacing, WebTopBarInset } from '@/constants/theme';
import { requestAccountDeletion } from '@/lib/account-deletion';
import { signOut } from '@/lib/auth';
import {
  getCurrentOrganizationId,
  getCurrentOrganizationProfile,
  updateOrganization,
  type OrganizationProfile,
  type OrganizationProfileInput,
} from '@/lib/organizations';
import { ProfilePreviewModal } from '@/components/profile-preview-modal';
import { buildProfilePreviewHtml } from '@/lib/quote-preview';
import { getOrganizationLogoDataUri, getOrganizationLogoUrl, pickAndUploadOrganizationLogo } from '@/lib/storage';

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

function toFormState(profile: OrganizationProfile): FormState {
  return {
    tradeName: profile.tradeName,
    legalName: profile.legalName ?? '',
    taxId: profile.taxId ?? '',
    contactPhone: profile.contactPhone ?? '',
    contactEmail: profile.contactEmail ?? '',
    street: profile.address?.street ?? '',
    number: profile.address?.number ?? '',
    neighborhood: profile.address?.neighborhood ?? '',
    city: profile.address?.city ?? '',
    state: profile.address?.state ?? '',
    zipCode: profile.address?.zip_code ?? '',
    defaultValidityDays:
      profile.preferences.default_validity_days != null ? String(profile.preferences.default_validity_days) : '',
    defaultPaymentTerms: profile.preferences.default_payment_terms ?? '',
    defaultObservations: profile.preferences.default_observations ?? '',
  };
}

function toProfile(form: FormState): OrganizationProfileInput {
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

function initials(tradeName: string): string {
  const parts = tradeName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export default function ProfileScreen() {
  const paperTheme = usePaperTheme();
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCurrentOrganizationId(), getCurrentOrganizationProfile()])
      .then(([id, profile]) => {
        if (cancelled) return;
        setOrganizationId(id);
        if (profile) {
          setForm(toFormState(profile));
          setLogoPath(profile.logoPath);
          getOrganizationLogoUrl(profile.logoPath).then((url) => {
            if (!cancelled) setLogoUrl(url);
          });
        }
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
  }, []);

  // Prévia com o que está no formulário agora (mesmo sem salvar) e o logo
  // atual - exemplo fictício, ver lib/quote-preview.ts.
  async function handleShowPreview() {
    if (!form) return;
    setLoadingPreview(true);
    try {
      const logoDataUri = await getOrganizationLogoDataUri(logoPath);
      setPreviewHtml(buildProfilePreviewHtml(toProfile(form), logoDataUri));
    } finally {
      setLoadingPreview(false);
    }
  }

  // Task 7 (RF-007): pede a exclusão da conta (agenda 7 dias, dá pra
  // cancelar). Confirmação por digitação do nome comercial pra evitar toque
  // acidental. O gate reage sozinho e leva pra tela "conta agendada".
  async function handleConfirmDeletion() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await requestAccountDeletion();
      setDeleteDialogVisible(false);
      notifyOrganizationChanged();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleting(false);
    }
  }

  // RF-005 (task 6): upload acontece na hora da escolha, sem esperar o
  // "Salvar" do resto do formulário - mesmo padrão do vínculo de cliente no
  // editor de orçamento (lib/quotes.ts updateQuoteCustomer).
  async function handlePickLogo() {
    if (!organizationId) return;
    setLogoError(null);
    setUploadingLogo(true);
    try {
      const path = await pickAndUploadOrganizationLogo(organizationId);
      if (path) {
        setLogoPath(path);
        setLogoUrl(await getOrganizationLogoUrl(path));
      }
    } catch (error) {
      setLogoError(error instanceof Error ? error.message : String(error));
    } finally {
      setUploadingLogo(false);
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSavedMessage(false);
  }

  async function handleSave() {
    if (!form || !organizationId) return;
    if (!form.tradeName.trim()) {
      setSaveError('Nome comercial é obrigatório.');
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      await updateOrganization(organizationId, toProfile(form));
      setSavedMessage(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: paperTheme.colors.background }} contentContainerStyle={styles.scrollContent}>
      <SafeAreaView style={styles.safeArea}>
        <Text variant="headlineMedium">Perfil</Text>

        {loading ? (
          <ActivityIndicator />
        ) : loadError ? (
          <Text style={{ color: paperTheme.colors.error }}>{loadError}</Text>
        ) : form && organizationId ? (
          <>
            <View style={styles.logoRow}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={styles.logoImage} />
              ) : (
                <Avatar.Text size={64} label={initials(form.tradeName)} />
              )}
              <View style={styles.logoTextColumn}>
                <Text variant="bodyMedium">Logo</Text>
                <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
                  {logoPath ? 'Usado no orçamento em PDF.' : 'Sem logo ainda - usamos suas iniciais.'}
                </Text>
                <Button mode="text" compact onPress={handlePickLogo} loading={uploadingLogo} disabled={uploadingLogo}>
                  {logoPath ? 'Trocar logo' : 'Escolher logo'}
                </Button>
                {logoError && <Text style={{ color: paperTheme.colors.error }}>{logoError}</Text>}
              </View>
            </View>

            <Section title="Sobre o negócio">
              <TextInput
                mode="outlined"
                label="Nome comercial *"
                value={form.tradeName}
                onChangeText={(value) => set('tradeName', value)}
                error={!form.tradeName.trim() && saveError !== null}
              />
              <TextInput mode="outlined" label="Razão social" value={form.legalName} onChangeText={(value) => set('legalName', value)} />
              <TextInput
                mode="outlined"
                label="CPF/CNPJ"
                value={form.taxId}
                onChangeText={(value) => set('taxId', value)}
                keyboardType="numeric"
              />
            </Section>

            <Section title="Contato">
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
            </Section>

            <Section title="Endereço">
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
            </Section>

            <Section title="Condições padrão">
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
            </Section>

            {savedMessage && (
              <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
                Dados salvos.
              </Text>
            )}
            {saveError && <Text style={{ color: paperTheme.colors.error }}>{saveError}</Text>}

            <Button mode="outlined" icon="file-eye-outline" onPress={handleShowPreview} loading={loadingPreview} disabled={loadingPreview}>
              Ver prévia do orçamento
            </Button>
            <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving}>
              Salvar
            </Button>
          </>
        ) : null}

        <Button onPress={() => signOut()}>Sair</Button>

        {form && organizationId && (
          <Button
            mode="text"
            textColor={paperTheme.colors.error}
            onPress={() => {
              setDeleteConfirmText('');
              setDeleteError(null);
              setDeleteDialogVisible(true);
            }}>
            Excluir minha conta
          </Button>
        )}
      </SafeAreaView>

      <Portal>
        <Dialog visible={deleteDialogVisible} onDismiss={() => !deleting && setDeleteDialogVisible(false)}>
          <Dialog.Title>Excluir conta</Dialog.Title>
          <Dialog.Content style={{ gap: Spacing.two }}>
            <Text variant="bodyMedium">
              Isso apaga sua empresa, clientes, orçamentos (inclusive os já emitidos), PDFs e logo. Depois de 7 dias
              não dá mais para recuperar.
            </Text>
            <Text variant="bodyMedium">
              Durante esses 7 dias você pode entrar de novo e cancelar a exclusão. Nesse período o app fica bloqueado.
            </Text>
            <TextInput
              mode="outlined"
              label={`Digite "${form?.tradeName.trim() ?? ''}" para confirmar`}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              autoCapitalize="none"
            />
            {deleteError && <Text style={{ color: paperTheme.colors.error }}>{deleteError}</Text>}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)} disabled={deleting}>
              Voltar
            </Button>
            <Button
              textColor={paperTheme.colors.error}
              onPress={handleConfirmDeletion}
              loading={deleting}
              disabled={
                deleting ||
                !form?.tradeName.trim() ||
                deleteConfirmText.trim().toLowerCase() !== form.tradeName.trim().toLowerCase()
              }>
              Excluir conta
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <ProfilePreviewModal html={previewHtml} onClose={() => setPreviewHtml(null)} />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="titleMedium">{title}</Text>
      {children}
      <Divider />
    </View>
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
    paddingTop: Platform.select({ web: WebTopBarInset + Spacing.three, default: Spacing.four }),
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.four,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  logoImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  logoTextColumn: {
    gap: 2,
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
});
