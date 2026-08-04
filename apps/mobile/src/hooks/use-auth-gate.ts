import { useEffect, useState } from 'react';

import { getCurrentOrganizationId } from '@/lib/organizations';
import { useSession } from './use-session';

export type AuthGateStatus = 'loading' | 'unauthenticated' | 'no-organization' | 'ready';

// Centraliza as duas condições que decidem pra onde o app navega no boot:
// sessão real do Supabase Auth (Task 1) e organização vinculada ao usuário
// (Task 2, ainda não construída - por isso "no-organization" é um estado
// legítimo, não um erro).
type OrganizationCheck = { userId: string; hasOrganization: boolean };

export function useAuthGate(): AuthGateStatus {
  const { session, loading: sessionLoading } = useSession();
  const [orgCheck, setOrgCheck] = useState<OrganizationCheck | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    getCurrentOrganizationId()
      .then((organizationId) => {
        if (!cancelled) setOrgCheck({ userId: session.user.id, hasOrganization: organizationId !== null });
      })
      .catch(() => {
        if (!cancelled) setOrgCheck({ userId: session.user.id, hasOrganization: false });
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (sessionLoading) return 'loading';
  if (!session) return 'unauthenticated';
  // Sessão trocou (ex.: logout + login com outra conta) e o resultado do
  // fetch anterior ainda não foi substituído - trata como loading em vez de
  // mostrar o estado da conta antiga por um instante.
  if (!orgCheck || orgCheck.userId !== session.user.id) return 'loading';
  return orgCheck.hasOrganization ? 'ready' : 'no-organization';
}
