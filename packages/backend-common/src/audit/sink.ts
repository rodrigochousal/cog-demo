import type { AuditLogPayload } from "./types.js";

/** Receives finished audit payloads. Must not throw; failures are reported to `onError`. */
export type AuditSink = (payload: AuditLogPayload) => void;

/** Minimal writable surface, satisfied by `process.stdout`. */
export interface LineWriter {
  write(chunk: string): boolean;
}

/** Serialises a payload as exactly one line of JSON (newline-terminated). */
export function formatAuditLine(payload: AuditLogPayload): string {
  return `${JSON.stringify(payload)}\n`;
}

/**
 * Writes each payload as a single JSON line to `stream` (default `process.stdout`) for a log
 * agent (Datadog Agent, Fluent Bit, ...) to scrape and ship. Writes are fire-and-forget: a
 * full buffer is left to Node's stream queue rather than awaited.
 */
export function createStdoutAuditSink(stream: LineWriter = process.stdout): AuditSink {
  return (payload) => {
    stream.write(formatAuditLine(payload));
  };
}
