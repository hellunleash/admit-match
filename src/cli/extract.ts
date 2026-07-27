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
import { fetchDoc } from "../extract/fetch.js";
import { extractProgram } from "../extract/extract.js";
import type { SourceType } from "../schema.js";

const SNAPSHOT_DIR = join(process.cwd(), "snapshots");

async function runOne(programId: string): Promise<boolean> {
  const seed = SEEDS.find((s) => s.programId === programId);
  if (!seed) {
    console.error(`unknown programId: ${programId}`);
    return false;
  }

  const targets: { url: string; sourceType: SourceType }[] = [];
  if (seed.statuteUrl) targets.push({ url: seed.statuteUrl, sourceType: "satzung" });
  if (seed.admissionUrl) targets.push({ url: seed.admissionUrl, sourceType: "program_page" });

  if (targets.length === 0) {
    console.error(`${programId}: no URLs on the seed`);
    return false;
  }

  console.log(`\n${programId} — ${seed.university}`);

  const docs = [];
  for (const t of targets) {
    const doc = await fetchDoc(t.url);
    const summary =
      doc.kind === "text"
        ? `${doc.text.length} chars via ${doc.via}`
        : doc.kind === "pdf"
          ? `${(doc.bytes.length / 1024).toFixed(0)} KB pdf`
          : `FAILED — ${doc.reason}`;
    console.log(`  [${t.sourceType}] ${summary}`);
    docs.push({ doc, sourceType: t.sourceType });
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
    return false;
  }

  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  writeFileSync(
    join(SNAPSHOT_DIR, `${programId}.json`),
    JSON.stringify(result.data, null, 2) + "\n",
    "utf8"
  );

  const sets = result.data.requirementSets.value.length;
  console.log(`  extracted: ${sets} requirement set(s), ~${result.costHint} tokens`);

  if (result.issues.length > 0) {
    console.log(`  ${result.issues.length} verification issue(s):`);
    for (const issue of result.issues) console.log(`    - [${issue.kind}] ${issue.path}: ${issue.detail}`);
  } else {
    console.log(`  verification clean`);
  }

  return true;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("usage: npm run extract -- <programId> | --all");
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

  let ok = 0;
  for (const id of ids) {
    // Serial on purpose: this crawls university servers, and being polite matters more than speed.
    if (await runOne(id)) ok++;
  }
  console.log(`\n${ok}/${ids.length} extracted`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
