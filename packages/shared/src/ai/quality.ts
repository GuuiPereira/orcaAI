import type { QuoteItemType } from "../domain/quote-item.ts";

// Fase 5 (Grafana, .tasks/fase-5-grafana.md passo 1): PRD §11 pede "% aceito
// sem alteração / média de campos alterados" como sinal de qualidade da IA.
// Comparamos o que a IA devolveu com o que o usuário de fato emitiu - só
// contagens saem daqui, nunca o conteúdo comparado (RNF-008).
//
// Limitação conhecida: a comparação é por POSIÇÃO (item 0 da IA vs. item 0
// emitido, e assim por diante), porque nem a IA nem o editor dão um id
// estável a cada item. Se o usuário reordenar ou inserir um item no meio,
// a comparação desalinha a partir dali. É aceitável para uma tendência em
// dashboard (muitos orçamentos, ao longo do tempo) - não serve como
// auditoria exata de um orçamento específico.

export type AiQualityItemLike = {
  type: QuoteItemType;
  description: string;
  category: string | null;
  quantity: number | null;
  unit: string | null;
  total_price_cents: number | null;
};

export type AiQualityMetrics = {
  itemsFromAi: number;
  itemsEmitted: number;
  // Itens emitidos além do que a IA tinha devolvido (ficaram "sobrando" no
  // fim, pela comparação por posição).
  itemsAdded: number;
  // Itens da IA que não sobraram no que foi emitido.
  itemsRemoved: number;
  // Entre os itens comparados par a par: iguais em todos os campos, ou com
  // pelo menos um campo diferente.
  itemsUnchanged: number;
  itemsChanged: number;
  // Soma de campos diferentes entre os pares comparados (não só a contagem
  // de itens com alguma mudança) - é a base de "média de campos alterados".
  fieldsChanged: number;
};

const COMPARED_FIELDS = ["type", "description", "category", "quantity", "unit", "total_price_cents"] as const;

export function computeAiQualityMetrics(
  aiItems: readonly AiQualityItemLike[],
  emittedItems: readonly AiQualityItemLike[],
): AiQualityMetrics {
  const overlap = Math.min(aiItems.length, emittedItems.length);
  let itemsUnchanged = 0;
  let itemsChanged = 0;
  let fieldsChanged = 0;

  for (let index = 0; index < overlap; index++) {
    const aiItem = aiItems[index]!;
    const emittedItem = emittedItems[index]!;
    const diffCount = COMPARED_FIELDS.filter((field) => aiItem[field] !== emittedItem[field]).length;
    if (diffCount === 0) {
      itemsUnchanged++;
    } else {
      itemsChanged++;
    }
    fieldsChanged += diffCount;
  }

  return {
    itemsFromAi: aiItems.length,
    itemsEmitted: emittedItems.length,
    itemsAdded: Math.max(0, emittedItems.length - aiItems.length),
    itemsRemoved: Math.max(0, aiItems.length - emittedItems.length),
    itemsUnchanged,
    itemsChanged,
    fieldsChanged,
  };
}
