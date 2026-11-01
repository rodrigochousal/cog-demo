import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageMode } from "../config.js";
import { ConnectorError } from "./errors.js";
import { delay, withSimulatedLatency, type LatencySetting } from "./latency.js";
import { isObject, type RecordSchema } from "./schema.js";

const SCHEMA_VERSION = 1;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_RETRY_MS = 10;

/** On-disk envelope of every collection data file. */
interface CollectionDocument<T> {
  schemaVersion: typeof SCHEMA_VERSION;
  records: T[];
}

export interface JsonCollectionOptions<T> {
  /** Collection name used in error messages, e.g. `ledger`. */
  label: string;
  /** JSON file backing the collection. Not touched in `memory` mode. */
  filePath: string;
  /** `file` (default) persists to `filePath`; `memory` keeps state in this instance only. */
  mode?: StorageMode;
  schema: RecordSchema<T>;
  /** Records written when the collection does not exist yet. */
  seed: () => T[];
  latency: LatencySetting;
}

type AssertOwned = () => Promise<void>;

/** Raw text storage underneath a collection: one JSON file, or a string held in memory. */
interface TextBackend {
  /** Used in error messages. */
  readonly location: string;
  /** `undefined` when the collection has not been created yet. */
  read(): Promise<string | undefined>;
  write(text: string): Promise<void>;
  /** Runs `fn` exclusively; `fn` awaits `assertOwned` right before committing. Not reentrant. */
  withLock<R>(fn: (assertOwned: AssertOwned) => Promise<R>): Promise<R>;
}

const errorCode = (err: unknown): string | undefined =>
  isObject(err) && typeof err.code === "string" ? err.code : undefined;

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return errorCode(err) === "EPERM";
  }
}

function createMemoryBackend(label: string): TextBackend {
  let text: string | undefined;
  return {
    location: `memory:${label}`,
    read: async () => text,
    write: async (next) => {
      text = next;
    },
    // Exclusivity comes from the collection's in-process queue; there is no other writer.
    withLock: (fn) => fn(async () => undefined),
  };
}

function createFileBackend(label: string, filePath: string): TextBackend {
  const file = path.resolve(filePath);
  const lockFile = `${file}.lock`;
  const ioError = (action: string, err: unknown) => new ConnectorError(label, `${action} ${file}`, { cause: err });

  const removeLockIfOwnerDead = async (): Promise<void> => {
    const holder = await readFile(lockFile, "utf8").catch(() => undefined);
    if (holder === undefined) return;
    const pid = Number.parseInt(holder.split(":")[0] ?? "", 10);
    if (Number.isInteger(pid) && pid > 0 && isProcessAlive(pid)) return;
    await rm(lockFile, { force: true });
  };

  return {
    location: file,
    async read() {
      try {
        return await readFile(file, "utf8");
      } catch (err) {
        if (errorCode(err) === "ENOENT") return undefined;
        throw ioError("could not read", err);
      }
    },
    async write(text) {
      const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(tmp, text, "utf8");
        await rename(tmp, file);
      } catch (err) {
        await rm(tmp, { force: true });
        throw ioError("could not write", err);
      }
    },
    /**
     * Cross-process advisory lock: an exclusive `<file>.lock` holding `pid:token`.
     * A lock is only reclaimed when its owner process is dead; a writer that finds
     * it no longer owns its lock aborts instead of overwriting someone else's commit.
     */
    async withLock(fn) {
      const token = `${process.pid}:${randomUUID()}`;
      const deadline = Date.now() + LOCK_TIMEOUT_MS;
      await mkdir(path.dirname(file), { recursive: true }).catch((err: unknown) => {
        throw ioError("could not create data directory for", err);
      });
      for (;;) {
        try {
          await writeFile(lockFile, token, { flag: "wx" });
          break;
        } catch (err) {
          if (errorCode(err) !== "EEXIST") throw ioError("could not lock", err);
          await removeLockIfOwnerDead();
          if (Date.now() > deadline) throw new ConnectorError(label, `timed out acquiring lock on ${file}`);
          await delay(LOCK_RETRY_MS);
        }
      }
      const owned = async () => (await readFile(lockFile, "utf8").catch(() => undefined)) === token;
      try {
        return await fn(async () => {
          if (!(await owned())) throw new ConnectorError(label, `lost lock on ${file}; write aborted`);
        });
      } finally {
        if (await owned()) await rm(lockFile, { force: true });
      }
    },
  };
}

