import { supabase } from './supabase';

// Fase 3 - planos (.tasks/fase-3-planos.md). O app só lê os direitos da
// PRÓPRIA organização (`my_entitlements`); quem barra de verdade é o servidor
// (limite de emissão no `issue-quote`, áudio/imagem no `extract-input`). O
// rodapé e o logo do PDF são decididos aqui porque o PDF é montado no
// aparelho.

export type Entitlements = {
  plan_code: 'gratuito' | 'profissional';
  plan_name: string;
  expires_at: string | null;
  expired_plan_code: string | null;
  expired_at: string | null;
  monthly_issued_quotes: number | null;
  issued_this_month: number;
  pdf_branding: boolean;
  company_logo_in_pdf: boolean;
  audio_image_input: boolean;
};

// Na dúvida (sem rede, erro), o app não esconde nada que o usuário já tinha:
// o servidor continua aplicando o plano de verdade na emissão e na IA.
export const PERMISSIVE_ENTITLEMENTS: Entitlements = {
  plan_code: 'profissional',
  plan_name: 'Profissional',
  expires_at: null,
  expired_plan_code: null,
  expired_at: null,
  monthly_issued_quotes: null,
  issued_this_month: 0,
  pdf_branding: false,
  company_logo_in_pdf: true,
  audio_image_input: true,
};

export async function getMyEntitlements(): Promise<Entitlements> {
  const { data, error } = await supabase.rpc('my_entitlements');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new Error('Plano não encontrado.');
  return row as Entitlements;
}

// Cobrança manual nesta etapa: quem quer assinar fala com a equipe. (O
// contato ainda não foi definido - ver "Pré-requisitos" na task.)
export const UPGRADE_HINT = 'Para assinar o Profissional, fale com a equipe do OrçaAI.';

export const PLAN_LIMIT_MESSAGE =
  'Você já emitiu todos os orçamentos do plano Gratuito neste mês. ' +
  'Os rascunhos continuam salvos; no Profissional não há limite. ' +
  UPGRADE_HINT;

export const PLAN_FEATURE_MESSAGE =
  'Falar ou enviar imagem em vez de digitar é um recurso do plano Profissional. ' + UPGRADE_HINT;

export function formatPlanDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}
