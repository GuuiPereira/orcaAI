import type { AiConfidence, AiInterpretationResult, Discount, PdfItem, QuoteItemType, QuoteStatus } from '@orcaai/shared';
import {
  buildQuoteHtml,
  buildQuotePdfFileName,
  calculateQuoteTotals,
  centsToReaisInput,
  formatCentsAsBRL,
  MANUALLY_SETTABLE_QUOTE_STATUSES,
  parseReaisInputToCents,
  QUOTE_ITEM_TYPE_LABELS,
  QUOTE_STATUS_LABELS,
} from '@orcaai/shared';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardTypeOptions, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Appbar,
  Banner,
  Button,
  Card,
  Chip,
  Divider,
  HelperText,
  IconButton,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme as usePaperTheme,
} from 'react-native-paper';

import { CustomerPickerModal } from '@/components/customer-picker-modal';
import { PdfPreview } from '@/components/pdf-preview';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { createCustomer, getCustomer, updateCustomer, type Customer } from '@/lib/customers';
import { goBackOr } from '@/lib/navigation';
import { getCurrentOrganization, getCurrentOrganizationId, type CurrentOrganization } from '@/lib/organizations';
import { shareQuotePdf } from '@/lib/pdf-share';
import { getOrganizationLogoDataUri } from '@/lib/storage';
import { saveIssuedQuotePdf } from '@/lib/quote-pdf-storage';
import {
  issueQuote,
  listQuoteEvents,
  markQuoteStatus,
  updateQuoteCustomer,
  type IssueQuoteItem,
  type QuoteEvent,
} from '@/lib/quotes';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/monitoring';

// Cor de destaque para campos incertos/ausentes (RF-024, RF-025) e para
// erros de validação (RF-049). Não faz parte da paleta base do app - são
// acentos semânticos, usados só em borda/texto, nunca como fundo cheio.
const UNCERTAIN_ACCENT = '#eab308';

const ITEM_TYPE_SEGMENTS = [
  { value: 'service', label: 'Serviço' },
  { value: 'material', label: 'Material' },
  { value: 'other', label: 'Outro' },
];

type DiscountKind = 'none' | 'fixed' | 'percentage';

const DISCOUNT_KIND_OPTIONS = [
  { value: 'none', label: 'Nenhum' },
  { value: 'fixed', label: 'Valor fixo' },
  { value: 'percentage', label: 'Percentual' },
];

// RF-074: rótulos da linha do tempo - cobre tanto os event_type de
// QUOTE_STATUS_LABELS (enviado/aprovado/recusado/expirado) quanto os que
// não são um status de orçamento (criado/emitido/reemitido).
const EVENT_TYPE_LABELS: Record<string, string> = {
  criado: 'Criado',
  reemitido: 'Reemitido',
  ...QUOTE_STATUS_LABELS,
};

// Modo de geração do PDF (decisão de 2026-08-01,
// .tasks/fase-1-prova-do-nucleo.md item 6).
type PdfGenerationMode = 'completo' | 'separado' | 'service' | 'material';

const PDF_MODE_OPTIONS = [
  { value: 'completo', label: 'Completo' },
  { value: 'separado', label: 'Separado' },
  { value: 'service', label: 'Serviço' },
  { value: 'material', label: 'Material' },
];

type EditableItem = {
  key: string;
  type: QuoteItemType;
  description: string;
  category: string;
  // Quantidade e unidade são só contexto - opcionais, nunca obrigatórias.
  quantity: string;
  unit: string;
  // Valor TOTAL do item (não é preço por unidade).
  totalPriceReais: string;
  confidence: AiConfidence | null;
};

type EditableCommercialTerms = {
  paymentTerms: string;
  estimatedDurationDays: string;
  validityDays: string;
};

function itemFromResult(item: AiInterpretationResult['items'][number], key: string): EditableItem {
  return {
    key,
    type: item.type,
    description: item.description,
    category: item.category ?? '',
    quantity: item.quantity !== null ? String(item.quantity) : '',
    unit: item.unit ?? '',
    totalPriceReais: centsToReaisInput(item.total_price_cents),
    confidence: item.confidence,
  };
}

// RF-049: nunca deixa um valor digitado negativo estragar o cálculo -
// contribui 0 pro total, mas o campo continua marcado com erro (ver
// hasNegativeValue no ItemCard).
function safeItemCents(raw: string): number | null {
  const cents = parseReaisInputToCents(raw);
  if (cents === null) return null;
  return cents < 0 ? 0 : cents;
}

function daysToString(days: number | null): string {
  return days !== null ? String(days) : '';
}

