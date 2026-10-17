import type { PrivacyPolicyValues } from '@orcaai/shared';

import { supabase } from './supabase';

// Dados do responsável que entram no texto da política (configurados no painel
// admin). Funciona sem login: a política abre na tela de entrada.
export async function getPrivacyPolicyValues(): Promise<PrivacyPolicyValues> {
  const { data, error } = await supabase.rpc('get_privacy_settings');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return {
    controllerName: row?.controller_name ?? null,
    controllerDocument: row?.controller_document ?? null,
    privacyEmail: row?.privacy_email ?? null,
    responseDays: row?.response_days ?? null,
  };
}

export const EMPTY_PRIVACY_VALUES: PrivacyPolicyValues = {
  controllerName: null,
  controllerDocument: null,
  privacyEmail: null,
  responseDays: null,
};
