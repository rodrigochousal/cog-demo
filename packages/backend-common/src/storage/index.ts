import path from "node:path";
import { resolveDataDir, resolveStorageMode, type StorageMode } from "../config.js";
import type { DocumentStore, Seed } from "./document-store.js";
import { createFileStore } from "./file-store.js";
import { createMemoryStore } from "./memory-store.js";

export type { DocumentStore, Seed } from "./document-store.js";
export { createFileStore } from "./file-store.js";
export { createMemoryStore } from "./memory-store.js";

export interface StoreOptions {
  /** Defaults to PLATFORM_STORAGE env (`file` unless set to `memory`). */
  mode?: StorageMode;
  /** Defaults to PLATFORM_DATA_DIR or `<repo>/.data`. */
  dataDir?: string;
}

/** Opens a named document store using the configured storage mode. */
export function openStore<D>(name: string, seed: Seed<D>, options: StoreOptions = {}): DocumentStore<D> {
  const mode = options.mode ?? resolveStorageMode();
  if (mode === "memory") return createMemoryStore(name, seed);
  return createFileStore(path.join(options.dataDir ?? resolveDataDir(), `${name}.json`), seed);
}