/**
 * Async JSON collection: the single storage engine of backend-common.
 *
 * - Seeds the collection on first access (creating the directory), and again if the file is deleted while running.
 * - Every read and write goes through {@link withSimulatedLatency}.
 * - Mutations are all-or-nothing and serialised in-process (promise queue) and, in `file`
 *   mode, across processes (lock file), and written atomically via temp file + rename.
 * - Records are validated against `schema` on read and before every write; a corrupt file raises a ConnectorError.
 */
export class JsonCollection<T> {
  readonly #options: JsonCollectionOptions<T>;
  readonly #backend: TextBackend;
  #queue: Promise<void> = Promise.resolve();

  constructor(options: JsonCollectionOptions<T>) {
    this.#options = options;
    this.#backend =
      options.mode === "memory" ? createMemoryBackend(options.label) : createFileBackend(options.label, options.filePath);
  }

  /** Creates and seeds the collection if it does not exist. Idempotent. */
  async initialize(): Promise<void> {
    await this.#readDocument(false);
  }

  /** Returns every record (fresh objects; mutating them does not affect storage). */
  async readAll(): Promise<T[]> {
    return (await this.#readDocument(false)).records;
  }

  /**
   * Applies `mutate` to the current records under an exclusive lock and persists
   * the result. If `mutate` throws, nothing is written. `mutate` must be synchronous:
   * returning a Promise rejects and writes nothing.
   */
  mutate<R>(mutate: (records: T[]) => R): Promise<R> {
    const run = this.#queue.then(() => this.#backend.withLock((assertOwned) => this.#mutateLocked(mutate, assertOwned)));
    this.#queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async #mutateLocked<R>(mutate: (records: T[]) => R, assertOwned: AssertOwned): Promise<R> {
    const document = await this.#readDocument(true);
    const result = mutate(document.records);
    if (isObject(result) && typeof result.then === "function") {
      throw new TypeError(`[${this.#options.label}] mutate callbacks must be synchronous; nothing was written`);
    }
    const invalid = document.records.findIndex((record) => !this.#options.schema.is(record));
    if (invalid !== -1) {
      throw new ConnectorError(
        this.#options.label,
        `refusing to write invalid record at index ${invalid} (fields: ${this.#options.schema.problems(document.records[invalid]).join(", ")})`,
      );
    }
    await assertOwned();
    await this.#write(document);
    return result;
  }

  /** `lockHeld` avoids re-acquiring the (non-reentrant) lock when seeding inside a mutation. */
  async #readDocument(lockHeld: boolean): Promise<CollectionDocument<T>> {
    const text = await withSimulatedLatency(() => this.#readText(lockHeld), this.#options.latency);
    return this.#parse(text);
  }

  async #readText(lockHeld: boolean): Promise<string> {
    const existing = await this.#backend.read();
    if (existing !== undefined) return existing;
    if (lockHeld) await this.#seedIfMissingLocked();
    else await this.#backend.withLock(() => this.#seedIfMissingLocked());
    const seeded = await this.#backend.read();
    if (seeded === undefined) {
      throw new ConnectorError(this.#options.label, `${this.#backend.location} disappeared right after seeding`);
    }
    return seeded;
  }

  async #seedIfMissingLocked(): Promise<void> {
    if ((await this.#backend.read()) !== undefined) return; // another writer seeded it while we waited
    await this.#backend.write(this.#serialize({ schemaVersion: SCHEMA_VERSION, records: this.#options.seed() }));
  }

  #parse(text: string): CollectionDocument<T> {
    const { label, schema } = this.#options;
    const where = this.#backend.location;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new ConnectorError(label, `data file ${where} is not valid JSON; run \`pnpm data:reset\` to reseed`, {
        cause: err,
      });
    }
    if (!isObject(parsed) || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.records)) {
      throw new ConnectorError(label, `data file ${where} has an unexpected shape; run \`pnpm data:reset\` to reseed`);
    }
    const records: T[] = [];
    for (const [index, record] of parsed.records.entries()) {
      if (!schema.is(record)) {
        throw new ConnectorError(label, `record ${index} in ${where} is invalid (fields: ${schema.problems(record).join(", ")})`);
      }
      records.push(record);
    }
    return { schemaVersion: SCHEMA_VERSION, records };
  }

  #serialize(document: CollectionDocument<T>): string {
    return `${JSON.stringify(document, null, 2)}\n`;
  }

  async #write(document: CollectionDocument<T>): Promise<void> {
    await withSimulatedLatency(() => this.#backend.write(this.#serialize(document)), this.#options.latency);
  }
}
