import { supabase } from './supabase';

// Fase 6 (painel admin, .tasks/fase-6-panel-admin.md). Tudo passa por funções
// `security definer` no banco que conferem se quem chama é admin da
// plataforma - esconder a tela é só conforto, a barreira é o banco. Nada
// aqui carrega conteúdo de orçamento (texto, itens, nomes, telefones): só
// contagens, custos, estados, códigos de erro e tipos de evento.

export type AdminOrganization = {
  organization_id: string;
  short_id: string;
  trade_name: string;
  created_at: string;
  members: number;
  quotes_total: number;
  quotes_issued: number;
  interpretations_30d: number;
  extractions_30d: number;
  // centavos de dólar, estimados
  cost_cents_30d: number;
  last_activity_at: string;
  owner_pending_deletion: boolean;
  suspended_at: string | null;
  stuck_interpretations: number;
  daily_interpretations_limit: number;
  daily_extractions_limit: number;
  limits_overridden: boolean;
  interpretations_24h: number;
  extractions_24h: number;
  // Fase 3 - planos
  plan_code: 'gratuito' | 'profissional';
  plan_name: string;
  plan_expires_at: string | null;
  expired_plan_code: string | null;
  expired_at: string | null;
  monthly_issued_quotes: number | null;
  issued_this_month: number;
};

export type PlanCode = 'gratuito' | 'profissional';

export const PLAN_LABELS: Record<PlanCode, string> = { gratuito: 'Gratuito', profissional: 'Profissional' };

export type AdminOrganizationDetail = {
  organization: AdminOrganization;
  members: { user_short_id: string; role: string; status: string; joined_at: string }[];
  daily: {
    day: string;
    interpretations: number;
    extractions: number;
    quotes_created: number;
    quotes_issued: number;
    cost_cents: number;
  }[];
  recent_errors: { at: string; source: string; code: string | null }[];
  timeline: { at: string; event: string; quote_number: string | null }[];
  admin_actions: { at: string; action: string; reason: string; details: Record<string, unknown> }[];
};

// Espelho dos padrões do sistema definidos no banco (organization_ai_quota,
// migração 20261016034159) - se mudar lá, mudar aqui. Só servem pra rotular
// o campo vazio ("padrão 100"); quem decide o limite é sempre o banco.
export const DEFAULT_DAILY_INTERPRETATIONS = 100;
export const DEFAULT_DAILY_EXTRACTIONS = 60;

export const ADMIN_ACTION_LABELS: Record<string, string> = {
  set_limits: 'Limite alterado',
  suspend: 'Suspensa',
  reactivate: 'Reativada',
  unstick_interpretation: 'Interpretação destravada',
  set_plan: 'Plano alterado',
  set_signup_plan: 'Plano de cadastro alterado',
  set_support_contact: 'Contato de suporte alterado',
};

// Os erros das funções do painel vêm com status próprio (PTxxx no banco).
function adminErrorMessage(error: { code?: string; message?: string } | null): string {
  switch (error?.code) {
    case '42501':
      return 'Acesso restrito a administradores.';
    case 'PT400':
      if (error.message?.startsWith('reason')) return 'Escreva um motivo (de 3 a 500 caracteres).';
      if (error.message?.startsWith('expires_at')) return 'A validade precisa ser uma data futura.';
      if (error.message?.startsWith('unknown plan')) return 'Plano desconhecido.';
      if (error.message?.startsWith('invalid whatsapp'))
        return 'WhatsApp inválido: use só números, com DDI e DDD (ex.: 5511999998888).';
      if (error.message?.startsWith('invalid email')) return 'E-mail inválido.';
      return 'Os limites precisam ser números maiores que zero (ou vazio para usar o padrão).';
    case 'PT404':
      return 'Organização não encontrada.';
    case 'PT409':
      if (error.message?.includes('already suspended')) return 'Essa organização já está suspensa.';
      if (error.message?.includes('not suspended')) return 'Essa organização não está suspensa.';
      if (error.message?.includes('no stuck')) return 'Não há interpretação presa nessa organização.';
      return 'Nada a fazer.';
    default:
      return 'Não foi possível concluir. Verifique a conexão e tente de novo.';
  }
}

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(adminErrorMessage(error));
  return data as T;
}

export async function isPlatformAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_platform_admin');
  return !error && data === true;
}

export function listAdminOrganizations(): Promise<AdminOrganization[]> {
  return call<AdminOrganization[]>('admin_list_organizations');
}

export function getAdminOrganizationDetail(organizationId: string): Promise<AdminOrganizationDetail> {
  return call<AdminOrganizationDetail>('admin_organization_detail', { target_organization_id: organizationId });
}

// null = volta ao padrão do sistema naquele item.
export function setOrganizationLimits(
  organizationId: string,
  limits: { dailyInterpretations: number | null; dailyExtractions: number | null },
  reason: string,
): Promise<void> {
  return call('admin_set_limits', {
    target_organization_id: organizationId,
    daily_interpretations: limits.dailyInterpretations,
    daily_extractions: limits.dailyExtractions,
    reason,
  });
}

export function suspendOrganization(organizationId: string, reason: string): Promise<void> {
  return call('admin_suspend_organization', { target_organization_id: organizationId, reason });
}

export function reactivateOrganization(organizationId: string, reason: string): Promise<void> {
  return call('admin_reactivate_organization', { target_organization_id: organizationId, reason });
}

export function unstickInterpretations(organizationId: string, reason: string): Promise<number> {
  return call<number>('admin_unstick_interpretations', { target_organization_id: organizationId, reason });
}

// Fase 3 - planos (cobrança manual): o admin define o plano da organização.
// `expiresAt` null = sem vencimento. Gratuito apaga a assinatura.
export function setOrganizationPlan(
  organizationId: string,
  plan: PlanCode,
  expiresAt: string | null,
  reason: string,
): Promise<void> {
  return call('admin_set_plan', {
    target_organization_id: organizationId,
    plan_code: plan,
    expires_at: plan === 'gratuito' ? null : expiresAt,
    reason,
  });
}

// Plano de quem se cadastrar daqui pra frente (Profissional durante o teste
// fechado, Gratuito depois). Não mexe em quem já existe.
export async function getSignupPlan(): Promise<{ plan: PlanCode; expiresAt: string | null }> {
  const rows = await call<{ signup_plan_code: PlanCode; signup_plan_expires_at: string | null }[]>('admin_get_signup_plan');
  return { plan: rows[0].signup_plan_code, expiresAt: rows[0].signup_plan_expires_at };
}

export function setSignupPlan(plan: PlanCode, expiresAt: string | null, reason: string): Promise<void> {
  return call('admin_set_signup_plan', { plan_code: plan, expires_at: plan === 'gratuito' ? null : expiresAt, reason });
}

// Contato de suporte (seção Ajuda do app, conta suspensa, avisos de plano).
// Vazio = sem aquele canal. O WhatsApp vai só com dígitos (DDI + DDD).
export function setSupportContact(whatsapp: string, email: string, reason: string): Promise<void> {
  return call('admin_set_support_contact', { whatsapp: whatsapp.replace(/\D/g, ''), email: email.trim(), reason });
}

// "Validade em dias" do formulário -> data ISO (fim do dia N, no aparelho).
export function expiresAtFromDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(23, 59, 59, 0);
  return date.toISOString();
}

export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function formatUsdFromCents(cents: number): string {
  return `US$ ${(Number(cents) / 100).toFixed(4)}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
