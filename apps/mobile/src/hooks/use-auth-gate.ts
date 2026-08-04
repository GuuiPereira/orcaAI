import { useEffect, useState } from 'react';

import { getCurrentOrganizationId } from '@/lib/organizations';
import { useSession } from './use-session';

export type AuthGateStatus = 'loading' | 'unauthenticated' | 'no-organization' | 'ready';

// Centraliza as duas condições que decidem pra onde o app navega no boot:
// sessão real do Supabase Auth (Task 1) e organização vinculada ao usuário
// (Task 2, ainda não construída - por isso "no-organization" é um estado
// legítimo, não um erro).
type OrganizationCheck = { userId: string; hasOrganization: boolean };

// Criar uma organização (onboarding) não muda a sessão, só o resultado da
// checagem de organização - por isso o efeito abaixo (que só depende de
// `session`) não reagiria sozinho. onboarding.tsx chama isso depois de
// criar a organização com sucesso, pra forçar o gate a checar de novo.
const listeners = new Set<() => void>();
export function notifyOrganizationChanged() {
  listeners.forEach((listener) => listener());
}

export function useAuthGate(): AuthGateStatus {
  const { session, loading: sessionLoading } = useSession();
  const [orgCheck, setOrgCheck] = useState<OrganizationCheck | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const listener = () => setRefreshTick((tick) => tick + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

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
  }, [session, refreshTick]);

  if (sessionLoading) return 'loading';
  if (!session) return 'unauthenticated';
  // Sessão trocou (ex.: logout + login com outra conta) e o resultado do
  // fetch anterior ainda não foi substituído - trata como loading em vez de
  // mostrar o estado da conta antiga por um instante.
  if (!orgCheck || orgCheck.userId !== session.user.id) return 'loading';
  return orgCheck.hasOrganization ? 'ready' : 'no-organization';
}
