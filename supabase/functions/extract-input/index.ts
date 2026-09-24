import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { rejectIfPendingDeletion } from "../_shared/account.ts";
import { withErrorReporting } from "../_shared/sentry.ts";
import {
  AI_EXTRACTION_PROMPT_VERSION,
  AUDIO_TRANSCRIPTION_PROMPT,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_SECONDS,
  MAX_EXTRACTED_TEXT_LENGTH,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  NO_READABLE_TEXT_MARKER,
  buildImageExtractionPrompt,
  estimateCostCentsExact,
  estimateTranscriptionCostCents,
} from "../../../packages/shared/src/index.ts";

// Fase 4A - entrada por áudio e por imagem. Recebe o arquivo direto do app
// (multipart), repassa à OpenAI e devolve SÓ O TEXTO. Nada é gravado do nosso
// lado: nem a mídia nem o texto (o registro em `input_extractions` guarda só
// metadados). O texto volta pro app, o usuário revisa/edita e só então segue
// pro fluxo normal de interpretação.

const DAILY_LIMIT = Number(Deno.env.get("EXTRACTION_DAILY_LIMIT") ?? "60");
const OPENAI_TIMEOUT_MS = 90_000;
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

// A OpenAI escolhe o formato de áudio pela extensão do nome do arquivo.
const AUDIO_EXTENSION_BY_MIME: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "video/webm": "webm",
};

class ExtractionError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function audioExtension(file: File): string | undefined {
  return AUDIO_EXTENSION_BY_MIME[file.type.split(";")[0]!.trim()];
}

async function transcribeAudio(apiKey: string, file: File, extension: string, model: string) {
  const form = new FormData();
  form.append("file", file, `audio.${extension}`);
  form.append("model", model);
  form.append("languages", "pt");
  form.append("prompt", AUDIO_TRANSCRIPTION_PROMPT);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  });
  if (!response.ok) throw new ExtractionError(`openai_http_${response.status}`, 502, "extraction request failed");
  const payload = await response.json();
  return {
    text: typeof payload.text === "string" ? payload.text : "",
    seconds: typeof payload.usage?.seconds === "number" ? payload.usage.seconds : null,
  };
}

async function readImages(apiKey: string, files: File[], model: string) {
  const prompt = buildImageExtractionPrompt(files.length);
  const content: unknown[] = [{ type: "input_text", text: prompt.user }];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    content.push({
      type: "input_image",
      image_url: `data:${file.type};base64,${toBase64(bytes)}`,
      detail: "high",
    });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      // Sem guardar a resposta no lado da OpenAI (o padrão da API é guardar) -
      // a imagem pode ter dados de terceiros (print de conversa).
      store: false,
      max_output_tokens: 2000,
      input: [
        { role: "system", content: prompt.system },
        { role: "user", content },
      ],
    }),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  });
  if (!response.ok) throw new ExtractionError(`openai_http_${response.status}`, 502, "extraction request failed");
  const payload = await response.json();
  let text = "";
  for (const item of payload.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string") text += part.text;
    }
  }
  return { text, usage: payload.usage ?? null };
}

