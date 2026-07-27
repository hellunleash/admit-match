/**
 * Provider-neutral model interface.
 *
 * Extraction shouldn't know which vendor it's talking to. Everything above this file deals in
 * `Chunk`s — text or a PDF's bytes — and each adapter turns those into whatever payload its API
 * wants. Swapping models for an A/B then costs a flag, not a refactor.
 */

import type { z } from "zod";

export type Chunk = { kind: "text"; text: string } | { kind: "pdf"; bytes: Uint8Array };

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  /** Billed at the OUTPUT rate on every provider that has it. Invisible unless explicitly read. */
  thinkingTokens: number;
  cachedTokens: number;
  totalTokens: number;
  costUsd: number;
};

export const emptyUsage = (): Usage => ({
  inputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  cachedTokens: 0,
  totalTokens: 0,
  costUsd: 0,
});

export type StructuredResult<T> =
  | { ok: true; value: T; usage: Usage; attempts: number }
  | { ok: false; error: string; usage: Usage; attempts: number };

export type Provider = {
  id: string;
  /** True when the model ingests PDF bytes directly rather than needing pre-extracted text. */
  nativePdf: boolean;
  generate<T>(
    chunks: Chunk[],
    system: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>
  ): Promise<StructuredResult<T>>;
};

/**
 * USD per million tokens. Data, not truth — prices move, and this exists so a run can print what it
 * just spent. The billing console remains the authority.
 */
export const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gpt-5-mini": { input: 0.13, output: 1.0 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
};

export function estimateCostUsd(model: string, u: Omit<Usage, "costUsd">): number {
  const p = PRICES[model] ?? { input: 0.3, output: 2.5 };
  return (u.inputTokens * p.input) / 1e6 + ((u.outputTokens + u.thinkingTokens) * p.output) / 1e6;
}

export function accumulate(into: Usage, add: Usage): void {
  into.inputTokens += add.inputTokens;
  into.outputTokens += add.outputTokens;
  into.thinkingTokens += add.thinkingTokens;
  into.cachedTokens += add.cachedTokens;
  into.totalTokens += add.totalTokens;
  into.costUsd += add.costUsd;
}

/** Models write `"section": null` where the instruction was to omit the key. Both mean absent, but
 *  zod calls null a type error — and at document granularity one stray null discards everything. */
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

export function stripFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
}

/**
 * Shared validate-then-repair loop.
 *
 * The retry is a REPAIR, not a re-run: it sends the previous JSON plus the validation errors —
 * a couple of thousand tokens — rather than resending a 700 KB PDF the model has already read.
 */
export async function withRepair<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  model: string,
  call: (repairPrompt: string | null) => Promise<{ text: string; usage: Usage }>
): Promise<StructuredResult<T>> {
  const carried = emptyUsage();
  let lastError = "";
  let lastText = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const repair =
        attempt === 1 || !lastText
          ? null
          : `Your previous JSON response failed validation.\n\nERRORS:\n${lastError}\n\n` +
            `PREVIOUS RESPONSE:\n${lastText}\n\nReturn the corrected JSON only. Fix ONLY what the ` +
            `errors name — do not drop or alter any other field, and do not invent values.`;

      const { text, usage } = await call(repair);
      accumulate(carried, usage);
      lastText = text;

      const parsed = schema.safeParse(stripNulls(JSON.parse(stripFence(text))));
      if (parsed.success) return { ok: true, value: parsed.data, usage: carried, attempts: attempt };
      lastError = JSON.stringify(parsed.error.issues.slice(0, 12));
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // Missing credentials or a 4xx will not fix themselves on retry.
      if (/API_KEY|HTTP 4/.test(lastError)) {
        return { ok: false, error: lastError, usage: carried, attempts: attempt };
      }
    }
  }

  return { ok: false, error: `[${model}] ${lastError}`, usage: carried, attempts: 2 };
}
