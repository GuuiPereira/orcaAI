import * as Sentry from '@sentry/react-native';
import { sanitizeBreadcrumb, sanitizeEvent } from '@orcaai/shared';

// Task 8 (docs/ARCHITECTURE.md §11, RNF-008). O DSN vem do ambiente
// (EXPO_PUBLIC_SENTRY_DSN em apps/mobile/.env.local) - sem ele o SDK fica
// inerte, então o app roda igual em dev sem conta no Sentry.
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

let initialized = false;

export function initMonitoring() {
  if (initialized || !dsn) return;
  initialized = true;

  Sentry.init({
    dsn,
    // Nada de PII automática (IP, cookies, usuário), replay de sessão
    // (gravaria a tela com dados de cliente) nem tracing por enquanto - só
    // erros e crashes.
    sendDefaultPii: false,
    tracesSampleRate: 0,
    enableLogs: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    // Tudo que sai passa pelo filtro compartilhado (packages/shared/src/
    // monitoring/sanitize.ts) - testado à parte.
    beforeSend: (event) => sanitizeEvent(event as never) as typeof event,
    beforeBreadcrumb: (breadcrumb) => sanitizeBreadcrumb(breadcrumb as never) as typeof breadcrumb | null,
  });
}

// Só o ID técnico do usuário (uuid do auth) - o filtro descarta o resto.
export function setMonitoringUser(userId: string | null) {
  Sentry.setUser(userId ? { id: userId } : null);
}

// Falhas tratadas (PDF, emissão, interpretação...) que o usuário vê como
// alerta mas que a gente precisa enxergar. `area` vira tag pra filtrar no
// painel; a mensagem do erro passa pelo filtro antes de sair.
export function reportError(error: unknown, area: string, tags: Record<string, string> = {}) {
  Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { area, ...tags },
  });
}

export const wrapRootComponent = Sentry.wrap;
