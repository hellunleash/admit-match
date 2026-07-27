/**
 * Ingest a Modulhandbuch (module handbook) and attach real learning outcomes to each course.
 *
 *   npm run modules -- "C:\path\to\handbook.pdf"
 *
 * Why this matters more than anything else in the profile: German committees assess
 * "wesentlicher Unterschied" against LEARNING OUTCOMES, not course titles, and uni-assist states
 * outright that a transcript with lecture titles only is not sufficient. Matching on titles is a
 * guess about a guess. This is the document that makes a match `description_backed`.
 *
 * Writes `modules.local.json` — gitignored, like everything else derived from a personal record.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { providerFor, DEFAULT_MODEL } from "../extract/registry.js";
import type { Chunk } from "../extract/provider.js";
import { startTracing, stopTracing } from "../tracing.js";

const PROFILE = "profile.local.json";
const OUT = "modules.local.json";
const INR = 88;

const ModuleDescription = z.object({
  code: z.string(),
  title: z.string(),
  /** Credits AS PRINTED in the handbook. Resolves the values I had to infer from semester totals. */
  credits: z.preprocess(
    (v) => (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v),
    z.number().optional()
  ),
  /** 1-3 sentences on what the module actually covers. */
  contentSummary: z.string(),
  /** Verbatim-ish learning outcomes / objectives — the field a committee reads. */
  learningOutcomes: z.array(z.string()).default([]),
  /** Concrete topics named in the syllabus. The strongest signal for per-requirement matching. */
  topics: z.array(z.string()).default([]),
  /** Page or section in the handbook, so every description stays traceable to its source. */
  locator: z.string().optional(),
});

const Batch = z.object({ modules: z.array(ModuleDescription) });

const SYSTEM = `You read a university module handbook (Modulhandbuch) and extract module descriptions.

Rules:
1. Extract ONLY the modules whose codes or titles are in the requested list. Ignore everything else.
2. Copy content faithfully. Do NOT summarise into vagueness and do NOT invent topics that are not
   printed in the handbook. If a module has no stated learning outcomes, return an empty array.
3. "topics" should be the concrete subject matter named in the syllabus (e.g. "Fourier transforms",
   "pointer arithmetic", "finite automata") — these decide whether a course satisfies a German
   program's subject requirement, so specificity matters more than tidiness.
4. Report credits exactly as printed. Omit the field if the handbook does not state them.
5. A module you cannot find is simply absent from your output. Never fabricate an entry.

Return ONLY JSON: {"modules":[{"code","title","credits","contentSummary","learningOutcomes":[],"topics":[],"locator"}]}`;

async function main() {
  const pdfPath = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!pdfPath || !existsSync(pdfPath)) {
    console.error(`usage: npm run modules -- "<path to Modulhandbuch.pdf>"`);
    process.exit(1);
  }
  if (!existsSync(PROFILE)) {
    console.error(`${PROFILE} not found — the course list comes from there`);
    process.exit(1);
  }

  const profile = JSON.parse(readFileSync(PROFILE, "utf8")) as {
    courses: { code: string; title: string; credits: number }[];
  };
  const wanted = profile.courses.map((c) => `${c.code} — ${c.title}`);

  const bytes = new Uint8Array(readFileSync(pdfPath));
  console.log(`handbook: ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
  console.log(`requesting ${wanted.length} modules\n`);

  startTracing();
  const provider = providerFor(process.env["GEMINI_MODEL"] ?? DEFAULT_MODEL);

  // One pass over the whole handbook. Splitting by page range would mean re-sending the PDF per
  // chunk, which is exactly the pattern that made extraction expensive in the first place.
  const chunks: Chunk[] = [
    { kind: "text", text: `Extract these modules:\n${wanted.join("\n")}\n\nHandbook follows.` },
    { kind: "pdf", bytes },
  ];

  const result = await provider.generate(chunks, SYSTEM, Batch);
  await stopTracing();

  if (!result.ok) {
    console.error(`failed: ${result.error}`);
    console.error(`spent anyway: $${result.usage.costUsd.toFixed(4)} (~₹${(result.usage.costUsd * INR).toFixed(2)})`);
    process.exit(1);
  }

  /**
   * An entry with no content, no topics and no outcomes is NOT a module description — it's the
   * model acknowledging a requested code it couldn't find. Keeping those would be worse than
   * useless: they carry a title and a credit figure, so they look like evidence while proving
   * nothing, and a match built on one would be `description_backed` in name only.
   */
  const hasContent = (m: z.infer<typeof ModuleDescription>) =>
    Boolean(m.contentSummary?.trim()) || m.topics.length > 0 || m.learningOutcomes.length > 0;

  const found = result.value.modules.filter(hasContent);
  const shells = result.value.modules.filter((m) => !hasContent(m));
  const byCode = new Map(found.map((m) => [m.code.toUpperCase().replace(/[\s-]/g, ""), m]));

  const missing = profile.courses.filter(
    (c) => !byCode.has(c.code.toUpperCase().replace(/[\s-]/g, ""))
  );

  writeFileSync(
    OUT,
    JSON.stringify(
      { sourcePdf: pdfPath, extractedAt: new Date().toISOString(), modules: found },
      null,
      2
    ) + "\n",
    "utf8"
  );
  if (shells.length) console.log(`discarded ${shells.length} empty entries (requested but not in this handbook)`);

  const u = result.usage;
  console.log(`extracted ${found.length}/${profile.courses.length} modules → ${OUT}`);
  console.log(
    `in ${u.inputTokens}, out ${u.outputTokens}, thinking ${u.thinkingTokens} → ` +
      `$${u.costUsd.toFixed(4)} (~₹${(u.costUsd * INR).toFixed(2)})`
  );

  // Credit reconciliation: the handbook is authoritative, and two of my values were inferred from
  // semester totals rather than read.
  const creditDiffs = profile.courses
    .map((c) => ({ c, m: byCode.get(c.code.toUpperCase().replace(/[\s-]/g, "")) }))
    .filter((x) => x.m?.credits !== undefined && x.m.credits !== x.c.credits);

  if (creditDiffs.length) {
    console.log(`\ncredit mismatches vs profile (handbook wins):`);
    for (const { c, m } of creditDiffs) console.log(`  ${c.code.padEnd(10)} profile=${c.credits}  handbook=${m!.credits}`);
  }

  if (missing.length) {
    console.log(
      `\nno description found (${missing.length}/${profile.courses.length}) — these stay title_only ` +
        `until the owning department's handbook is added:`
    );
    for (const c of missing) console.log(`  ${c.code.padEnd(10)} ${c.title}`);
    console.log(
      `\nA department handbook only covers its own modules. Courses taught by other departments ` +
        `(mathematics, computer science, humanities) need those departments' handbooks — and for a ` +
        `CS application the mathematics and programming ones carry the most weight.`
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
