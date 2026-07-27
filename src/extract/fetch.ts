/**
 * Fetching. Three tiers, cheapest first, because most university pages are server-rendered HTML
 * and launching a browser for them is waste.
 *
 *   1. plain fetch        — server-rendered HTML, which is most of them
 *   2. Jina Reader        — free hosted URL -> markdown, skips writing a boilerplate stripper
 *   3. (deferred) Playwright for genuinely JS-rendered pages — logged and skipped for now
 *
 * PDFs are NOT converted here. Statutes are usually German-language PDFs, and Gemini ingests them
 * natively — a parse-then-hope pipeline would lose exactly the § structure that makes a citation
 * worth having.
 */

export type FetchedDoc =
  | { kind: "text"; url: string; text: string; via: "fetch" | "jina"; fetchedAt: string }
  | { kind: "pdf"; url: string; bytes: Uint8Array; fetchedAt: string }
  | { kind: "failed"; url: string; reason: string; fetchedAt: string };

/** ASCII only: HTTP header values are ByteStrings, so a stray em-dash throws on every request. */
const UA = "admit-match/0.1 (+https://github.com/hellunleash/admit-match)";

/** Domain allowlist: official university domains only, never aggregators. */
export function isAllowedHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.endsWith(".de") ||
      host.endsWith(".edu") ||
      host.endsWith("uni-assist.de") ||
      host.endsWith("anabin.kmk.org")
    );
  } catch {
    return false;
  }
}

async function withTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, headers: { "user-agent": UA, ...init?.headers } });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDoc(url: string, opts?: { timeoutMs?: number }): Promise<FetchedDoc> {
  const fetchedAt = new Date().toISOString();
  const timeoutMs = opts?.timeoutMs ?? 30_000;

  if (!isAllowedHost(url)) {
    return { kind: "failed", url, reason: "host not on the official-domain allowlist", fetchedAt };
  }

  try {
    const res = await withTimeout(url, timeoutMs);
    if (!res.ok) {
      return { kind: "failed", url, reason: `HTTP ${res.status}`, fetchedAt };
    }

    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("application/pdf") || url.toLowerCase().endsWith(".pdf")) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      return { kind: "pdf", url, bytes, fetchedAt };
    }

    const html = await res.text();
    const text = stripHtml(html);

    // Too little text usually means the content is client-rendered. Jina executes JS; if it also
    // comes back thin, the page needs Playwright and is logged rather than guessed at.
    if (text.length < 800) {
      const viaJina = await tryJina(url, timeoutMs);
      if (viaJina) return { kind: "text", url, text: viaJina, via: "jina", fetchedAt };
      return { kind: "failed", url, reason: "too little text — likely JS-rendered, needs Playwright", fetchedAt };
    }

    return { kind: "text", url, text, via: "fetch", fetchedAt };
  } catch (err) {
    return { kind: "failed", url, reason: err instanceof Error ? err.message : String(err), fetchedAt };
  }
}

async function tryJina(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const key = process.env["JINA_API_KEY"];
    const res = await withTimeout(`https://r.jina.ai/${url}`, timeoutMs, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 200 ? text : null;
  } catch {
    return null;
  }
}

/**
 * Deliberately crude: strip script/style/nav noise and collapse whitespace. Extraction quality
 * comes from citing the right document, not from perfect boilerplate removal — and every claim is
 * verified against its snippet afterwards regardless.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
