// Fase 3 - planos (.tasks/fase-3-planos.md): o que o plano efetivo da
// organização libera (organization_entitlements no banco - plano vencido já
// volta como Gratuito). Consultado com a service role.

export type OrganizationEntitlements = {
  plan_code: string;
  plan_name: string;
  expires_at: string | null;
  monthly_issued_quotes: number | null;
  issued_this_month: number;
  pdf_branding: boolean;
  company_logo_in_pdf: boolean;
  audio_image_input: boolean;
};

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

export async function getOrganizationEntitlements(
  supabaseAdmin: RpcClient,
  organizationId: string,
): Promise<OrganizationEntitlements | null> {
  const { data, error } = await supabaseAdmin.rpc("organization_entitlements", {
    target_organization_id: organizationId,
  });
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return data[0] as OrganizationEntitlements;
}

// Gratuito chegou ao limite de orçamentos emitidos no mês.
export function planLimitResponse(): Response {
  return Response.json({ message: "monthly plan limit reached", code: "plan_limit" }, { status: 403 });
}

// Recurso que o plano não inclui (ex.: áudio/imagem no Gratuito).
export function planFeatureResponse(): Response {
  return Response.json({ message: "feature not included in the plan", code: "plan_feature" }, { status: 403 });
}

export function entitlementsUnavailableResponse(): Response {
  return Response.json({ message: "failed to check organization plan" }, { status: 500 });
}
