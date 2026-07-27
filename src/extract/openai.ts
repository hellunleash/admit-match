/**
 * OpenAI adapter (Responses API), for A/B-ing GPT-5 mini and nano against Gemini Flash.
 *
 * Both are cheaper per token than Flash — nano $0.05/$0.40, mini $0.13/$1.00 against Flash's
 * $0.30/$2.50 — but per-token price is only half the question. The other half is whether they read
 * a German statute PDF as accurately, which is what the A/B is for. A cheaper wrong answer costs
 * more than it saves.
 *
 * PDFs go in as base64 `input_file` parts. If a model rejects that, the run says so plainly rather
 * than silently degrading to a text-only extraction that would quietly lose the § structure.
 */

import type { z } from "zod";
import {
  accumulate,
  emptyUsage,
  estimateCostUsd,
  withRepair,
  type Chunk,
  type Provider,
  type StructuredResult,
  type Usage,
} from "./provider.js";

const ENDPOINT = "https://api.openai.com/v1/responses";

type ContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_file"; filename: string; file_data: string };

function toContent(chunks: Chunk[]): ContentPart[] {
  return chunks.map((c, i) =>
    c.kind === "text"
      ? ({ type: "input_text", text: c.text } as const)
      : ({
          type: "input_file",
          filename: `document-${i}.pdf`,
          file_data: `data:application/pdf;base64,${Buffer.from(c.bytes).toString("base64")}`,
        } as const)
  );
}

async function callOnce(
  model: string,
  content: ContentPart[],
  system: string
): Promise<{ text: string; usage: Usage }> {
  const key = process.env["OPENAI_API_KEY"];
  if (!key) throw new Error("OPENAI_API_KEY is not set — add it to .env to A/B the GPT-5 models");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      instructions: system,
      input: [{ role: "user", content }],
      // Extraction is a reading task. Reasoning tokens bill at the output rate on every provider
      // that has them, and this is the setting that made Gemini 12x cheaper.
      reasoning: { effort: "minimal" },
      text: { format: { type: "json_object" } },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }

  const body = (await res.json()) as {
    output_text?: string;
    output?: { content?: { text?: string }[] }[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
      output_tokens_details?: { reasoning_tokens?: number };
    };
  };

  const text =
    body.output_text ??
    body.output?.flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("") ??
    "";
  if (!text) throw new Error("OpenAI returned no text");

  const u = body.usage ?? {};
  const usage: Usage = {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    thinkingTokens: u.output_tokens_details?.reasoning_tokens ?? 0,
    cachedTokens: u.input_tokens_details?.cached_tokens ?? 0,
    totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
    costUsd: 0,
  };
  // reasoning_tokens are a subset of output_tokens here — don't double-count them.
  usage.costUsd = estimateCostUsd(model, { ...usage, thinkingTokens: 0 });
  return { text, usage };
}

export function openAiProvider(model: string): Provider {
  return {
    id: model,
    nativePdf: true,
    async generate<T>(
      chunks: Chunk[],
      system: string,
      schema: z.ZodType<T, z.ZodTypeDef, unknown>
    ): Promise<StructuredResult<T>> {
      const base = toContent(chunks);
      return withRepair(schema, model, async (repair) => {
        const content: ContentPart[] = repair ? [{ type: "input_text", text: repair }] : base;
        return callOnce(model, content, system);
      });
    },
  };
}

/** Exported for the compare CLI's summary line. */
export function sumUsage(list: Usage[]): Usage {
  const total = emptyUsage();
  for (const u of list) accumulate(total, u);
  return total;
}
