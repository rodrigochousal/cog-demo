import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deepClone } from "../util.js";
import { assertSynchronous, type DocumentStore, type Seed } from "./document-store.js";

const LOCK_TIMEOUT_MS = 5_000;
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
const sleep = (ms: number) => Atomics.wait(sleepBuffer, 0, 0, ms);

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** A lock is only stale when the process that wrote it no longer exists. */
function removeLockIfOwnerDead(lockFile: string): void {
  let pid: number;
  try {
    pid = Number.parseInt(readFileSync(lockFile, "utf8").split(":")[0] ?? "", 10);
  } catch {
    return; // released between checks
  }
  if (Number.isInteger(pid) && pid > 0 && isProcessAlive(pid)) return;
  try {
    unlinkSync(lockFile);
  } catch {
    /* already removed */
  }
}

/**
 * Cross-process advisory lock using an exclusive lock file containing the
 * owner's `pid:token`. Several service processes may share one data file, so
 * every read-modify-write cycle is serialised through this lock. `fn` receives
 * an `assertOwned` guard to call right before committing.
 */
function withFileLock<R>(file: string, fn: (assertOwned: () => void) => R): R {
  const lockFile = `${file}.lock`;
  const token = `${process.pid}:${randomUUID()}`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      writeFileSync(lockFile, token, { flag: "wx" });
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      removeLockIfOwnerDead(lockFile);
      if (Date.now() > deadline) throw new Error(`Timed out acquiring lock on ${file}`);
      sleep(10);
    }
  }
  const owned = () => {
    try {
      return readFileSync(lockFile, "utf8") === token;
    } catch {
      return false;
    }
  };
  try {
    return fn(() => {
      if (!owned()) throw new Error(`Lost lock on ${file}; transaction aborted`);
    });
  } finally {
    if (owned()) {
      try {
        unlinkSync(lockFile);
      } catch {
        /* already removed */
      }
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
      withFileLock(file, (assertOwned) => {
        if (existsSync(file)) return;
        const doc = seed();
        assertOwned();
        write(doc);
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
      return withFileLock(file, (assertOwned) => {
        const draft = deepClone(load());
        const result = assertSynchronous(fn(draft));
        assertOwned();
        write(draft);
        return result;
      });
    },
  };
}
