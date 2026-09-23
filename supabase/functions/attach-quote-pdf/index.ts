import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { z } from "zod";
import { withErrorReporting } from "../_shared/sentry.ts";

// .tasks/fase-2-mvp-fechado.md task 6 - upload do PDF emitido pro Storage.
//
// O cliente já subiu o PDF pro bucket `quote-pdfs` antes de chamar isto (as
// policies de storage.objects - migração 20260920163601 - já garantem que só
// um membro da organização dona consegue subir ali). Esta function só grava
// `quote_versions.pdf_path`, porque essa tabela é somente-leitura pra
// `authenticated` (grava só via service role, mesmo padrão do `issue-quote`).
//
// O caminho não vem do cliente: a function recalcula ele mesma a partir de
// quote_id/organization_id/version (mesma convenção que o cliente usa pra
// subir) e confirma que o objeto existe de verdade no Storage antes de
// gravar - evita confiar numa string arbitrária vinda da requisição.

const requestSchema = z.object({
  quote_id: z.uuid(),
  version: z.number().int().positive(),
});

export default {
  fetch: withSupabase({ auth: "user" }, withErrorReporting("attach-quote-pdf", async (req, ctx) => {
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
    const { quote_id: quoteId, version } = parsedBody.data;

    // RLS em `quotes` garante que só um membro da organização dona consegue
    // ler esta linha - é o gate de autorização.
    const { data: quote, error: quoteError } = await ctx.supabase
      .from("quotes")
      .select("organization_id")
      .eq("id", quoteId)
      .maybeSingle();
    if (quoteError) {
      return Response.json({ message: "failed to load quote" }, { status: 500 });
    }
    if (!quote) {
      return Response.json({ message: "quote not found" }, { status: 404 });
    }

    const { data: quoteVersion, error: versionError } = await ctx.supabase
      .from("quote_versions")
      .select("id, pdf_path")
      .eq("quote_id", quoteId)
      .eq("version", version)
      .maybeSingle();
    if (versionError) {
      return Response.json({ message: "failed to load quote version" }, { status: 500 });
    }
    if (!quoteVersion) {
      return Response.json({ message: "quote version not found" }, { status: 404 });
    }

    const path = `${quote.organization_id}/${quoteId}/${version}.pdf`;

    if (quoteVersion.pdf_path) {
      // Já anexado - idempotente se for o mesmo caminho (regra de negócio 3:
      // uma versão emitida não é sobrescrita, então isso nunca deveria
      // divergir na prática).
      if (quoteVersion.pdf_path === path) {
        return Response.json({ pdf_path: path, already_attached: true });
      }
      return Response.json({ message: "quote version already has a different pdf attached" }, { status: 409 });
    }

    // Confirma que o objeto existe de verdade no Storage antes de gravar -
    // createSignedUrl falha se o caminho não existir.
    const { error: signedUrlError } = await ctx.supabaseAdmin.storage
      .from("quote-pdfs")
      .createSignedUrl(path, 60);
    if (signedUrlError) {
      return Response.json({ message: "pdf not found in storage at the expected path" }, { status: 404 });
    }

    const { error: updateError } = await ctx.supabaseAdmin
      .from("quote_versions")
      .update({ pdf_path: path })
      .eq("id", quoteVersion.id);
    if (updateError) {
      return Response.json({ message: "failed to save pdf_path" }, { status: 500 });
    }

    return Response.json({ pdf_path: path, already_attached: false });
  })),
};
