import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { z } from "zod";
import {
  AI_INTERPRETATION_JSON_SCHEMA,
  AI_INTERPRETATION_SCHEMA_VERSION,
  AI_PROMPT_VERSION,
  aiInterpretationResultSchema,
  buildInterpretationPrompt,
  type AiInterpretationResult,
} from "../../../packages/shared/src/index.ts";

// docs/ARCHITECTURE.md §4 - fluxo de interpretação, passos 2-7.

const requestSchema = z.object({
  quote_id: z.uuid(),
  force_reprocess: z.boolean().optional(),
});

type OpenAiResponsesResult = {
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

function extractOutputText(payload: OpenAiResponsesResult): string | null {
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

function deriveUncertainFields(result: AiInterpretationResult): string[] {
  const fields: string[] = [];
  if (!result.customer.name) fields.push("customer.name");
  if (!result.customer.phone) fields.push("customer.phone");
  if (!result.customer.address) fields.push("customer.address");
  result.items.forEach((item, index) => {
    if (item.confidence !== "high") fields.push(`items[${index}]`);
    if (item.unit_price_cents === null) fields.push(`items[${index}].unit_price_cents`);
  });
  return fields;
}

// Melhor esforço: só calcula se o preço por token estiver configurado via
// env. Sem isso, fica null em vez de inventar um custo.
function estimateCostCents(usage: OpenAiResponsesResult["usage"]): number | null {
  if (!usage) return null;
  const inputCostPerMillion = Number(Deno.env.get("OPENAI_INPUT_COST_CENTS_PER_1M"));
  const outputCostPerMillion = Number(Deno.env.get("OPENAI_OUTPUT_COST_CENTS_PER_1M"));
  if (!Number.isFinite(inputCostPerMillion) || !Number.isFinite(outputCostPerMillion)) {
    return null;
  }
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const costCents =
    (inputTokens * inputCostPerMillion + outputTokens * outputCostPerMillion) / 1_000_000;
  return Math.round(costCents);
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ message: "method not allowed" }, { status: 405 });
    }

    const parsedBody = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return Response.json(
        { message: "invalid request body", issues: parsedBody.error.issues },
        { status: 400 },
      );
    }
    const { quote_id: quoteId, force_reprocess: forceReprocess = false } = parsedBody.data;

    // RLS em `quotes` já garante que só um membro da organização dona do
    // orçamento consegue ler esta linha (docs/ARCHITECTURE.md §4, passo 3).
    const { data: quote, error: quoteError } = await ctx.supabase
      .from("quotes")
      .select("id, source_text")
      .eq("id", quoteId)
      .maybeSingle();

    if (quoteError) {
      return Response.json({ message: "failed to load quote" }, { status: 500 });
    }
    if (!quote) {
      return Response.json({ message: "quote not found" }, { status: 404 });
    }
    if (!quote.source_text || quote.source_text.trim().length === 0) {
      return Response.json({ message: "quote has no source_text to interpret" }, { status: 422 });
    }

    const { data: existing } = await ctx.supabase
      .from("ai_interpretations")
      .select("id, status, result")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && !forceReprocess) {
      if (existing.status === "concluido") {
        return Response.json({ interpretation_id: existing.id, status: existing.status, result: existing.result });
      }
      if (existing.status === "processando") {
        return Response.json({ message: "interpretation already in progress" }, { status: 409 });
      }
    }

    const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
    const openAiModel = Deno.env.get("OPENAI_MODEL");
    if (!openAiApiKey || !openAiModel) {
      return Response.json({ message: "AI provider not configured" }, { status: 500 });
    }

    const { data: interpretation, error: insertError } = await ctx.supabase
      .from("ai_interpretations")
      .insert({
        quote_id: quoteId,
        status: "processando",
        input_ref: quoteId,
        prompt_version: AI_PROMPT_VERSION,
        schema_version: AI_INTERPRETATION_SCHEMA_VERSION,
        model_version: openAiModel,
      })
      .select("id")
      .single();

    if (insertError || !interpretation) {
      return Response.json({ message: "failed to create interpretation" }, { status: 500 });
    }

    const prompt = buildInterpretationPrompt(quote.source_text);

    let openAiPayload: OpenAiResponsesResult;
    try {
      const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: openAiModel,
          input: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "ai_interpretation_result",
              schema: AI_INTERPRETATION_JSON_SCHEMA,
              strict: true,
            },
          },
        }),
      });

      if (!openAiResponse.ok) {
        throw new Error(`openai http ${openAiResponse.status}`);
      }
      openAiPayload = await openAiResponse.json();
    } catch (_error) {
      await ctx.supabase
        .from("ai_interpretations")
        .update({ status: "falhou", error: "ai_request_failed" })
        .eq("id", interpretation.id);
      return Response.json({ message: "AI request failed" }, { status: 502 });
    }

    const outputText = extractOutputText(openAiPayload);
    const parsedOutput = outputText ? JSON.parse(outputText) : null;
    const validation = aiInterpretationResultSchema.safeParse(parsedOutput);

    if (!validation.success) {
      await ctx.supabase
        .from("ai_interpretations")
        .update({
          status: "falhou",
          error: `invalid_ai_schema: ${validation.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
        })
        .eq("id", interpretation.id);
      return Response.json({ message: "AI response did not match the expected schema" }, { status: 502 });
    }

    const result = validation.data;
    const { error: updateError } = await ctx.supabase
      .from("ai_interpretations")
      .update({
        status: "concluido",
        result,
        uncertain_fields: deriveUncertainFields(result),
        usage: openAiPayload.usage ?? null,
        estimated_cost_cents: estimateCostCents(openAiPayload.usage),
      })
      .eq("id", interpretation.id);

    if (updateError) {
      return Response.json({ message: "failed to save interpretation" }, { status: 500 });
    }

    return Response.json({ interpretation_id: interpretation.id, status: "concluido", result });
  }),
};
