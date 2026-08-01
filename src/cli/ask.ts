/**
 * Ask a free-text question about a seeded programme's documents.
 *
 *   npm run ask -- <programId> "your question"
 *
 * Extraction fills a fixed schema; this is for the questions the schema doesn't have a field for
 * ("what counts as course-related achievements?"). Same cached documents, same native-PDF path, so
 * it costs a call rather than a re-download — and it answers from the statute rather than from a
 * summary of it.
 */

import { SEEDS as CS_SEEDS, HARDWARE_SEEDS } from "../seeds.js";
import { fetchDocCached } from "../extract/cache.js";
import { providerFor, DEFAULT_MODEL } from "../extract/registry.js";
import type { Chunk } from "../extract/provider.js";
import { z } from "zod";

const SEEDS = [...HARDWARE_SEEDS, ...CS_SEEDS];

const Answer = z.object({
  answer: z.string(),
  /** Verbatim passages the answer rests on. Empty means the documents do not say. */
  quotes: z.array(z.object({ text: z.string(), where: z.string().optional() })).default([]),
  notFound: z.boolean().default(false),
});

const SYSTEM = `Answer the question strictly from the supplied documents.

Quote verbatim wherever the document states something. If the documents do not answer the question,
set notFound=true and say so plainly — do NOT fill the gap with what such documents usually say.
Translate German passages but keep the original wording in the quote.

Return ONLY JSON: {"answer": "...", "quotes": [{"text": "verbatim", "where": "§ or section"}], "notFound": false}`;

async function main() {
  const [programId, ...rest] = process.argv.slice(2);
  const question = rest.join(" ");
  if (!programId || !question) {
    console.log(`usage: npm run ask -- <programId> "question"`);
    return;
  }

  const seed = SEEDS.find((s) => s.programId === programId);
  if (!seed) return console.error(`unknown programId: ${programId}`);

  const chunks: Chunk[] = [{ kind: "text", text: `QUESTION: ${question}\n\nDocuments follow.` }];
  for (const url of [seed.statuteUrl, seed.admissionUrl].filter(Boolean) as string[]) {
    const { doc } = await fetchDocCached(url);
    if (doc.kind === "pdf") {
      chunks.push({ kind: "text", text: `\n--- PDF: ${url} ---` }, { kind: "pdf", bytes: doc.bytes });
    } else if (doc.kind === "text") {
      chunks.push({ kind: "text", text: `\n--- ${url} ---\n${doc.text.slice(0, 120_000)}` });
    }
  }

  const res = await providerFor(process.env["GEMINI_MODEL"] ?? DEFAULT_MODEL).generate(chunks, SYSTEM, Answer);
  if (!res.ok) return console.error(res.error);

  console.log(`\n${res.value.notFound ? "NOT STATED IN THE DOCUMENTS" : res.value.answer}\n`);
  for (const q of res.value.quotes) console.log(`  "${q.text}"${q.where ? `  — ${q.where}` : ""}`);
  console.log(`\n$${res.usage.costUsd.toFixed(4)} (~₹${(res.usage.costUsd * 88).toFixed(2)})`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
