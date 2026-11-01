import { existsSync } from "node:fs";
import path from "node:path";

/** Walks up from `start` to the directory containing pnpm-workspace.yaml. */
export function findWorkspaceRoot(start: string = process.cwd()): string {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

/** Directory holding the local JSON ledgers / mock databases. Override with PLATFORM_DATA_DIR. */
export function resolveDataDir(): string {
  const fromEnv = process.env.PLATFORM_DATA_DIR;
  return fromEnv ? path.resolve(fromEnv) : path.join(findWorkspaceRoot(), ".data");
}

export type StorageMode = "file" | "memory";

/** `file` (default) persists to resolveDataDir(); `memory` is ephemeral (tests, demos). */
export function resolveStorageMode(): StorageMode {
  return process.env.PLATFORM_STORAGE === "memory" ? "memory" : "file";
}

export function readPort(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  const port = Number.parseInt(raw, 10);
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
