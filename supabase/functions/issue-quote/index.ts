import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { z } from "zod";
import { withErrorReporting } from "../_shared/sentry.ts";
import {
  calculateQuoteTotals,
  commercialTermsSchema,
  discountSchema,
  quoteItemTypeSchema,
} from "../../../packages/shared/src/index.ts";

// docs/ARCHITECTURE.md §7-8 - emissão, numeração e versões imutáveis.
// .tasks/fase-2-mvp-fechado.md task 4.

const issueItemSchema = z.object({
  type: quoteItemTypeSchema,
  description: z.string().min(1),
  category: z.string().nullable(),
  quantity: z.number().positive().nullable(),
  unit: z.string().nullable(),
  total_price_cents: z.number().int().nonnegative().nullable(),
});

const requestSchema = z.object({
  quote_id: z.uuid(),
  items: z.array(issueItemSchema).min(1),
  discount: discountSchema.nullable(),
  commercial_terms: commercialTermsSchema,
});

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function addDays(date: Date, days: number): string {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export default {
  fetch: withSupabase({ auth: "user" }, withErrorReporting("issue-quote", async (req, ctx) => {
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
    const { quote_id: quoteId, items, discount, commercial_terms: commercialTerms } = parsedBody.data;

    // RLS em `quotes` já garante que só um membro da organização dona do
    // orçamento consegue ler esta linha.
    const { data: quote, error: quoteError } = await ctx.supabase
      .from("quotes")
      .select(
        "id, organization_id, customer_id, number, status, issued_at, valid_until, subtotal_cents, total_cents, current_version",
      )
      .eq("id", quoteId)
      .maybeSingle();

    if (quoteError) {
      return Response.json({ message: "failed to load quote" }, { status: 500 });
    }
    if (!quote) {
      return Response.json({ message: "quote not found" }, { status: 404 });
    }

    const [organizationResult, customerResult] = await Promise.all([
      ctx.supabase
        .from("organizations")
        .select("trade_name, legal_name, tax_id, contact_phone, contact_email, address, logo_path")
        .eq("id", quote.organization_id)
        .single(),
      quote.customer_id
        ? ctx.supabase
            .from("customers")
            .select("name, phone, email, document, address")
            .eq("id", quote.customer_id)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (organizationResult.error || !organizationResult.data) {
      return Response.json({ message: "failed to load organization" }, { status: 500 });
    }
    if (customerResult.error) {
      return Response.json({ message: "failed to load customer" }, { status: 500 });
    }

    // Regra de negócio 6 (docs/PRD.md): totais são sempre recalculados no
    // backend, nunca confiados do que o cliente mandou.
    const totals = calculateQuoteTotals(items, discount);

    // Snapshot completo e autocontido: copia os dados de organização/cliente
    // de agora, não só o id - a versão emitida não pode mudar de conteúdo se
    // o perfil ou o cadastro do cliente forem editados depois.
    //
    // O hash cobre só o conteúdo decidido por quem emite (itens, desconto,
    // condições, organização/cliente no momento) - "issued_at"/"valid_until"
    // ficam de fora de propósito, porque dependem do relógio da chamada e
    // mudam a cada tentativa, mesmo sem nenhuma mudança de conteúdo. Incluí-
    // los quebraria a idempotência (RNF-004): duas chamadas idênticas
    // gerariam hashes diferentes e nunca bateriam com a última versão.
    const snapshotContent = {
      organization: organizationResult.data,
      customer: customerResult.data,
      items,
      discount,
      commercial_terms: commercialTerms,
      subtotal_cents: totals.subtotalCents,
      total_cents: totals.totalCents,
    };
    const snapshotHash = await sha256Hex(JSON.stringify(snapshotContent));

    const { data: latestVersion, error: latestVersionError } = await ctx.supabase
      .from("quote_versions")
      .select("id, version, snapshot_hash, issued_at, pdf_path")
      .eq("quote_id", quoteId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestVersionError) {
      return Response.json({ message: "failed to check existing versions" }, { status: 500 });
    }

    // RNF-004: reemitir com o mesmo conteúdo devolve a versão já existente
    // em vez de criar outra - mesmo formato de resposta do caminho normal,
    // pra quem chama não precisar tratar dois formatos diferentes.
    if (latestVersion && latestVersion.snapshot_hash === snapshotHash) {
      return Response.json({ quote, version: latestVersion, idempotent: true });
    }

    const isFirstEmission = quote.number === null;
    let number = quote.number;
    if (isFirstEmission) {
      // Regra de negócio 4: só ganha número novo na emissão, nunca no
      // rascunho - evita buracos por rascunhos abandonados.
      const { data: generatedNumber, error: numberError } = await ctx.supabase.rpc("next_quote_number", {
        target_org_id: quote.organization_id,
      });
      if (numberError || !generatedNumber) {
        return Response.json({ message: "failed to generate quote number" }, { status: 500 });
      }
      number = generatedNumber as string;
    }

    const nextVersion = (quote.current_version ?? 0) + 1;
    const issuedAt = new Date();
    const validUntil = commercialTerms.validity_days
      ? addDays(issuedAt, commercialTerms.validity_days)
      : null;
    const snapshot = {
      ...snapshotContent,
      valid_until: validUntil,
      issued_at: issuedAt.toISOString(),
    };

    // quote_versions é somente-leitura pra `authenticated` (grava só via
    // service role) - garante que um snapshot emitido nunca é editável pela
    // API pública depois de criado (regra de negócio 3).
    const { data: insertedVersion, error: insertVersionError } = await ctx.supabaseAdmin
      .from("quote_versions")
      .insert({
        quote_id: quoteId,
        version: nextVersion,
        snapshot,
        snapshot_hash: snapshotHash,
        issued_at: issuedAt.toISOString(),
        created_by: ctx.userClaims?.id ?? null,
      })
      .select("id, version, snapshot_hash, issued_at, pdf_path")
      .single();

    if (insertVersionError || !insertedVersion) {
      return Response.json({ message: "failed to save quote version" }, { status: 500 });
    }

    // quote_items só passa a ser gravado de verdade na emissão - até aqui
    // fica efêmero no editor (.tasks/fase-2-mvp-fechado.md task 3).
    const { error: deleteItemsError } = await ctx.supabase.from("quote_items").delete().eq("quote_id", quoteId);
    if (deleteItemsError) {
      return Response.json({ message: "failed to replace quote items" }, { status: 500 });
    }
    const { error: insertItemsError } = await ctx.supabase.from("quote_items").insert(
      items.map((item, index) => ({
        quote_id: quoteId,
        position: index,
        type: item.type,
        description: item.description,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        total_price_cents: item.total_price_cents,
        notes: null,
      })),
    );
    if (insertItemsError) {
      return Response.json({ message: "failed to save quote items" }, { status: 500 });
    }

    const { data: updatedQuote, error: updateQuoteError } = await ctx.supabase
      .from("quotes")
      .update({
        number,
        status: "emitido",
        issued_at: issuedAt.toISOString(),
        valid_until: validUntil,
        discount,
        commercial_terms: commercialTerms,
        subtotal_cents: totals.subtotalCents,
        total_cents: totals.totalCents,
        current_version: nextVersion,
      })
      .eq("id", quoteId)
      .select("id, number, status, issued_at, valid_until, subtotal_cents, total_cents, current_version")
      .single();

    if (updateQuoteError || !updatedQuote) {
      return Response.json({ message: "failed to update quote" }, { status: 500 });
    }

    await ctx.supabaseAdmin.from("quote_events").insert({
      quote_id: quoteId,
      event_type: isFirstEmission ? "emitido" : "reemitido",
      actor_user_id: ctx.userClaims?.id ?? null,
      metadata: { version: nextVersion, number },
    });

    return Response.json({ quote: updatedQuote, version: insertedVersion, idempotent: false });
  })),
};
