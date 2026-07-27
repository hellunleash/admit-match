/**
 * CLI: fetch + extract a seed program, write a snapshot.
 *
 *   npm run extract -- tum-informatics-msc
 *   npm run extract -- --all
 *
 * Snapshots are JSON committed to git on purpose: a diff shows exactly when a university changed
 * its requirements, which is free version history and the changelog at the same time.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SEEDS } from "../seeds.js";
import {
  fetchDocCached,
  inputsUnchanged,
  readSnapshotMeta,
  writeSnapshotMeta,
} from "../extract/cache.js";
import { extractProgram, PROMPT_VERSION } from "../extract/extract.js";
import { startTracing, stopTracing, tracingEnabled } from "../tracing.js";
import type { SourceType } from "../schema.js";

const SNAPSHOT_DIR = join(process.cwd(), "snapshots");

/** Rough, for readability only. The billing console is the authority. */
const INR_PER_USD = 88;

let runCostUsd = 0;

type RunOutcome = "extracted" | "skipped" | "failed";

async function runOne(programId: string, opts: { refresh: boolean; force: boolean }): Promise<RunOutcome> {
  const seed = SEEDS.find((s) => s.programId === programId);
  if (!seed) {
    console.error(`unknown programId: ${programId}`);
    return "failed";
  }

  const targets: { url: string; sourceType: SourceType }[] = [];
  if (seed.statuteUrl) targets.push({ url: seed.statuteUrl, sourceType: "satzung" });
  if (seed.admissionUrl) targets.push({ url: seed.admissionUrl, sourceType: "program_page" });

  if (targets.length === 0) {
    console.error(`${programId}: no URLs on the seed`);
    return "failed";
  }

  console.log(`\n${programId} — ${seed.university}`);

  const docs = [];
  const docHashes: Record<string, string> = {};
  for (const t of targets) {
    const { doc, contentHash, fromCache } = await fetchDocCached(t.url, { refresh: opts.refresh });
    const summary =
      doc.kind === "text"
        ? `${doc.text.length} chars via ${doc.via}`
        : doc.kind === "pdf"
          ? `${(doc.bytes.length / 1024).toFixed(0)} KB pdf`
          : `FAILED — ${doc.reason}`;
    console.log(`  [${t.sourceType}] ${summary}${fromCache ? " (cached)" : ""}`);
    docs.push({ doc, sourceType: t.sourceType });
    if (contentHash) docHashes[t.url] = contentHash;
  }

  const model = process.env["GEMINI_MODEL"] ?? "gemini-2.5-flash";
  const prev = readSnapshotMeta(SNAPSHOT_DIR, programId);

  // The whole point of the cache: a run that changes nothing must cost nothing.
  if (!opts.force && inputsUnchanged(prev, { promptVersion: PROMPT_VERSION, model, docHashes })) {
    console.log(`  skipped — documents, prompt and model unchanged (no API call)`);
    return "skipped";
  }

  const result = await extractProgram({
    programId: seed.programId,
    university: seed.university,
    programName: seed.programName,
    field: "Computer Science",
    docs,
  });

  if (!result.ok) {
    console.error(`  extraction failed: ${result.error}`);
    return "failed";
  }

  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  writeFileSync(
    join(SNAPSHOT_DIR, `${programId}.json`),
    JSON.stringify(result.data, null, 2) + "\n",
    "utf8"
  );

  const sets = result.data.requirementSets.value.length;
  const u = result.usage;
  // Cost printed per call, in both currencies, because an invisible bill is how this got expensive.
  console.log(
    `  extracted: ${sets} requirement set(s) — in ${u.inputTokens}, out ${u.outputTokens}, ` +
      `thinking ${u.thinkingTokens} → $${u.costUsd.toFixed(4)} (~₹${(u.costUsd * INR_PER_USD).toFixed(2)})`
  );
  runCostUsd += u.costUsd;

  const defects = result.issues.filter((i) => i.severity === "defect");
  const reviews = result.issues.filter((i) => i.severity === "review");

  if (defects.length > 0) {
    console.log(`  ${defects.length} DEFECT(s) — field cannot prove itself:`);
    for (const i of defects) console.log(`    ! [${i.kind}] ${i.path}: ${i.detail}`);
  }
  if (reviews.length > 0) {
    console.log(`  ${reviews.length} review flag(s):`);
    for (const i of reviews) console.log(`    ? [${i.kind}] ${i.path}`);
  }
  if (result.issues.length === 0) console.log(`  verification clean`);

  writeSnapshotMeta(SNAPSHOT_DIR, {
    programId,
    extractedAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    model,
    docHashes,
    totalTokens: result.usage.totalTokens,
    costUsd: result.usage.costUsd,
    defects: defects.length,
    reviews: reviews.length,
  });

  return "extracted";
}

async function main() {
  const argv = process.argv.slice(2);
  const refresh = argv.includes("--refresh"); // re-download documents, ignoring the disk cache
  const force = argv.includes("--force"); // re-extract even when nothing changed
  const args = argv.filter((a) => !a.startsWith("--") || a === "--all");

  if (args.length === 0) {
    console.log("usage: npm run extract -- <programId> | --all [--refresh] [--force]");
    console.log("  --refresh  re-download documents instead of using the disk cache");
    console.log("  --force    re-extract even when documents, prompt and model are unchanged");
    console.log("\nseeds with at least one URL:");
    for (const s of SEEDS.filter((s) => s.admissionUrl || s.statuteUrl)) {
      console.log(`  ${s.programId.padEnd(28)} ${s.statuteUrl ? "statute+page" : "page only"}`);
    }
    return;
  }

  const ids =
    args[0] === "--all"
      ? SEEDS.filter((s) => s.statuteUrl && s.admissionUrl).map((s) => s.programId)
      : args;

  startTracing();
  console.log(tracingEnabled() ? "tracing: langfuse" : "tracing: off (no keys)");

  const tally = { extracted: 0, skipped: 0, failed: 0 };
  try {
    for (const id of ids) {
      // Serial on purpose: this crawls university servers, and being polite matters more than speed.
      tally[await runOne(id, { refresh, force })]++;
    }
  } finally {
    // Short-lived process: without an explicit flush, buffered spans are lost on exit.
    await stopTracing();
  }

  console.log(
    `\n${tally.extracted} extracted, ${tally.skipped} skipped (free), ${tally.failed} failed — of ${ids.length}`
  );
  console.log(`run cost: $${runCostUsd.toFixed(4)} (~₹${(runCostUsd * INR_PER_USD).toFixed(2)})`);
}

main().catch(async (err) => {
  console.error(err);
  await stopTracing();
  process.exit(1);
});
