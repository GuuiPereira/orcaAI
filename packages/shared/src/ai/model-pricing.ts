// Preços da OpenAI, em centavos de dólar por 1.000.000 de tokens.
// Fonte: tabela de preços da OpenAI, consultada em 2026-08-01; a família
// gpt-5.6 (sol/terra/luna, faixa "short context") foi conferida linha a linha
// em 2026-09-24 (o sol tinha baixado de preço). Há também uma faixa "long
// context" mais cara - nossos prompts são curtos, não a usamos. Preços de IA
// mudam com frequência - revisar periodicamente. Usado para estimar
// `estimated_cost_cents` em `ai_interpretations` (docs/ARCHITECTURE.md §11).
export type ModelPricing = {
  id: string;
  inputCentsPer1M: number;
  // `null` = o modelo não tem preço de cache diferenciado ("-" na tabela de
  // preços); nesse caso o cálculo usa o preço normal de input/cache write.
  cachedInputCentsPer1M: number | null;
  cacheWriteCentsPer1M: number | null;
  outputCentsPer1M: number;
};

export const OPENAI_MODEL_PRICING: readonly ModelPricing[] = [
  {
    id: "gpt-5.6-sol",
    inputCentsPer1M: 400,
    cachedInputCentsPer1M: 40,
    cacheWriteCentsPer1M: 500,
    outputCentsPer1M: 2000,
  },
  {
    id: "gpt-5.6-terra",
    inputCentsPer1M: 200,
    cachedInputCentsPer1M: 20,
    cacheWriteCentsPer1M: 250,
    outputCentsPer1M: 1200,
  },
  {
    id: "gpt-5.6-luna",
    inputCentsPer1M: 20,
    cachedInputCentsPer1M: 2,
    cacheWriteCentsPer1M: 25,
    outputCentsPer1M: 120,
  },
  {
    id: "gpt-5.5",
    inputCentsPer1M: 500,
    cachedInputCentsPer1M: 50,
    cacheWriteCentsPer1M: null,
    outputCentsPer1M: 3000,
  },
  {
    id: "gpt-5.5-pro",
    inputCentsPer1M: 3000,
    cachedInputCentsPer1M: null,
    cacheWriteCentsPer1M: null,
    outputCentsPer1M: 18000,
  },
  {
    id: "gpt-5.4",
    inputCentsPer1M: 250,
    cachedInputCentsPer1M: 25,
    cacheWriteCentsPer1M: null,
    outputCentsPer1M: 1500,
  },
  {
    id: "gpt-5.4-mini",
    inputCentsPer1M: 75,
    cachedInputCentsPer1M: 7.5,
    cacheWriteCentsPer1M: null,
    outputCentsPer1M: 450,
  },
  {
    id: "gpt-5.4-nano",
    inputCentsPer1M: 20,
    cachedInputCentsPer1M: 2,
    cacheWriteCentsPer1M: null,
    outputCentsPer1M: 125,
  },
  {
    id: "gpt-5.4-pro",
    inputCentsPer1M: 3000,
    cachedInputCentsPer1M: null,
    cacheWriteCentsPer1M: null,
    outputCentsPer1M: 18000,
  },
];

export function findModelPricing(modelId: string): ModelPricing | undefined {
  return OPENAI_MODEL_PRICING.find((pricing) => pricing.id === modelId);
}

export type ResponsesApiUsage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  };
};

// Retorna null (nunca um número chutado) quando o modelo não está na
// tabela ou não há dados de uso - custo desconhecido é melhor do que
// custo inventado.
export function estimateCostCentsExact(
  modelId: string,
  usage: ResponsesApiUsage | null | undefined,
): number | null {
  if (!usage) return null;

  const pricing = findModelPricing(modelId);
  if (!pricing) return null;

  const totalInputTokens = usage.input_tokens ?? 0;
  const cachedTokens = usage.input_tokens_details?.cached_tokens ?? 0;
  const cacheWriteTokens = usage.input_tokens_details?.cache_write_tokens ?? 0;
  const freshInputTokens = Math.max(totalInputTokens - cachedTokens - cacheWriteTokens, 0);
  const outputTokens = usage.output_tokens ?? 0;

  const cachedInputPrice = pricing.cachedInputCentsPer1M ?? pricing.inputCentsPer1M;
  const cacheWritePrice = pricing.cacheWriteCentsPer1M ?? pricing.inputCentsPer1M;

  const costCents =
    (freshInputTokens * pricing.inputCentsPer1M +
      cachedTokens * cachedInputPrice +
      cacheWriteTokens * cacheWritePrice +
      outputTokens * pricing.outputCentsPer1M) /
    1_000_000;

  return costCents;
}

// `ai_interpretations.estimated_cost_cents` é inteiro, então segue
// arredondando. Chamadas baratas (ex.: extrair texto de uma imagem, ~0,02
// centavo) arredondariam pra 0 e sumiriam das métricas - essas usam a versão
// exata acima (`input_extractions.estimated_cost_cents` é numeric).
export function estimateCostCents(
  modelId: string,
  usage: ResponsesApiUsage | null | undefined,
): number | null {
  const exact = estimateCostCentsExact(modelId, usage);
  return exact === null ? null : Math.round(exact);
}

// Transcrição de áudio é cobrada por minuto (a resposta traz `usage.seconds`).
// Fonte: página de preços da OpenAI, consultada em 2026-09-24 (por resumo da
// página - conferir no site oficial antes de confiar em fechamento de conta).
// Em centavos de dólar por minuto.
export type TranscriptionPricing = { id: string; centsPerMinute: number };

export const OPENAI_TRANSCRIPTION_PRICING: readonly TranscriptionPricing[] = [
  { id: "gpt-transcribe", centsPerMinute: 0.45 },
  { id: "gpt-4o-transcribe", centsPerMinute: 0.6 },
  { id: "gpt-4o-mini-transcribe", centsPerMinute: 0.3 },
  { id: "whisper-1", centsPerMinute: 0.6 },
];

// null (nunca um número chutado) quando o modelo não está na tabela.
export function estimateTranscriptionCostCents(modelId: string, seconds: number): number | null {
  const pricing = OPENAI_TRANSCRIPTION_PRICING.find((entry) => entry.id === modelId);
  if (!pricing || !Number.isFinite(seconds) || seconds < 0) return null;
  return (seconds / 60) * pricing.centsPerMinute;
}
