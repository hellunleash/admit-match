/**
 * Model registry. One place that maps a model id to its adapter, so `--model gpt-5-nano` is the
 * whole cost of running an A/B.
 */

import { geminiProvider } from "./gemini.js";
import { openAiProvider } from "./openai.js";
import type { Provider } from "./provider.js";

export const DEFAULT_MODEL = "gemini-2.5-flash";

/** Candidates for the extraction A/B, cheapest first. Prices per M tokens, in/out. */
export const AB_MODELS = [
  "gpt-5-nano", // $0.05 / $0.40
  "gpt-5-mini", // $0.13 / $1.00
  "gemini-2.5-flash-lite", // $0.10 / $0.40
  "gemini-2.5-flash", // $0.30 / $2.50 — the incumbent
] as const;

export function providerFor(model: string): Provider {
  if (model.startsWith("gemini")) return geminiProvider(model);
  if (model.startsWith("gpt-") || model.startsWith("o")) return openAiProvider(model);
  throw new Error(`no adapter for model "${model}" — add one in src/extract/registry.ts`);
}
