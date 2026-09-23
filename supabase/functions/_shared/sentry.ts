import * as Sentry from "@sentry/deno";
import { sanitizeBreadcrumb, sanitizeEvent } from "../../../packages/shared/src/index.ts";

// Task 8 (docs/ARCHITECTURE.md §11, RNF-008). O DSN vem de SENTRY_DSN
// (supabase/functions/.env local; secret do projeto no Supabase hospedado) -
// sem ele nada é enviado, então as functions rodam igual sem conta no Sentry.
const dsn = Deno.env.get("SENTRY_DSN");

if (dsn) {
  Sentry.init({
    dsn,
    // Só erros: sem PII automática, sem tracing. O corpo das requisições
    // (texto do orçamento, itens, cliente) nunca é anexado - e tudo que sai
    // ainda passa pelo filtro compartilhado, testado em packages/shared.
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: (event) => sanitizeEvent(event as never) as typeof event,
    beforeBreadcrumb: (breadcrumb) => sanitizeBreadcrumb(breadcrumb as never) as typeof breadcrumb | null,
  });
}

type HandlerContext = { userClaims?: { id?: string } | null };

async function report(
  functionName: string,
  userId: string | undefined,
  capture: () => void,
  tags: Record<string, string>,
) {
  if (!dsn) return;
  Sentry.withScope((scope) => {
    scope.setTag("function", functionName);
    for (const [key, value] of Object.entries(tags)) scope.setTag(key, value);
    if (userId) scope.setUser({ id: userId });
    capture();
  });
  // A function pode ser encerrada logo depois da resposta - sem flush o
  // evento se perde.
  await Sentry.flush(2000);
}

// Envolve o handler de uma function: exceções não tratadas viram um evento
// (e uma resposta 500), e respostas 5xx que o próprio handler devolve
// (ex.: "failed to save quote version", 502 da IA) também são reportadas -
// com a mensagem fixa da resposta, nunca dados da requisição.
export function withErrorReporting<Ctx extends HandlerContext>(
  functionName: string,
  handler: (req: Request, ctx: Ctx) => Promise<Response>,
): (req: Request, ctx: Ctx) => Promise<Response> {
  return async (req, ctx) => {
    const userId = ctx.userClaims?.id;
    let response: Response;
    try {
      response = await handler(req, ctx);
    } catch (error) {
      await report(functionName, userId, () => Sentry.captureException(error), { kind: "unhandled" });
      return Response.json({ message: "internal error" }, { status: 500 });
    }

    if (response.status >= 500) {
      const body = await response.clone().json().catch(() => null);
      const message = typeof body?.message === "string" ? body.message : "unknown error";
      await report(
        functionName,
        userId,
        () => Sentry.captureMessage(`${functionName}: ${message}`, "error"),
        { kind: "handled", status: String(response.status) },
      );
    }
    return response;
  };
}