export default {
  fetch: withSupabase({ auth: "user" }, withErrorReporting("extract-input", async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ message: "method not allowed" }, { status: 405 });
    }
    const pendingDeletion = await rejectIfPendingDeletion(ctx.supabase);
    if (pendingDeletion) return pendingDeletion;

    const userId = ctx.userClaims?.id;
    if (!userId) return Response.json({ message: "unauthorized" }, { status: 401 });

    const form = await req.formData().catch(() => null);
    const kind = form?.get("kind");
    if (!form || (kind !== "audio" && kind !== "image")) {
      return Response.json({ message: "invalid request body" }, { status: 400 });
    }

    // Organização do usuário (RLS: cada um só enxerga a própria membership).
    const { data: membership } = await ctx.supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership) return Response.json({ message: "no organization" }, { status: 403 });
    const organizationId = membership.organization_id as string;

    // Valida os arquivos antes de gastar qualquer coisa (o app também valida,
    // mas o cliente não é confiável).
    const files = form.getAll("file").filter((entry): entry is File => entry instanceof File);
    let declaredSeconds: number | null = null;
    if (kind === "audio") {
      if (
        files.length !== 1 ||
        files[0]!.size === 0 ||
        files[0]!.size > MAX_AUDIO_BYTES ||
        !audioExtension(files[0]!)
      ) {
        return Response.json({ message: "invalid audio file" }, { status: 400 });
      }
      const durationMs = Number(form.get("duration_ms"));
      if (Number.isFinite(durationMs) && durationMs > 0) {
        declaredSeconds = Math.ceil(durationMs / 1000);
        if (declaredSeconds > MAX_AUDIO_SECONDS + 5) {
          return Response.json({ message: "audio too long", code: "too_long" }, { status: 400 });
        }
      }
    } else if (
      files.length < 1 ||
      files.length > MAX_IMAGES ||
      files.some((file) => file.size === 0 || file.size > MAX_IMAGE_BYTES || !IMAGE_MIME_TYPES.has(file.type))
    ) {
      return Response.json({ message: "invalid image files" }, { status: 400 });
    }

    // Limite de abuso por organização/dia: cada extração é uma chamada paga
    // disparada pelo usuário.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await ctx.supabaseAdmin
      .from("input_extractions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", since);
    if ((count ?? 0) >= DAILY_LIMIT) {
      return Response.json({ message: "daily limit reached", code: "daily_limit" }, { status: 429 });
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const imageModel = Deno.env.get("OPENAI_MODEL");
    const audioModel = Deno.env.get("OPENAI_TRANSCRIBE_MODEL") ?? "gpt-transcribe";
    if (!apiKey || (kind === "image" && !imageModel)) {
      return Response.json({ message: "AI provider not configured" }, { status: 500 });
    }

    const model = kind === "audio" ? audioModel : imageModel!;
    const inputBytes = files.reduce((sum, file) => sum + file.size, 0);
    const startedAt = Date.now();
    let text = "";
    let units: number | null = null;
    let cost: number | null = null;
    let failure: ExtractionError | null = null;

    try {
      if (kind === "audio") {
        const result = await transcribeAudio(apiKey, files[0]!, audioExtension(files[0]!)!, model);
        text = result.text;
        units = result.seconds ?? declaredSeconds;
        cost = units === null ? null : estimateTranscriptionCostCents(model, units);
      } else {
        const result = await readImages(apiKey, files, model);
        text = result.text;
        units = files.length;
        cost = estimateCostCentsExact(model, result.usage);
      }
      text = text.trim();
      if (text.length === 0 || text === NO_READABLE_TEXT_MARKER) {
        failure = new ExtractionError("no_text", 422, "no readable text");
      }
    } catch (error) {
      failure = error instanceof ExtractionError
        ? error
        : new ExtractionError("openai_unreachable", 502, "extraction request failed");
    }

    await ctx.supabaseAdmin.from("input_extractions").insert({
      organization_id: organizationId,
      user_id: userId,
      kind,
      model,
      prompt_version: AI_EXTRACTION_PROMPT_VERSION,
      units,
      input_bytes: inputBytes,
      estimated_cost_cents: cost,
      latency_ms: Date.now() - startedAt,
      status: failure ? "falhou" : "concluido",
      error: failure ? failure.code : null,
    });

    if (failure) {
      return Response.json({ message: failure.message, code: failure.code }, { status: failure.status });
    }

    const truncated = text.length > MAX_EXTRACTED_TEXT_LENGTH;
    return Response.json({
      text: truncated ? text.slice(0, MAX_EXTRACTED_TEXT_LENGTH) : text,
      kind,
      units,
      truncated,
    });
  })),
};