// A quantidade do item é texto livre no editor (aceita vírgula decimal, só
// pra exibição no PDF - PdfItem.quantity é string) - a emissão precisa do
// valor numérico de verdade (quoteItemSchema.quantity), então convertemos
// aqui. Valor inválido ou <= 0 vira null em vez de travar a emissão (mesmo
// espírito de safeItemCents pra preço).
function parseQuantity(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export default function QuoteEditorScreen() {
  const paperTheme = usePaperTheme();
  const { quoteId } = useLocalSearchParams<{ quoteId: string }>();
  const keyCounter = useRef(0);
  const nextKey = () => `item-${keyCounter.current++}`;

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [showOriginalText, setShowOriginalText] = useState(false);

  const [linkedCustomer, setLinkedCustomer] = useState<Customer | null>(null);
  const [customerPickerVisible, setCustomerPickerVisible] = useState(false);
  const [customerActionPending, setCustomerActionPending] = useState(false);
  const [aiCustomerSuggestion, setAiCustomerSuggestion] = useState<AiInterpretationResult['customer'] | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [commercialTerms, setCommercialTerms] = useState<EditableCommercialTerms>({
    paymentTerms: '',
    estimatedDurationDays: '',
    validityDays: '',
  });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [discountKind, setDiscountKind] = useState<DiscountKind>('none');
  const [discountValue, setDiscountValue] = useState('');
  const [organization, setOrganization] = useState<CurrentOrganization | null>(null);
  const [logoDataUri, setLogoDataUri] = useState<string | null>(null);
  const [pdfMode, setPdfMode] = useState<PdfGenerationMode>('completo');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState('orcamento');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [quoteMeta, setQuoteMeta] = useState<{
    number: string | null;
    status: QuoteStatus;
    currentVersion: number;
    issuedAt: string | null;
  }>({ number: null, status: 'rascunho', currentVersion: 0, issuedAt: null });
  const [events, setEvents] = useState<QuoteEvent[]>([]);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // RF-006: quando a IA (ou o orçamento em branco, sem IA nenhuma) não
  // trouxe forma de pagamento/validade, cai nas condições padrão
  // cadastradas no perfil em vez de deixar o campo vazio - só na primeira
  // vez que o orçamento é gerado (um orçamento já emitido hidrata de
  // `quotes`/`quote_items`, não passa por aqui - ver `load` abaixo).
  function applyResult(
    result: AiInterpretationResult,
    defaults?: { paymentTerms: string | null; validityDays: number | null },
  ) {
    // RF-013/migração de cliente da IA: o texto extraído nunca vira um
    // registro paralelo - só uma sugestão pra criar/atualizar o cliente de
    // verdade (customers), avaliada contra o cliente já vinculado (ver
    // aiSuggestionRelevant abaixo).
    setAiCustomerSuggestion(result.customer);
    setSuggestionDismissed(false);
    setItems(result.items.map((item) => itemFromResult(item, nextKey())));
    setCommercialTerms({
      paymentTerms: result.commercial_terms.payment_terms ?? defaults?.paymentTerms ?? '',
      estimatedDurationDays:
        result.commercial_terms.estimated_duration_days !== null
          ? String(result.commercial_terms.estimated_duration_days)
          : '',
      validityDays: daysToString(result.commercial_terms.validity_days ?? defaults?.validityDays ?? null),
    });
    setWarnings(result.warnings);
  }

  useEffect(() => {
    if (!quoteId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErrorMessage(null);
      try {
        // Aguardado (não é fire-and-forget) porque as condições padrão do
        // perfil (RF-006) precisam estar disponíveis antes de decidir as
        // condições comerciais de um orçamento novo, mais abaixo. Falha
        // aqui não trava o editor - só desabilita a geração do PDF e os
        // padrões até resolver.
        const organization = await getCurrentOrganization().catch(() => null);
        if (cancelled) return;
        setOrganization(organization);
        // Logo embutido no PDF (RF-005) - não trava o editor se falhar, o
        // documento só sai sem a imagem.
        getOrganizationLogoDataUri(organization?.logoPath ?? null)
          .then((uri) => {
            if (!cancelled) setLogoDataUri(uri);
          })
          .catch(() => {});
        const commercialDefaults = {
          paymentTerms: organization?.defaultPaymentTerms ?? null,
          validityDays: organization?.defaultValidityDays ?? null,
        };

        const { data: quote, error: quoteError } = await supabase
          .from('quotes')
          .select('source_text, customer_id, number, status, current_version, issued_at, discount, commercial_terms')
          .eq('id', quoteId)
          .single();
        if (quoteError || !quote) throw quoteError ?? new Error('Orçamento não encontrado.');
        if (cancelled) return;
        setSourceText(quote.source_text ?? '');
        setQuoteMeta({
          number: quote.number,
          status: quote.status as QuoteStatus,
          currentVersion: quote.current_version,
          issuedAt: quote.issued_at,
        });

        // RF-074: linha do tempo - não deve travar o editor se falhar.
        listQuoteEvents(quoteId)
          .then((result) => {
            if (!cancelled) setEvents(result);
          })
          .catch(() => {});

        if (quote.customer_id) {
          getCustomer(quote.customer_id)
            .then((customer) => {
              if (!cancelled) setLinkedCustomer(customer);
            })
            .catch(() => {
              // Falha ao buscar o cliente vinculado não deve travar o editor.
            });
        }

        // Depois da 1ª emissão, quote_items passa a ser a fonte de verdade
        // (task 4) - reabrir o editor não deve voltar pro rascunho que a IA
        // extraiu da última vez, e sim pro que foi de fato emitido.
        const { data: existingItems, error: existingItemsError } = await supabase
          .from('quote_items')
          .select('type, description, category, quantity, unit, total_price_cents')
          .eq('quote_id', quoteId)
          .order('position', { ascending: true });
        if (existingItemsError) throw existingItemsError;
        if (cancelled) return;

        if (existingItems && existingItems.length > 0) {
          setItems(
            existingItems.map((item) =>
              itemFromResult(
                {
                  type: item.type as QuoteItemType,
                  description: item.description,
                  category: item.category,
                  quantity: item.quantity,
                  unit: item.unit,
                  total_price_cents: item.total_price_cents,
                  confidence: 'high',
                  source_excerpt: '',
                },
                nextKey(),
              ),
            ),
          );
          if (quote.discount) {
            if (quote.discount.type === 'fixed') {
              setDiscountKind('fixed');
              setDiscountValue(centsToReaisInput(quote.discount.value_cents));
            } else {
              setDiscountKind('percentage');
              setDiscountValue(String(quote.discount.value_percent));
            }
          }
          if (quote.commercial_terms) {
            setCommercialTerms({
              paymentTerms: quote.commercial_terms.payment_terms ?? '',
              estimatedDurationDays:
                quote.commercial_terms.estimated_duration_days !== null
                  ? String(quote.commercial_terms.estimated_duration_days)
                  : '',
              validityDays:
                quote.commercial_terms.validity_days !== null
                  ? String(quote.commercial_terms.validity_days)
                  : '',
            });
          }
        } else {
          const { data: interpretation, error: interpretationError } = await supabase
            .from('ai_interpretations')
            .select('status, result')
            .eq('quote_id', quoteId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (interpretationError) throw interpretationError;
          if (cancelled) return;

          if (interpretation?.status === 'concluido' && interpretation.result) {
            applyResult(interpretation.result as AiInterpretationResult, commercialDefaults);
          } else {
            // Orçamento novo, ainda sem interpretação nenhuma (ou o usuário
            // abandonou a IA - RF-029) - condições comerciais começam com
            // os padrões do perfil em vez de em branco.
            setCommercialTerms((c) => ({
              ...c,
              paymentTerms: commercialDefaults.paymentTerms ?? '',
              validityDays: daysToString(commercialDefaults.validityDays),
            }));
          }
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  // RF-049: percentual fora de 0-100 (ou texto inválido) não vira desconto -
  // fica sem aplicar até o usuário corrigir, em vez de quebrar o cálculo.
  const discount: Discount | null = useMemo(() => {
    if (discountKind === 'fixed') {
      const cents = parseReaisInputToCents(discountValue);
      return cents !== null && cents >= 0 ? { type: 'fixed', value_cents: cents } : null;
    }
    if (discountKind === 'percentage') {
      const percent = Number(discountValue.trim().replace(',', '.'));
      return Number.isFinite(percent) && percent >= 0 && percent <= 100
        ? { type: 'percentage', value_percent: percent }
        : null;
    }
    return null;
  }, [discountKind, discountValue]);

  const discountHasInvalidInput = discountKind !== 'none' && discountValue.trim() !== '' && discount === null;

  // Só é relevante mostrar a sugestão se a IA achou um nome e ele traz algo
  // que o cliente vinculado ainda não tem (nome diferente, telefone ou
  // endereço novos) - evita repetir uma sugestão que já foi aplicada.
  const aiSuggestionRelevant = useMemo(() => {
    if (!aiCustomerSuggestion?.name || suggestionDismissed) return false;
    if (!linkedCustomer) return true;
    const nameDiffers = linkedCustomer.name.trim().toLowerCase() !== aiCustomerSuggestion.name.trim().toLowerCase();
    const hasNewPhone = Boolean(aiCustomerSuggestion.phone) && !linkedCustomer.phone;
    const hasNewAddress = Boolean(aiCustomerSuggestion.address) && !linkedCustomer.address;
    return nameDiffers || hasNewPhone || hasNewAddress;
  }, [aiCustomerSuggestion, linkedCustomer, suggestionDismissed]);

  async function persistCustomerLink(customerId: string | null) {
    if (!quoteId) return;
    try {
      await updateQuoteCustomer(quoteId, customerId);
    } catch (error) {
      Alert.alert(
        'Não foi possível salvar o cliente',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  function handleSelectCustomer(customer: Customer) {
    setCustomerPickerVisible(false);
    setLinkedCustomer(customer);
    setSuggestionDismissed(false);
    persistCustomerLink(customer.id);
  }

  function handleClearCustomer() {
    setCustomerPickerVisible(false);
    setLinkedCustomer(null);
    setSuggestionDismissed(false);
    persistCustomerLink(null);
  }

  async function handleCreateCustomerFromSuggestion() {
    if (!aiCustomerSuggestion?.name) return;
    setCustomerActionPending(true);
    try {
      const created = await createCustomer({
        name: aiCustomerSuggestion.name,
        phone: aiCustomerSuggestion.phone,
        email: null,
        document: null,
        address: aiCustomerSuggestion.address,
        notes: null,
      });
      setLinkedCustomer(created);
      await persistCustomerLink(created.id);
      setSuggestionDismissed(true);
    } catch (error) {
      Alert.alert(
        'Não foi possível criar o cliente',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setCustomerActionPending(false);
    }
  }

  async function handleUpdateCustomerFromSuggestion() {
    if (!linkedCustomer || !aiCustomerSuggestion) return;
    setCustomerActionPending(true);
    try {
      const patch = {
        name: linkedCustomer.name,
        phone: linkedCustomer.phone ?? aiCustomerSuggestion.phone,
        email: linkedCustomer.email,
        document: linkedCustomer.document,
        address: linkedCustomer.address ?? aiCustomerSuggestion.address,
        notes: linkedCustomer.notes,
      };
      await updateCustomer(linkedCustomer.id, patch);
      setLinkedCustomer({ ...linkedCustomer, ...patch });
      setSuggestionDismissed(true);
    } catch (error) {
      Alert.alert(
        'Não foi possível atualizar o cliente',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setCustomerActionPending(false);
    }
  }

  // Cada item já guarda o valor TOTAL dele - a soma não multiplica por
  // quantidade (ver docs/ARCHITECTURE.md §4).
  const totals = useMemo(() => {
    const calculableItems = items.map((item) => ({
      type: item.type,
      total_price_cents: safeItemCents(item.totalPriceReais),
    }));
    return calculateQuoteTotals(calculableItems, discount);
  }, [items, discount]);

  function updateItem(key: string, patch: Partial<EditableItem>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((item) => item.key !== key));
  }

  function addItem() {
    setItems((current) => [
      ...current,
      {
        key: nextKey(),
        type: 'service',
        description: '',
        category: '',
        quantity: '',
        unit: '',
        totalPriceReais: '',
        confidence: null,
      },
    ]);
  }

  // Só pra exibição no PDF - `quantity` fica como texto (aceita o que o
  // usuário digitou, com vírgula etc.). Emissão usa `toIssueItems` abaixo,
  // com `quantity` numérica de verdade.
  function toPdfItems(): PdfItem[] {
    return items.map((item) => ({
      type: item.type,
      description: item.description,
      category: item.category || null,
      quantity: item.quantity || null,
      unit: item.unit || null,
      total_price_cents: safeItemCents(item.totalPriceReais),
    }));
  }

  // Emissão: descarta linhas totalmente em branco (sobra de "Adicionar
  // item" nunca preenchido) e converte quantity pra número - itens que
  // sobrarem ainda precisam de descrição (checado em handleIssuePress
  // antes de chamar isso), senão o schema da function rejeita com 400.
  function toIssueItems(): IssueQuoteItem[] {
    return items
      .filter(
        (item) =>
          item.description.trim() ||
          item.category.trim() ||
          item.quantity.trim() ||
          item.unit.trim() ||
          safeItemCents(item.totalPriceReais) !== null,
      )
      .map((item) => ({
        type: item.type,
        description: item.description.trim(),
        category: item.category || null,
        quantity: parseQuantity(item.quantity),
        unit: item.unit || null,
        total_price_cents: safeItemCents(item.totalPriceReais),
      }));
  }

  function buildHtmlFor(mode: 'completo' | 'service' | 'material'): string | null {
    if (!organization) return null;
    return buildQuoteHtml({
      mode,
      organization: { ...organization, logoDataUri },
      customer: {
        name: linkedCustomer?.name ?? null,
        phone: linkedCustomer?.phone ?? null,
        address: linkedCustomer?.address ?? null,
      },
      items: toPdfItems(),
      discount,
      commercialTerms: {
        paymentTerms: commercialTerms.paymentTerms || null,
        estimatedDurationDays: commercialTerms.estimatedDurationDays
          ? Number(commercialTerms.estimatedDurationDays)
          : null,
        validityDays: commercialTerms.validityDays ? Number(commercialTerms.validityDays) : null,
      },
      issuedAt: new Date(),
    });
  }

  // Nome do arquivo compartilhado: orcamento_DDMMAAAA_Cliente[_servico|_material]
  // (ver buildQuotePdfFileName em @orcaai/shared).
  function pdfFileName(mode: 'completo' | 'service' | 'material'): string {
    return buildQuotePdfFileName({ date: new Date(), customerName: linkedCustomer?.name, mode });
  }

  async function handleGeneratePress() {
    if (!organization) {
      Alert.alert('Aguarde', 'Ainda carregando os dados do prestador.');
      return;
    }
    setGeneratingPdf(true);
    try {
      if (pdfMode === 'separado') {
        const serviceHtml = buildHtmlFor('service');
        const materialHtml = buildHtmlFor('material');
        if (serviceHtml) await shareQuotePdf(serviceHtml, pdfFileName('service'));
        if (materialHtml) await shareQuotePdf(materialHtml, pdfFileName('material'));
        return;
      }
      const html = buildHtmlFor(pdfMode);
      if (html) {
        setPreviewFileName(pdfFileName(pdfMode));
        setPreviewHtml(html);
      }
    } catch (error) {
      reportError(error, 'pdf-generate');
      Alert.alert(
        'Não foi possível gerar o PDF',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function handleIssuePress() {
    if (!quoteId) return;
    const issueItems: IssueQuoteItem[] = toIssueItems();
    if (issueItems.length === 0) {
      Alert.alert('Adicione itens', 'É preciso pelo menos um item para emitir o orçamento.');
      return;
    }
    if (issueItems.some((item) => !item.description)) {
      Alert.alert('Descrição obrigatória', 'Preencha a descrição de todos os itens antes de emitir.');
      return;
    }
    setIssuing(true);
    try {
      const result = await issueQuote(quoteId, {
        items: issueItems,
        discount,
        commercialTerms: {
          payment_terms: commercialTerms.paymentTerms || null,
          estimated_duration_days: commercialTerms.estimatedDurationDays
            ? Number(commercialTerms.estimatedDurationDays)
            : null,
          validity_days: commercialTerms.validityDays ? Number(commercialTerms.validityDays) : null,
        },
      });
      setQuoteMeta({
        number: result.quote.number,
        status: result.quote.status,
        currentVersion: result.quote.current_version,
        issuedAt: result.quote.issued_at,
      });
      // issue-quote grava "emitido"/"reemitido" em quote_events do lado do
      // servidor (RF-074) - busca de novo pra refletir na linha do tempo.
      listQuoteEvents(quoteId)
        .then(setEvents)
        .catch(() => {});

      // Task 6: gera e sobe o PDF dessa versão pro Storage - só se ainda não
      // tiver sido salvo (idempotente: reemitir sem mudar nada não deveria
      // tentar subir de novo um caminho que já existe). Falha aqui não
      // desfaz a emissão, que já valeu - só avisa.
      let pdfWarning: string | null = null;
      if (!result.version.pdf_path) {
        try {
          const organizationId = await getCurrentOrganizationId();
          const html = organizationId ? buildHtmlFor('completo') : null;
          if (organizationId && html) {
            await saveIssuedQuotePdf(html, { organizationId, quoteId, version: result.quote.current_version });
          }
        } catch (pdfError) {
          reportError(pdfError, 'pdf-store');
          pdfWarning = pdfError instanceof Error ? pdfError.message : String(pdfError);
        }
      }

      Alert.alert(
        result.idempotent ? 'Nada mudou desde a última emissão' : 'Orçamento emitido',
        `Nº ${result.quote.number} · versão ${result.quote.current_version}.` +
          (pdfWarning ? `\n\nO PDF não foi salvo: ${pdfWarning}` : ''),
      );
    } catch (error) {
      reportError(error, 'issue-quote');
      Alert.alert('Não foi possível emitir', error instanceof Error ? error.message : String(error));
    } finally {
      setIssuing(false);
    }
  }

  // RF-073: reflete no app um estado que já aconteceu fora dele (o
  // prestador mandou pelo WhatsApp, o cliente respondeu etc.) - não dispara
  // nenhum envio de verdade.
  async function handleMarkStatus(status: (typeof MANUALLY_SETTABLE_QUOTE_STATUSES)[number]) {
    if (!quoteId) return;
    setUpdatingStatus(true);
    try {
      await markQuoteStatus(quoteId, status);
      setQuoteMeta((meta) => ({ ...meta, status }));
      listQuoteEvents(quoteId)
        .then(setEvents)
        .catch(() => {});
    } catch (error) {
      Alert.alert('Não foi possível atualizar o estado', error instanceof Error ? error.message : String(error));
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleShareFromPreview() {
    if (!previewHtml) return;
    setGeneratingPdf(true);
    try {
      await shareQuotePdf(previewHtml, previewFileName);
    } catch (error) {
      reportError(error, 'pdf-share');
      Alert.alert(
        'Não foi possível compartilhar',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setGeneratingPdf(false);
    }
  }

  const header = (
    <Appbar.Header elevated={false} style={{ backgroundColor: paperTheme.colors.background }}>
      <Appbar.BackAction onPress={() => goBackOr('/')} />
      <Appbar.Content title="Revisar orçamento" />
    </Appbar.Header>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
        <SafeAreaView edges={['top']}>{header}</SafeAreaView>
        <View style={styles.centered}>
          <ActivityIndicator />
          <Text style={{ color: paperTheme.colors.onSurfaceVariant }}>Carregando orçamento…</Text>
        </View>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
        <SafeAreaView edges={['top']}>{header}</SafeAreaView>
        <View style={styles.centered}>
          <Text variant="titleMedium">Não foi possível carregar</Text>
          <Text style={{ color: paperTheme.colors.onSurfaceVariant }}>{errorMessage}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
      <SafeAreaView edges={['top']}>{header}</SafeAreaView>

      <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <Text variant="bodyMedium" style={{ color: paperTheme.colors.onSurfaceVariant }}>
            Confira o que a IA entendeu e corrija o que precisar.
          </Text>

          <Button
            mode="text"
            onPress={() => setShowOriginalText((v) => !v)}
            icon={showOriginalText ? 'chevron-up' : 'chevron-down'}
            style={styles.selfStart}>
            {showOriginalText ? 'Ocultar texto original' : 'Ver texto original'}
          </Button>
          {showOriginalText && (
            <Card mode="outlined">
              <Card.Content>
                <Text variant="bodySmall">{sourceText}</Text>
              </Card.Content>
            </Card>
          )}

          {warnings.length > 0 && (
            <Banner visible icon="alert-circle-outline">
              {warnings.join('\n')}
            </Banner>
          )}

          <Card mode="outlined">
            <Card.Content style={styles.cardContentGap}>
              <Text variant="titleMedium">Cliente</Text>
              {linkedCustomer ? (
                <View>
                  <Text variant="bodyLarge">{linkedCustomer.name}</Text>
                  {linkedCustomer.phone && (
                    <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
                      {linkedCustomer.phone}
                    </Text>
                  )}
                  {linkedCustomer.address && (
                    <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
                      {linkedCustomer.address}
                    </Text>
                  )}
                </View>
              ) : (
                <Text variant="bodyMedium" style={{ color: paperTheme.colors.onSurfaceVariant }}>
                  Nenhum cliente vinculado.
                </Text>
              )}
              <Button mode="text" onPress={() => setCustomerPickerVisible(true)} style={styles.selfStart}>
                {linkedCustomer ? 'Trocar cliente' : 'Selecionar cliente'}
              </Button>
            </Card.Content>
          </Card>

          {aiSuggestionRelevant && aiCustomerSuggestion?.name && (
            <Banner
              visible
              icon="creation"
              actions={[
                linkedCustomer
                  ? {
                      label: 'Atualizar cadastro',
                      onPress: handleUpdateCustomerFromSuggestion,
                      disabled: customerActionPending,
                    }
                  : {
                      label: 'Criar cliente',
                      onPress: handleCreateCustomerFromSuggestion,
                      disabled: customerActionPending,
                    },
                { label: 'Ignorar', onPress: () => setSuggestionDismissed(true), disabled: customerActionPending },
              ]}>
              {linkedCustomer
                ? `A IA encontrou ${[
                    aiCustomerSuggestion.phone && !linkedCustomer.phone ? 'telefone' : null,
                    aiCustomerSuggestion.address && !linkedCustomer.address ? 'endereço' : null,
                  ]
                    .filter(Boolean)
                    .join(' e ')} pra ${linkedCustomer.name}.`
                : `"${aiCustomerSuggestion.name}"${
                    aiCustomerSuggestion.phone ? ` · ${aiCustomerSuggestion.phone}` : ''
                  }`}
            </Banner>
          )}

          <View style={styles.itemsHeader}>
            <Text variant="titleMedium">Itens</Text>
            <Button mode="text" icon="plus" onPress={addItem}>
              Adicionar item
            </Button>
          </View>

          {items.map((item) => (
            <ItemCard key={item.key} item={item} onChange={updateItem} onRemove={removeItem} />
          ))}

          <Card mode="outlined">
            <Card.Content style={styles.cardContentGap}>
              <Text variant="titleMedium">Condições comerciais</Text>
              <QuoteField
                label="Forma de pagamento"
                value={commercialTerms.paymentTerms}
                onChangeText={(paymentTerms) => setCommercialTerms((c) => ({ ...c, paymentTerms }))}
              />
              <QuoteField
                label="Prazo estimado (dias)"
                value={commercialTerms.estimatedDurationDays}
                onChangeText={(estimatedDurationDays) =>
                  setCommercialTerms((c) => ({ ...c, estimatedDurationDays }))
                }
                keyboardType="numeric"
              />
              <QuoteField
                label="Validade (dias)"
                value={commercialTerms.validityDays}
                onChangeText={(validityDays) => setCommercialTerms((c) => ({ ...c, validityDays }))}
                keyboardType="numeric"
              />
            </Card.Content>
          </Card>

          <DiscountCard
            kind={discountKind}
            value={discountValue}
            onKindChange={(kind) => {
              setDiscountKind(kind);
              if (kind === 'none') setDiscountValue('');
            }}
            onValueChange={setDiscountValue}
            hasInvalidInput={discountHasInvalidInput}
          />

          <Card mode="outlined">
            <Card.Content style={styles.cardContentGap}>
              <Text variant="titleMedium">Resumo</Text>
              {(Object.entries(totals.subtotalByType) as [QuoteItemType, number][])
                .filter(([, cents], _index, all) => cents > 0 && all.filter(([, c]) => c > 0).length > 1)
                .map(([type, cents]) => (
                  <SummaryRow key={type} label={QUOTE_ITEM_TYPE_LABELS[type]} value={formatCentsAsBRL(cents)} />
                ))}
              <SummaryRow label="Subtotal" value={formatCentsAsBRL(totals.subtotalCents)} />
              {totals.discountCents > 0 && (
                <SummaryRow label="Desconto" value={`- ${formatCentsAsBRL(totals.discountCents)}`} />
              )}
              <Divider />
              <Text variant="titleMedium">Total: {formatCentsAsBRL(totals.totalCents)}</Text>
            </Card.Content>
          </Card>

          <Card mode="outlined">
            <Card.Content style={styles.cardContentGap}>
              <Text variant="titleMedium">Emissão</Text>
              <Text style={{ color: paperTheme.colors.onSurfaceVariant }}>
                {quoteMeta.number
                  ? `Nº ${quoteMeta.number} · versão ${quoteMeta.currentVersion}${
                      quoteMeta.issuedAt
                        ? ` · emitido em ${new Date(quoteMeta.issuedAt).toLocaleDateString('pt-BR')}`
                        : ''
                    }`
                  : 'Ainda não emitido - o número e a versão são gerados na emissão.'}
              </Text>
              <Button
                mode="contained"
                disabled={issuing || items.length === 0}
                loading={issuing}
                onPress={handleIssuePress}>
                {quoteMeta.number ? 'Emitir nova versão' : 'Emitir orçamento'}
              </Button>
            </Card.Content>
          </Card>

          {quoteMeta.number && (
            <Card mode="outlined">
              <Card.Content style={styles.cardContentGap}>
                <Text variant="titleMedium">Estado comercial</Text>
                <Text style={{ color: paperTheme.colors.onSurfaceVariant }}>
                  Atual: {QUOTE_STATUS_LABELS[quoteMeta.status]}
                </Text>
                <View style={styles.chipRow}>
                  {MANUALLY_SETTABLE_QUOTE_STATUSES.map((status) => (
                    <Chip
                      key={status}
                      selected={quoteMeta.status === status}
                      disabled={updatingStatus}
                      onPress={() => handleMarkStatus(status)}>
                      {QUOTE_STATUS_LABELS[status]}
                    </Chip>
                  ))}
                </View>
              </Card.Content>
            </Card>
          )}

          {events.length > 0 && (
            <Card mode="outlined">
              <Card.Content style={styles.cardContentGap}>
                <Text variant="titleMedium">Histórico</Text>
                {events.map((event) => (
                  <View key={event.id} style={styles.timelineRow}>
                    <Text variant="bodyMedium">{EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}</Text>
                    <Text variant="bodySmall" style={{ color: paperTheme.colors.onSurfaceVariant }}>
                      {new Date(event.createdAt).toLocaleString('pt-BR')}
                    </Text>
                  </View>
                ))}
              </Card.Content>
            </Card>
          )}

          <Card mode="outlined">
            <Card.Content style={styles.cardContentGap}>
              <Text variant="titleMedium">Gerar orçamento</Text>
              <View style={styles.chipRow}>
                {PDF_MODE_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    selected={pdfMode === option.value}
                    onPress={() => setPdfMode(option.value as PdfGenerationMode)}>
                    {option.label}
                  </Chip>
                ))}
              </View>
              <Button
                mode="contained"
                disabled={generatingPdf || !organization}
                loading={generatingPdf}
                onPress={handleGeneratePress}>
                {pdfMode === 'separado' ? 'Gerar e compartilhar (2 PDFs)' : 'Ver prévia do PDF'}
              </Button>
            </Card.Content>
          </Card>
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={previewHtml !== null}
        animationType="slide"
        onRequestClose={() => setPreviewHtml(null)}>
        <SafeAreaView style={styles.previewContainer}>
          {previewHtml && <PdfPreview html={previewHtml} />}
          <View style={styles.previewActions}>
            <Button mode="outlined" onPress={() => setPreviewHtml(null)} style={styles.flexButton}>
              Fechar
            </Button>
            <Button
              mode="contained"
              disabled={generatingPdf}
              loading={generatingPdf}
              onPress={handleShareFromPreview}
              style={styles.flexButtonWide}>
              Compartilhar PDF
            </Button>
          </View>
        </SafeAreaView>
      </Modal>

      <CustomerPickerModal
        visible={customerPickerVisible}
        onClose={() => setCustomerPickerVisible(false)}
        onSelect={handleSelectCustomer}
        onClear={linkedCustomer ? handleClearCustomer : undefined}
      />
    </View>
  );
}

// Campo de texto com marcação de "incerto" (RF-024/025, borda/legenda
// amarela) e de erro de validação (RF-049, borda/legenda vermelha nativa do
// Paper) - as duas nunca aparecem juntas pro mesmo campo.
function QuoteField({
  label,
  value,
  onChangeText,
  uncertain,
  error,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  uncertain?: boolean;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
}) {
  const showUncertain = Boolean(uncertain) && !error;
  return (
    <View>
      <TextInput
        mode="outlined"
        label={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        error={Boolean(error)}
        outlineColor={showUncertain ? UNCERTAIN_ACCENT : undefined}
        activeOutlineColor={showUncertain ? UNCERTAIN_ACCENT : undefined}
      />
      {showUncertain && (
        <HelperText type="info" visible style={styles.uncertainHelperText}>
          Sem evidência clara no texto original
        </HelperText>
      )}
      {error && (
        <HelperText type="error" visible>
          {error}
        </HelperText>
      )}
    </View>
  );
}

function ItemCard({
  item,
  onChange,
  onRemove,
}: {
  item: EditableItem;
  onChange: (key: string, patch: Partial<EditableItem>) => void;
  onRemove: (key: string) => void;
}) {
  const uncertain = item.confidence !== null && item.confidence !== 'high';
  const parsedValueCents = parseReaisInputToCents(item.totalPriceReais);
  const hasNegativeValue = parsedValueCents !== null && parsedValueCents < 0;

  return (
    <Card mode="outlined" style={uncertain ? { borderColor: UNCERTAIN_ACCENT } : undefined}>
      <Card.Content style={styles.cardContentGap}>
        <View style={styles.itemHeaderRow}>
          <SegmentedButtons
            style={styles.itemTypeSegments}
            value={item.type}
            onValueChange={(value) => onChange(item.key, { type: value as QuoteItemType })}
            buttons={ITEM_TYPE_SEGMENTS}
          />
          <IconButton icon="delete-outline" onPress={() => onRemove(item.key)} />
        </View>

        <QuoteField
          label="Descrição"
          value={item.description}
          onChangeText={(description) => onChange(item.key, { description })}
          uncertain={!item.description}
        />
        <QuoteField
          label="Categoria"
          value={item.category}
          onChangeText={(category) => onChange(item.key, { category })}
        />
        <View style={styles.itemNumbersRow}>
          <View style={styles.itemNumberField}>
            <QuoteField
              label="Quantidade"
              value={item.quantity}
              onChangeText={(quantity) => onChange(item.key, { quantity })}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.itemNumberField}>
            <QuoteField label="Unidade" value={item.unit} onChangeText={(unit) => onChange(item.key, { unit })} />
          </View>
        </View>
        <QuoteField
          label="Valor (R$)"
          value={item.totalPriceReais}
          onChangeText={(totalPriceReais) => onChange(item.key, { totalPriceReais })}
          keyboardType="numeric"
          // Material sem preço é uma opção de negócio válida (por conta do
          // cliente), não um dado faltando - só sinaliza "incerto" pra
          // serviço/outro, onde a ausência de valor é de fato lacuna.
          uncertain={item.type !== 'material' && !item.totalPriceReais}
          error={hasNegativeValue ? 'Valor não pode ser negativo.' : undefined}
        />
      </Card.Content>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const paperTheme = usePaperTheme();
  return (
    <View style={styles.summaryRow}>
      <Text variant="bodyMedium" style={{ color: paperTheme.colors.onSurfaceVariant }}>
        {label}
      </Text>
      <Text variant="bodyMedium">{value}</Text>
    </View>
  );
}

function DiscountCard({
  kind,
  value,
  onKindChange,
  onValueChange,
  hasInvalidInput,
}: {
  kind: DiscountKind;
  value: string;
  onKindChange: (kind: DiscountKind) => void;
  onValueChange: (value: string) => void;
  hasInvalidInput: boolean;
}) {
  return (
    <Card mode="outlined">
      <Card.Content style={styles.cardContentGap}>
        <Text variant="titleMedium">Desconto</Text>
        <SegmentedButtons
          value={kind}
          onValueChange={(value) => onKindChange(value as DiscountKind)}
          buttons={DISCOUNT_KIND_OPTIONS}
        />
        {kind !== 'none' && (
          <QuoteField
            label={kind === 'fixed' ? 'Valor do desconto (R$)' : 'Desconto (%)'}
            value={value}
            onChangeText={onValueChange}
            keyboardType="numeric"
            error={
              hasInvalidInput
                ? kind === 'percentage'
                  ? 'Percentual precisa estar entre 0 e 100.'
                  : 'Valor inválido.'
                : undefined
            }
          />
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  scroll: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
  cardContentGap: {
    gap: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  uncertainHelperText: {
    color: UNCERTAIN_ACCENT,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTypeSegments: {
    flex: 1,
  },
  itemNumbersRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  itemNumberField: {
    flex: 1,
  },
  previewContainer: {
    flex: 1,
  },
  previewActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  flexButton: {
    flex: 1,
  },
  flexButtonWide: {
    flex: 2,
  },
});
