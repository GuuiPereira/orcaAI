import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { withErrorReporting } from "../_shared/sentry.ts";
import { removePrefix } from "../_shared/storage.ts";

// Task 7 da Fase 2 (RF-007, RNF-014). Exclusão DEFINITIVA das contas cujo
// prazo de arrependimento venceu. Pensada pra ser chamada por um agendador
// (pg_cron) com a chave secret - como o `check-ai-cost`.
//
// Ordem, por conta:
//   1. arquivos do Storage das organizações do usuário (sem FK, ficariam
//      órfãos);
//   2. as organizações (a cascata leva clientes, orçamentos, itens, versões,
//      eventos, interpretações e contador de numeração);
//   3. o usuário do Auth (perfil, membros e o próprio pedido caem em
//      cascata; autoria em versões/eventos de outros vira null).
// Cada conta é independente: uma falha não impede as outras, e é reportada
// (só IDs técnicos e contagens, nunca conteúdo).

// Buckets que guardam arquivos por organização (`{organization_id}/...`).
const BUCKETS = ["logos", "quote-pdfs"];
const BATCH_SIZE = 20;

export default {
  fetch: withSupabase({ auth: "secret" }, withErrorReporting("purge-deleted-accounts", async (_req, ctx) => {
    const admin = ctx.supabaseAdmin;
    const { data: due, error } = await admin
      .from("account_deletion_requests")
      .select("user_id")
      .lte("scheduled_for", new Date().toISOString())
      .limit(BATCH_SIZE);
    if (error) return Response.json({ message: "failed to list due deletions" }, { status: 500 });

    let deleted = 0;
    let failed = 0;
    for (const { user_id: userId } of due ?? []) {
      try {
        const { data: orgs, error: orgsError } = await admin
          .from("organizations")
          .select("id")
          .eq("owner_user_id", userId);
        if (orgsError) throw orgsError;

        for (const org of orgs ?? []) {
          for (const bucket of BUCKETS) await removePrefix(admin, bucket, org.id);
          const { error: deleteOrgError } = await admin.from("organizations").delete().eq("id", org.id);
          if (deleteOrgError) throw deleteOrgError;
        }

        const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
        if (deleteUserError) throw deleteUserError;
        deleted += 1;
      } catch (_error) {
        failed += 1;
      }
    }

    if (failed > 0) {
      return Response.json({ message: `failed to delete ${failed} account(s)`, deleted, failed }, { status: 500 });
    }
    return Response.json({ deleted, failed });
  })),
};
