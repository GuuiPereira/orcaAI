import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { z } from "zod";
import { withErrorReporting } from "../_shared/sentry.ts";

// Task 7 da Fase 2 (RF-007). Pedir ou cancelar a exclusão da PRÓPRIA conta.
// Não apaga nada: só marca o pedido com um prazo (7 dias); a exclusão de
// verdade é da `purge-deleted-accounts`, agendada. O usuário só pode agir
// sobre si mesmo - o id vem do JWT, nunca do corpo da requisição.
const GRACE_PERIOD_DAYS = 7;

const requestSchema = z.object({ action: z.enum(["request", "cancel"]) });

export default {
  fetch: withSupabase({ auth: "user" }, withErrorReporting("delete-account", async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ message: "method not allowed" }, { status: 405 });
    }
    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ message: "invalid request body" }, { status: 400 });
    }
    const userId = ctx.userClaims?.id;
    if (!userId) {
      return Response.json({ message: "unauthorized" }, { status: 401 });
    }

    if (parsed.data.action === "cancel") {
      const { error } = await ctx.supabaseAdmin.from("account_deletion_requests").delete().eq("user_id", userId);
      if (error) return Response.json({ message: "failed to cancel deletion" }, { status: 500 });
      return Response.json({ scheduled_for: null });
    }

    // Idempotente: pedir de novo mantém o prazo original em vez de
    // reiniciar a contagem.
    const { data: existing } = await ctx.supabaseAdmin
      .from("account_deletion_requests")
      .select("scheduled_for")
      .eq("user_id", userId)
      .maybeSingle();
    // O banco devolve `+00:00`; normaliza pro mesmo formato do 1º pedido.
    if (existing) return Response.json({ scheduled_for: new Date(existing.scheduled_for).toISOString() });

    const scheduledFor = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await ctx.supabaseAdmin
      .from("account_deletion_requests")
      .insert({ user_id: userId, scheduled_for: scheduledFor });
    if (error) return Response.json({ message: "failed to schedule deletion" }, { status: 500 });
    return Response.json({ scheduled_for: scheduledFor });
  })),
};
