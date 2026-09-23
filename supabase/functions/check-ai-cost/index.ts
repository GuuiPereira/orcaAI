import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import * as Sentry from "@sentry/deno";
import { withErrorReporting } from "../_shared/sentry.ts";

// Task 8 - alerta de custo. Pensada pra ser chamada por um agendador
// (pg_cron/cron do Supabase) com a chave secret: compara o custo de IA do
// dia com AI_DAILY_COST_LIMIT_CENTS (centavos de dólar) e, se passou, manda
// um evento pro Sentry - a regra de alerta de lá avisa por e-mail. Só
// números saem daqui (dia, custo, limite), nunca conteúdo de orçamento.

export default {
  fetch: withSupabase({ auth: "secret" }, withErrorReporting("check-ai-cost", async (_req, ctx) => {
    const limit = Number(Deno.env.get("AI_DAILY_COST_LIMIT_CENTS"));
    if (!Number.isFinite(limit) || limit <= 0) {
      return Response.json({ checked: false, reason: "AI_DAILY_COST_LIMIT_CENTS not configured" });
    }

    const day = new Date().toISOString().slice(0, 10);
    const { data, error } = await ctx.supabaseAdmin
      .from("metrics_ai_daily")
      .select("cost_cents, failed, interpretations")
      .eq("day", day);
    if (error) {
      return Response.json({ message: "failed to read metrics" }, { status: 500 });
    }

    const costCents = (data ?? []).reduce((sum, row) => sum + Number(row.cost_cents), 0);
    const over = costCents > limit;

    if (over && Deno.env.get("SENTRY_DSN")) {
      Sentry.withScope((scope) => {
        scope.setTag("alert", "ai-cost");
        scope.setTag("day", day);
        scope.setTag("cost_cents", String(costCents));
        scope.setTag("limit_cents", String(limit));
        Sentry.captureMessage(`AI daily cost over limit: ${costCents} > ${limit} (USD cents)`, "warning");
      });
      await Sentry.flush(2000);
    }

    return Response.json({ checked: true, day, cost_cents: costCents, limit_cents: limit, over });
  })),
};
