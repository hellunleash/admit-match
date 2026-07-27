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

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  /** Billed at the OUTPUT rate. Invisible unless you ask for it — and it dominated our bill. */
  thinkingTokens: number;
  cachedTokens: number;
  totalTokens: number;
  costUsd: number;
};

/**
 * USD per million tokens, gemini-2.5-flash. Data, not truth: prices move, and this is a local
 * estimate for visibility, never a substitute for the billing console.
 */
const PRICE = { input: 0.3, output: 2.5 } as const;

export function estimateCostUsd(u: { inputTokens: number; outputTokens: number; thinkingTokens: number }): number {
  return (
    (u.inputTokens * PRICE.input) / 1e6 + ((u.outputTokens + u.thinkingTokens) * PRICE.output) / 1e6
  );
}

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
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        /**
         * Thinking OFF. On 2.5 Flash it is on by default and its tokens bill at the OUTPUT rate
         * ($2.50/M) — eight times the input rate — while never appearing in `candidatesTokenCount`,
         * so it is invisible unless you specifically ask for it. It was the bulk of our bill.
         *
         * Extraction is a reading task: find the sentence, copy the number, cite the line. There is
         * no reasoning step worth paying eight times over for. Revisit only if a golden set shows
         * accuracy actually drops without it.
         */
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
      cachedContentTokenCount?: number;
      totalTokenCount?: number;
    };
  };

  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini returned no text (blocked or empty candidate)");

  const m = body.usageMetadata ?? {};
  const usage: Usage = {
    inputTokens: m.promptTokenCount ?? 0,
    outputTokens: m.candidatesTokenCount ?? 0,
    thinkingTokens: m.thoughtsTokenCount ?? 0,
    cachedTokens: m.cachedContentTokenCount ?? 0,
    totalTokens: m.totalTokenCount ?? 0,
    costUsd: 0,
  };
  usage.costUsd = estimateCostUsd(usage);

  return { text, usage };
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
  /** Accumulated across attempts, so a repair retry's cost is visible rather than discarded. */
  const carried: Usage = {
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cachedTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  };

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
      carried.inputTokens += usage.inputTokens;
      carried.outputTokens += usage.outputTokens;
      carried.thinkingTokens += usage.thinkingTokens;
      carried.cachedTokens += usage.cachedTokens;
      carried.totalTokens += usage.totalTokens;
      carried.costUsd += usage.costUsd;
      const parsed = schema.safeParse(stripNulls(JSON.parse(stripFence(text))));

      if (parsed.success) return { ok: true, value: parsed.data, usage: carried, attempts: attempt };
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
