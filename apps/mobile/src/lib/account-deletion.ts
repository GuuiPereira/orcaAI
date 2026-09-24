import { supabase } from './supabase';

// Task 7 (RF-007): exclusão de conta com prazo de 7 dias. O pedido em si é
// gravado pela Edge Function `delete-account` (só ela escreve); o app só lê
// o próprio pedido (RLS) pra saber se a conta está agendada.
export async function getAccountDeletion(): Promise<{ scheduledFor: string } | null> {
  const { data, error } = await supabase
    .from('account_deletion_requests')
    .select('scheduled_for')
    .maybeSingle();
  if (error) throw error;
  return data ? { scheduledFor: data.scheduled_for as string } : null;
}

async function callDeleteAccount(action: 'request' | 'cancel'): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: { action } });
  if (error) {
    throw new Error(
      action === 'request' ? 'Não foi possível agendar a exclusão da conta.' : 'Não foi possível cancelar a exclusão.',
    );
  }
  return (data as { scheduled_for: string | null }).scheduled_for;
}

export async function requestAccountDeletion(): Promise<string> {
  return (await callDeleteAccount('request')) as string;
}

export async function cancelAccountDeletion(): Promise<void> {
  await callDeleteAccount('cancel');
}
