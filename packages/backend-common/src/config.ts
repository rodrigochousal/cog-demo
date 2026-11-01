import path from "node:path";
import { fileURLToPath } from "node:url";

/** `packages/backend-common/` — config sits at the same depth in `src/` and `dist/`. */
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Default home of every local JSON collection: `packages/backend-common/data/`. */
export const DEFAULT_DATA_DIR = path.join(PACKAGE_ROOT, "data");

/** Directory holding the local JSON collections. Override with PLATFORM_DATA_DIR. */
export function resolveDataDir(): string {
  const fromEnv = process.env.PLATFORM_DATA_DIR;
  return fromEnv ? path.resolve(fromEnv) : DEFAULT_DATA_DIR;
}

export type StorageMode = "file" | "memory";

/** `file` (default) persists to resolveDataDir(); `memory` is ephemeral (tests, demos). */
export function resolveStorageMode(): StorageMode {
  return process.env.PLATFORM_STORAGE === "memory" ? "memory" : "file";
}

export function readPort(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  const port = /^\d+$/.test(raw.trim()) ? Number(raw) : Number.NaN;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`${envVar} must be a valid TCP port, got '${raw}'`);
  }
  return port;
}

export function readList(envVar: string, fallback: string[]): string[] {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
