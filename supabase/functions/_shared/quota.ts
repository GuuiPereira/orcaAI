// Fase 6 (painel admin): suspensão e limite de IA por organização. O banco
// (organization_ai_quota) devolve, numa chamada só, o limite efetivo (padrão
// do sistema ou o que o admin definiu), o uso nas últimas 24h e se a
// organização está suspensa. Consultado com a service role - o usuário não
// lê limites nem a função.

export type OrganizationQuota = {
  daily_interpretations: number;
  daily_extractions: number;
  limits_overridden: boolean;
  interpretations_24h: number;
  extractions_24h: number;
  suspended: boolean;
};

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

export async function getOrganizationQuota(
  supabaseAdmin: RpcClient,
  organizationId: string,
): Promise<OrganizationQuota | null> {
  const { data, error } = await supabaseAdmin.rpc("organization_ai_quota", {
    target_organization_id: organizationId,
  });
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return data[0] as OrganizationQuota;
}

// Suspensa: bloqueia IA e emissão, sem apagar nada - o app mostra um aviso.
export function organizationSuspendedResponse(): Response {
  return Response.json({ message: "organization suspended", code: "organization_suspended" }, { status: 403 });
}

export function dailyLimitResponse(): Response {
  return Response.json({ message: "daily limit reached", code: "daily_limit" }, { status: 429 });
}

export function quotaUnavailableResponse(): Response {
  return Response.json({ message: "failed to check organization quota" }, { status: 500 });
}
