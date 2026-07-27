/**
 * Langfuse tracing. Off unless keys are present, and never allowed to break an extraction.
 *
 * Bought, not built: Langfuse already does traces, cost, latency and prompt versioning, so there is
 * nothing here worth reimplementing. This file is the whole integration — a start, an update and a
 * flush — and if the keys are missing every call becomes a no-op.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { startActiveObservation } from "@langfuse/tracing";

let sdk: NodeSDK | null = null;

export function tracingEnabled(): boolean {
  return Boolean(process.env["LANGFUSE_PUBLIC_KEY"] && process.env["LANGFUSE_SECRET_KEY"]);
}

/** Idempotent. Safe to call when keys are absent — it simply does nothing. */
export function startTracing(): void {
  if (sdk || !tracingEnabled()) return;
  try {
    sdk = new NodeSDK({ spanProcessors: [new LangfuseSpanProcessor()] });
    sdk.start();
  } catch {
    // A tracing failure must never take down the thing it is watching.
    sdk = null;
  }
}

/** Flush before exit. Short-lived CLI processes drop buffered spans otherwise. */
export async function stopTracing(): Promise<void> {
  if (!sdk) return;
  try {
    await sdk.shutdown();
  } catch {
    /* ignore */
  } finally {
    sdk = null;
  }
}

export type ObservationFields = {
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
};

/**
 * Run `fn` inside a named observation. When tracing is disabled the function still runs — the
 * caller cannot tell the difference, which is the point.
 */
export async function observe<T>(
  name: string,
  fields: ObservationFields,
  fn: () => Promise<T>
): Promise<T> {
  if (!sdk) return fn();
  try {
    return await startActiveObservation(name, async (span) => {
      const result = await fn();
      try {
        span.update({
          ...(fields.input !== undefined && { input: fields.input }),
          ...(fields.output !== undefined && { output: fields.output }),
          ...(fields.metadata && { metadata: fields.metadata }),
        });
      } catch {
        /* ignore */
      }
      return result;
    });
  } catch (err) {
    // Only a tracing-layer failure lands here as a non-Error; rethrow so real errors surface.
    throw err;
  }
}

/** Attach details a span already produced — usage, cost, verification issues. */
export async function observeWith<T>(
  name: string,
  fn: () => Promise<{ result: T; fields: ObservationFields }>
): Promise<T> {
  if (!sdk) return (await fn()).result;
  return startActiveObservation(name, async (span) => {
    const { result, fields } = await fn();
    try {
      span.update({
        ...(fields.input !== undefined && { input: fields.input }),
        ...(fields.output !== undefined && { output: fields.output }),
        ...(fields.metadata && { metadata: fields.metadata }),
      });
    } catch {
      /* ignore */
    }
    return result;
  });
}
