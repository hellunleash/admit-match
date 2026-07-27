/**
 * Gemini call. REST rather than an SDK: one dependency fewer, and the request shape is stable.
 *
 * Two properties matter here and both are deliberate:
 *  - PDFs go in as inline base64 with their own mime type. Statutes are German-language PDFs, so
 *    native multimodal ingestion preserves the § structure a citation depends on.
 *  - Validation is zod-then-retry rather than a hand-written JSON responseSchema. The schema has
 *    nested unions and per-group scoping; hand-maintaining a parallel JSON Schema is a second
 *    source of truth waiting to drift. One retry carries the validation error back to the model.
 */

import type { z } from "zod";

const MODEL = process.env["GEMINI_MODEL"] ?? "gemini-2.5-flash";
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export type Usage = { inputTokens: number; outputTokens: number; totalTokens: number };

export type GeminiResult<T> =
  | { ok: true; value: T; usage: Usage; attempts: number }
  | { ok: false; error: string; attempts: number };

export function pdfPart(bytes: Uint8Array): Part {
  return { inlineData: { mimeType: "application/pdf", data: Buffer.from(bytes).toString("base64") } };
}

export function textPart(text: string): Part {
  return { text };
}

async function callOnce(
  parts: Part[],
  system: string
): Promise<{ text: string; usage: Usage }> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("GEMINI_API_KEY is not set — copy .env.example to .env and fill it in");

  const res = await fetch(`${ENDPOINT(MODEL)}?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  };

  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini returned no text (blocked or empty candidate)");

  return {
    text,
    usage: {
      inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: body.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}

/**
 * Call, parse, validate against `schema`. On failure, retry once with the error fed back.
 *
 * The input type is deliberately `unknown`: schemas here use `.default()`, so what the model sends
 * and what validation returns are different types. Pinning both to T would reject every schema with
 * a default in it.
 */
export async function generateStructured<T>(
  parts: Part[],
  system: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>
): Promise<GeminiResult<T>> {
  let lastError = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const retryNote =
        attempt === 1
          ? ""
          : `\n\nYour previous response failed validation:\n${lastError}\nReturn corrected JSON only.`;

      const { text, usage } = await callOnce(parts, system + retryNote);
      const parsed = schema.safeParse(JSON.parse(stripFence(text)));

      if (parsed.success) return { ok: true, value: parsed.data, usage, attempts: attempt };
      lastError = JSON.stringify(parsed.error.issues.slice(0, 12));
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // A missing key or an HTTP failure will not fix itself on retry.
      if (lastError.includes("GEMINI_API_KEY") || lastError.includes("HTTP 4")) {
        return { ok: false, error: lastError, attempts: attempt };
      }
    }
  }

  return { ok: false, error: lastError, attempts: 2 };
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
}
