// RNF-008 / docs/ARCHITECTURE.md §11: o Sentry só recebe IDs técnicos e
// contexto sanitizado - nunca texto original, nomes, telefones, endereços,
// documentos ou conteúdo de itens. O SDK coleta bastante coisa por padrão
// (URLs com query string, corpo de requisições, mensagens de console...), e
// as URLs do Supabase carregam termos de busca de cliente
// (ex.: `customers?name=ilike.*Maria*`), então tudo isso passa por aqui
// antes de sair do aparelho/função.
//
// Tipos estruturais mínimos de propósito: o mesmo código roda no app
// (@sentry/react-native) e nas Edge Functions (@sentry/deno), e nenhum dos
// dois pacotes deve virar dependência do packages/shared.

type Json = Record<string, unknown>;

export type SanitizableBreadcrumb = {
  category?: string;
  type?: string;
  message?: string;
  data?: Json;
  [key: string]: unknown;
};

export type SanitizableEvent = {
  message?: string;
  request?: Json;
  user?: { id?: string | number; [key: string]: unknown };
  extra?: Json;
  contexts?: Json;
  breadcrumbs?: SanitizableBreadcrumb[];
  exception?: { values?: { value?: string; [key: string]: unknown }[] };
  [key: string]: unknown;
};

const MAX_MESSAGE_LENGTH = 200;

// Telefone (10+ dígitos com pontuação comum), e-mail e CPF/CNPJ formatados
// ou não. Erros de validação/banco às vezes ecoam o valor recebido.
const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
  /\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g,
];

export function scrubText(value: string): string {
  let result = value;
  for (const pattern of SENSITIVE_PATTERNS) result = result.replace(pattern, "[removido]");
  return result.length > MAX_MESSAGE_LENGTH ? `${result.slice(0, MAX_MESSAGE_LENGTH)}…` : result;
}

// Mantém origem e caminho, descarta query string e hash. IDs de recurso no
// caminho (uuid) são IDs técnicos e podem ficar.
export function stripUrlQuery(url: string): string {
  return url.split("#")[0]!.split("?")[0]!;
}

export function sanitizeBreadcrumb(breadcrumb: SanitizableBreadcrumb): SanitizableBreadcrumb | null {
  // Console.* costuma imprimir o que o dev colocou lá, incluindo dados de tela.
  if (breadcrumb.category === "console") return null;

  const sanitized: SanitizableBreadcrumb = { ...breadcrumb };
  if (typeof sanitized.message === "string") sanitized.message = scrubText(sanitized.message);

  if (sanitized.data) {
    const data: Json = {};
    for (const [key, value] of Object.entries(sanitized.data)) {
      if (key === "url" && typeof value === "string") data[key] = stripUrlQuery(value);
      else if (key === "status_code" || key === "method" || key === "reason") data[key] = value;
      // demais campos (body, params, from/to com query...) são descartados.
    }
    sanitized.data = data;
  }
  return sanitized;
}

export function sanitizeEvent<T extends SanitizableEvent>(event: T): T {
  const sanitized: SanitizableEvent = { ...event };

  if (typeof sanitized.message === "string") sanitized.message = scrubText(sanitized.message);

  // Corpo/cabeçalhos/cookies/query da requisição nunca saem - só método e
  // caminho.
  if (sanitized.request) {
    const url = typeof sanitized.request.url === "string" ? stripUrlQuery(sanitized.request.url) : undefined;
    sanitized.request = { ...(url ? { url } : {}), method: sanitized.request.method };
  }

  // Só o ID técnico do usuário (uuid do auth) - nada de e-mail, nome, IP.
  if (sanitized.user) sanitized.user = sanitized.user.id !== undefined ? { id: sanitized.user.id } : undefined;

  // `extra` e `contexts` são de uso livre pelo código: só passam tags/IDs
  // que a gente colocar explicitamente via `tags`, então descartar aqui é
  // o padrão seguro.
  delete sanitized.extra;

  if (sanitized.exception?.values) {
    sanitized.exception = {
      ...sanitized.exception,
      values: sanitized.exception.values.map((v) => ({
        ...v,
        value: typeof v.value === "string" ? scrubText(v.value) : v.value,
      })),
    };
  }

  if (sanitized.breadcrumbs) {
    sanitized.breadcrumbs = sanitized.breadcrumbs
      .map(sanitizeBreadcrumb)
      .filter((b): b is SanitizableBreadcrumb => b !== null);
  }

  return sanitized as T;
}
