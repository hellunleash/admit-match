/**
 * Disk cache for fetched documents.
 *
 * The reason this exists: iterating on the PROMPT meant re-sending the same 700 KB statute PDFs to
 * the model on every run. The documents hadn't changed — the code had. That is where essentially
 * the entire API bill came from, and it is pure waste.
 *
 * Cached under `.cache/docs/`, gitignored, keyed by URL hash. University statutes change perhaps
 * once a cycle, so a long TTL is correct; `--refresh` forces a re-fetch when it matters.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchDoc, type FetchedDoc } from "./fetch.js";

const CACHE_DIR = join(process.cwd(), ".cache", "docs");
const DEFAULT_MAX_AGE_DAYS = 14;

export function sha(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

type CacheMeta = {
  url: string;
  kind: FetchedDoc["kind"];
  fetchedAt: string;
  via?: "fetch" | "jina";
  reason?: string;
  contentHash: string;
};

const metaPath = (key: string) => join(CACHE_DIR, `${key}.meta.json`);
const bodyPath = (key: string, kind: string) => join(CACHE_DIR, `${key}.${kind === "pdf" ? "pdf" : "txt"}`);

function ageInDays(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

export type CachedFetch = { doc: FetchedDoc; contentHash: string; fromCache: boolean };

export async function fetchDocCached(
  url: string,
  opts?: { refresh?: boolean; maxAgeDays?: number }
): Promise<CachedFetch> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const key = sha(url).slice(0, 32);
  const maxAge = opts?.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;

  if (!opts?.refresh && existsSync(metaPath(key))) {
    try {
      const meta = JSON.parse(readFileSync(metaPath(key), "utf8")) as CacheMeta;
      if (meta.kind !== "failed" && ageInDays(meta.fetchedAt) < maxAge && existsSync(bodyPath(key, meta.kind))) {
        const doc: FetchedDoc =
          meta.kind === "pdf"
            ? { kind: "pdf", url, bytes: new Uint8Array(readFileSync(bodyPath(key, "pdf"))), fetchedAt: meta.fetchedAt }
            : {
                kind: "text",
                url,
                text: readFileSync(bodyPath(key, "txt"), "utf8"),
                via: meta.via ?? "fetch",
                fetchedAt: meta.fetchedAt,
              };
        return { doc, contentHash: meta.contentHash, fromCache: true };
      }
    } catch {
      // A corrupt cache entry is not worth a failure — fall through and re-fetch.
    }
  }

  const doc = await fetchDoc(url);
  const contentHash =
    doc.kind === "pdf" ? sha(doc.bytes) : doc.kind === "text" ? sha(doc.text) : "";

  if (doc.kind !== "failed") {
    const meta: CacheMeta = {
      url,
      kind: doc.kind,
      fetchedAt: doc.fetchedAt,
      ...(doc.kind === "text" ? { via: doc.via } : {}),
      contentHash,
    };
    writeFileSync(metaPath(key), JSON.stringify(meta, null, 2), "utf8");
    if (doc.kind === "pdf") writeFileSync(bodyPath(key, "pdf"), doc.bytes);
    else writeFileSync(bodyPath(key, "txt"), doc.text, "utf8");
  }

  return { doc, contentHash, fromCache: false };
}

/* ------------------------------------------------------------------ extraction skip */

/**
 * Sidecar recording what produced a snapshot. Kept beside the snapshot rather than inside it so
 * the data file stays purely the extracted document.
 *
 * Re-extraction happens only when an input actually changed: a document, the prompt, or the model.
 * Anything else is paying twice for the same answer.
 */
export type SnapshotMeta = {
  programId: string;
  extractedAt: string;
  promptVersion: string;
  model: string;
  docHashes: Record<string, string>;
  totalTokens: number;
  costUsd: number;
  defects: number;
  reviews: number;
};

export function readSnapshotMeta(dir: string, programId: string): SnapshotMeta | null {
  const p = join(dir, `${programId}.meta.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as SnapshotMeta;
  } catch {
    return null;
  }
}

export function writeSnapshotMeta(dir: string, meta: SnapshotMeta): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${meta.programId}.meta.json`), JSON.stringify(meta, null, 2) + "\n", "utf8");
}

export function inputsUnchanged(
  prev: SnapshotMeta | null,
  now: { promptVersion: string; model: string; docHashes: Record<string, string> }
): boolean {
  if (!prev) return false;
  if (prev.promptVersion !== now.promptVersion || prev.model !== now.model) return false;
  const prevKeys = Object.keys(prev.docHashes).sort();
  const nowKeys = Object.keys(now.docHashes).sort();
  if (prevKeys.join("|") !== nowKeys.join("|")) return false;
  return prevKeys.every((k) => prev.docHashes[k] === now.docHashes[k]);
}
