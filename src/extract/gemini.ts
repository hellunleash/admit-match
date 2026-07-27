/**
 * Gemini adapter. REST rather than an SDK: one dependency fewer, and the request shape is stable.
 *
 * Two properties matter and both are deliberate:
 *  - PDFs go in as inline base64 with their own mime type. Statutes are German-language PDFs, so
 *    native multimodal ingestion preserves the § structure a citation depends on.
 *  - Thinking is OFF. On 2.5 Flash it is on by default, bills at the OUTPUT rate ($2.50/M, eight
 *    times input), and lives in `thoughtsTokenCount` — so it never shows up in `candidatesTokenCount`
 *    and is invisible unless you specifically read it. It was ~90% of the bill. Extraction is a
 *    reading task: find the sentence, copy the number, cite the line.
 */

import type { z } from "zod";
import {
  estimateCostUsd,
  withRepair,
  type Chunk,
  type Provider,
  type StructuredResult,
  type Usage,
} from "./provider.js";

const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

function toParts(chunks: Chunk[]): GeminiPart[] {
  return chunks.map((c) =>
    c.kind === "text"
      ? { text: c.text }
      : { inlineData: { mimeType: "application/pdf", data: Buffer.from(c.bytes).toString("base64") } }
  );
}

async function callOnce(
  model: string,
  parts: GeminiPart[],
  system: string
): Promise<{ text: string; usage: Usage }> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("GEMINI_API_KEY is not set — copy .env.example to .env and fill it in");

  const res = await fetch(`${ENDPOINT(model)}?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        /**
         * BOUNDED thinking, not zero and not unlimited.
         *
         * Three measured points on the same document (Würzburg, same prompt, cached inputs):
         *   - default/dynamic thinking: ~₹14, and 87–150s per extraction
         *   - budget 0:                 ~₹1.92, 19–49s — but it DROPPED the "≥25 ECTS mathematics
         *                               and theoretical computer science" requirement entirely
         *   - budget 2048:              ~₹4.42, and that requirement came back, statute-cited
         *
         * A missing requirement is not a cheaper answer, it's a wrong one — it would have told an
         * applicant they qualify when they don't. So thinking stays on with a ceiling: still ~3x
         * cheaper than the unbounded default, without silently losing thresholds on dense statutes.
         *
         * Simpler documents (Dresden, TU Berlin, Darmstadt) extracted identically at budget 0, so
         * the right long-term answer is per-document escalation driven by a golden set, not one
         * global number.
         */
        thinkingConfig: { thinkingBudget: Number(process.env["GEMINI_THINKING_BUDGET"] ?? 2048) },
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
  usage.costUsd = estimateCostUsd(model, usage);
  return { text, usage };
}

export function geminiProvider(model: string): Provider {
  return {
    id: model,
    nativePdf: true,
    async generate<T>(
      chunks: Chunk[],
      system: string,
      schema: z.ZodType<T, z.ZodTypeDef, unknown>
    ): Promise<StructuredResult<T>> {
      const base = toParts(chunks);
      return withRepair(schema, model, async (repair) => {
        const parts: GeminiPart[] = repair ? [{ text: repair }] : base;
        return callOnce(model, parts, system);
      });
    },
  };
}
