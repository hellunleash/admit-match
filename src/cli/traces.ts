/**
 * Read Langfuse traces from the command line.
 *
 *   npm run traces              -- recent extraction traces, one line each
 *   npm run traces -- --detail  -- observation-level detail for the most recent traces
 *   npm run traces -- --cost    -- cost and token rollup by model and prompt version
 *
 * Uses the public API with the keys already in .env (basic auth: public key as username, secret as
 * password). No MCP server, no extra install, and nothing to authorise — the dashboard is nicer to
 * look at, but this is what makes the numbers greppable and pasteable.
 */

const BASE = (process.env["LANGFUSE_BASE_URL"] ?? "https://cloud.langfuse.com").replace(/\/$/, "");

type TraceRow = {
  id: string;
  name?: string;
  timestamp?: string;
  latency?: number;
  totalCost?: number;
  observations?: unknown[];
  metadata?: Record<string, unknown>;
  input?: unknown;
  output?: unknown;
};

type ObservationRow = {
  id: string;
  traceId?: string;
  name?: string;
  type?: string;
  model?: string;
  startTime?: string;
  latency?: number;
  calculatedTotalCost?: number;
  usage?: { input?: number; output?: number; total?: number };
  metadata?: Record<string, unknown>;
  input?: unknown;
  output?: unknown;
  level?: string;
  statusMessage?: string;
};

async function api<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const pub = process.env["LANGFUSE_PUBLIC_KEY"];
  const secret = process.env["LANGFUSE_SECRET_KEY"];
  if (!pub || !secret) throw new Error("LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are not set in .env");

  const url = new URL(`${BASE}/api/public${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, {
    headers: { authorization: `Basic ${Buffer.from(`${pub}:${secret}`).toString("base64")}` },
  });
  if (!res.ok) throw new Error(`Langfuse HTTP ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

const inr = (usd: number) => `₹${(usd * 88).toFixed(2)}`;
const short = (v: unknown, n = 90) => {
  const s = typeof v === "string" ? v : JSON.stringify(v ?? "");
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

async function listTraces(limit: number): Promise<TraceRow[]> {
  const body = await api<{ data: TraceRow[] }>("/traces", { limit });
  return body.data ?? [];
}

async function listObservations(limit: number): Promise<ObservationRow[]> {
  const body = await api<{ data: ObservationRow[] }>("/observations", {
    limit,
    fields: "core,basic,usage",
  });
  return body.data ?? [];
}

async function main() {
  const argv = process.argv.slice(2);
  const limit = Number(argv.find((a) => /^\d+$/.test(a)) ?? 20);

  if (argv.includes("--cost")) {
    const obs = await listObservations(Math.max(limit, 50));
    type Row = { calls: number; cost: number; input: number; output: number; thinking: number };
    const byKey = new Map<string, Row>();

    /**
     * Cost comes from OUR metadata, not Langfuse's `calculatedTotalCost`.
     *
     * Langfuse computes cost for typed generation observations that carry model + usage; these are
     * plain observations, so its figure is 0. Rather than guess at SDK internals to reshape them,
     * the extractor already records the numbers it measured — including thinking tokens, which are
     * the ones that actually caught us out — and this reads those back.
     */
    for (const o of obs) {
      const m = o.metadata ?? {};
      const num = (k: string) => (typeof m[k] === "number" ? (m[k] as number) : 0);
      const key = `${String(m["model"] ?? o.model ?? "?")} @ ${String(m["promptVersion"] ?? "-")}`;
      const e = byKey.get(key) ?? { calls: 0, cost: 0, input: 0, output: 0, thinking: 0 };
      e.calls += 1;
      e.cost += num("costUsd") || (o.calculatedTotalCost ?? 0);
      e.input += num("inputTokens") || (o.usage?.input ?? 0);
      e.output += num("outputTokens") || (o.usage?.output ?? 0);
      e.thinking += num("thinkingTokens");
      byKey.set(key, e);
    }

    console.log(`cost rollup over the last ${obs.length} observations\n`);
    let grand = 0;
    for (const [key, e] of [...byKey].sort((a, b) => b[1].cost - a[1].cost)) {
      grand += e.cost;
      console.log(
        `${key.padEnd(40)} calls=${String(e.calls).padStart(3)}  in=${String(e.input).padStart(7)}  ` +
          `out=${String(e.output).padStart(6)}  think=${String(e.thinking).padStart(6)}  ` +
          `$${e.cost.toFixed(4)} (${inr(e.cost)})`
      );
    }
    console.log(`\ntotal: $${grand.toFixed(4)} (${inr(grand)})`);
    return;
  }

  if (argv.includes("--detail")) {
    const obs = await listObservations(limit);
    for (const o of obs) {
      console.log(`\n${o.startTime ?? "?"}  ${o.name ?? "?"}  [${o.type ?? "?"}]  ${o.model ?? ""}`);
      console.log(`  trace=${o.traceId ?? "?"}  latency=${o.latency ?? "?"}s  cost=$${(o.calculatedTotalCost ?? 0).toFixed(4)}`);
      if (o.usage) console.log(`  tokens: in=${o.usage.input ?? 0} out=${o.usage.output ?? 0}`);
      if (o.metadata && Object.keys(o.metadata).length) console.log(`  meta: ${short(o.metadata, 160)}`);
      if (o.level && o.level !== "DEFAULT") console.log(`  level=${o.level} ${o.statusMessage ?? ""}`);
      if (o.input !== undefined) console.log(`  in:  ${short(o.input, 160)}`);
      if (o.output !== undefined) console.log(`  out: ${short(o.output, 160)}`);
    }
    return;
  }

  const traces = await listTraces(limit);
  if (traces.length === 0) {
    console.log("no traces found — run an extraction first, and note that tracing is a no-op without keys");
    return;
  }

  console.log(`${traces.length} most recent traces\n`);
  let total = 0;
  for (const t of traces) {
    total += t.totalCost ?? 0;
    console.log(
      `${(t.timestamp ?? "").slice(0, 19).padEnd(20)} ${(t.name ?? "?").padEnd(18)} ` +
        `${String(t.latency ?? "?").padStart(6)}s  $${(t.totalCost ?? 0).toFixed(4)}  ${short(t.output, 60)}`
    );
  }
  console.log(`\ntotal across these traces: $${total.toFixed(4)} (${inr(total)})`);
  console.log(`dashboard: ${BASE}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
