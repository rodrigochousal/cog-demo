import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { deepClone } from "../util.js";
import type { DocumentStore, Seed } from "./document-store.js";

const LOCK_TIMEOUT_MS = 5_000;
const STALE_LOCK_MS = 10_000;
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
const sleep = (ms: number) => Atomics.wait(sleepBuffer, 0, 0, ms);

/**
 * Cross-process advisory lock using an exclusive lock file. Several service
 * processes may share one data file (e.g. two BFFs reading the ledger), so
 * every read-modify-write cycle is serialised through this lock.
 */
function withFileLock<R>(file: string, fn: () => R): R {
  const lockFile = `${file}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let fd: number | undefined;
  while (fd === undefined) {
    try {
      fd = openSync(lockFile, "wx");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      try {
        if (Date.now() - statSync(lockFile).mtimeMs > STALE_LOCK_MS) unlinkSync(lockFile);
      } catch {
        /* lock released between checks */
      }
      if (Date.now() > deadline) throw new Error(`Timed out acquiring lock on ${file}`);
      sleep(10);
    }
  }
  try {
    return fn();
  } finally {
    closeSync(fd);
    try {
      unlinkSync(lockFile);
    } catch {
      /* already removed */
    }
  }
}

/**
 * JSON-file-backed store. The file is created from `seed` on first access and
 * written atomically (write temp file, then rename) on every commit.
 */
export function createFileStore<D>(filePath: string, seed: Seed<D>): DocumentStore<D> {
  const file = path.resolve(filePath);
  mkdirSync(path.dirname(file), { recursive: true });

  let cache: { mtimeMs: number; size: number; doc: D } | undefined;

  const write = (doc: D) => {
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    renameSync(tmp, file);
    cache = undefined;
  };

  const load = (): D => {
    if (!existsSync(file)) {
      withFileLock(file, () => {
        if (!existsSync(file)) write(seed());
      });
    }
    const stat = statSync(file);
    if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) return cache.doc;
    const doc = JSON.parse(readFileSync(file, "utf8")) as D;
    cache = { mtimeMs: stat.mtimeMs, size: stat.size, doc };
    return doc;
  };

  return {
    name: path.basename(file),
    read: () => deepClone(load()),
    transact(fn) {
      load();
      return withFileLock(file, () => {
        const draft = deepClone(load());
        const result = fn(draft);
        write(draft);
        return result;
      });
    },
  };
}
