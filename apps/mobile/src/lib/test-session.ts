import { supabase } from './supabase';

// Placeholder de autenticação só para a Fase 1 (ver .tasks/fase-1-prova-do-nucleo.md
// e docs/ROADMAP.md - Fase 2 entrega autenticação de verdade, RF-001).
// Usa o mesmo usuário de teste do supabase/seed.sql. Remover quando a Fase 2
// chegar - não é para produção.
const TEST_USER_EMAIL = 'test@orcaai.local';
const TEST_USER_PASSWORD = 'orcaai-local-test';

export async function ensureTestSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return session;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });
  if (error) throw error;
  return data.session;
}

export async function getTestOrganizationId(): Promise<string> {
  const session = await ensureTestSession();
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', session.user.id)
    .limit(1)
    .single();

  if (error || !data) {
    throw error ?? new Error('Nenhuma organização encontrada para o usuário de teste.');
  }
  return data.organization_id as string;
}
