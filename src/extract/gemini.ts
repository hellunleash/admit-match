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
  let lastText = "";
  let carriedTokens = 0;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      /**
       * REPAIR retry, not a re-run. The second attempt sends the previous JSON plus the validation
       * errors — a couple of thousand tokens — instead of resending 700 KB of PDF. Re-running the
       * whole extraction was silently doubling the cost of every failed program, and the model
       * doesn't need to re-read the statute to fix a type error in its own output.
       */
      const isRepair = attempt > 1 && lastText.length > 0;
      const callParts: Part[] = isRepair
        ? [
            {
              text:
                `Your previous JSON response failed validation.\n\nERRORS:\n${lastError}\n\n` +
                `PREVIOUS RESPONSE:\n${lastText}\n\n` +
                `Return the corrected JSON only. Fix ONLY what the errors name — do not drop or ` +
                `alter any other field, and do not invent values you did not previously have.`,
            },
          ]
        : parts;

      const { text, usage } = await callOnce(callParts, system);
      lastText = text;
      carriedTokens += usage.totalTokens;
      const parsed = schema.safeParse(stripNulls(JSON.parse(stripFence(text))));

      if (parsed.success) {
        return {
          ok: true,
          value: parsed.data,
          usage: { ...usage, totalTokens: carriedTokens },
          attempts: attempt,
        };
      }
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

/**
 * Drop null-valued keys recursively before validation.
 *
 * Models write `"section": null` where the instruction was to omit the field. Semantically these
 * are identical — both mean "not present" — but zod treats null as a type error and, at document
 * granularity, one stray null discards an entire extraction. Six of TU Berlin's fields failed for
 * exactly this reason while carrying perfectly good values.
 */
export function stripNulls(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(stripNulls);
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (v === null) continue;
      out[k] = stripNulls(v);
    }
    return out;
  }
  return input;
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
}
