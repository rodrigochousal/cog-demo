import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ConnectorError } from "./errors.js";
import { delay, withSimulatedLatency, type LatencySetting } from "./latency.js";
import { isObject, type RecordSchema } from "./schema.js";

const SCHEMA_VERSION = 1;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_RETRY_MS = 10;

/** On-disk envelope of every connector data file. */
interface CollectionDocument<T> {
  schemaVersion: typeof SCHEMA_VERSION;
  records: T[];
}

export interface JsonCollectionOptions<T> {
  /** Connector name used in error messages, e.g. `ledger`. */
  label: string;
  filePath: string;
  schema: RecordSchema<T>;
  /** Records written when the file does not exist yet. */
  seed: () => T[];
  latency: LatencySetting;
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

/**
 * Async JSON-file collection: the storage engine behind the Disk* connectors.
 *
 * - Seeds the file (and its directory) on first access, and again if it is deleted while running.
 * - Every read and write goes through {@link withSimulatedLatency}.
 * - Mutations are serialised in-process (promise queue) and across processes
 *   (`<file>.lock` holding `pid:token`; reclaimed only if that pid is dead), and
 *   written atomically via temp file + rename, so readers never see partial JSON.
 * - Records read from disk are validated against `schema`; corrupt files raise a ConnectorError.
 */
export class JsonCollection<T> {
  readonly #options: JsonCollectionOptions<T>;
  readonly #file: string;
  #queue: Promise<void> = Promise.resolve();

  constructor(options: JsonCollectionOptions<T>) {
    this.#options = options;
    this.#file = path.resolve(options.filePath);
  }

  /** Creates and seeds the data file if it does not exist. Idempotent. */
  async initialize(): Promise<void> {
    await this.#readDocument(false);
  }

  /** Returns every record (fresh objects; mutating them does not affect storage). */
  async readAll(): Promise<T[]> {
    return (await this.#readDocument(false)).records;
  }

  /**
   * Applies `mutate` to the current records under an exclusive lock and persists
   * the result. If `mutate` throws, nothing is written. `mutate` must be synchronous.
   */
  mutate<R>(mutate: (records: T[]) => R): Promise<R> {
    const run = this.#queue.then(() => this.#withFileLock((assertOwned) => this.#mutateLocked(mutate, assertOwned)));
    this.#queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async #mutateLocked<R>(mutate: (records: T[]) => R, assertOwned: () => Promise<void>): Promise<R> {
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

  /** `lockHeld` avoids re-acquiring the (non-reentrant) file lock when seeding inside a mutation. */
  async #readDocument(lockHeld: boolean): Promise<CollectionDocument<T>> {
    const text = await withSimulatedLatency(() => this.#readText(lockHeld), this.#options.latency);
    return this.#parse(text);
  }

  async #readText(lockHeld: boolean): Promise<string> {
    try {
      return await readFile(this.#file, "utf8");
    } catch (err) {
      if (errorCode(err) !== "ENOENT") throw this.#ioError("could not read", err);
    }
    if (lockHeld) await this.#seedIfMissingLocked();
    else await this.#withFileLock(() => this.#seedIfMissingLocked());
    try {
      return await readFile(this.#file, "utf8");
    } catch (err) {
      throw this.#ioError("could not read freshly seeded", err);
    }
  }

  async #seedIfMissingLocked(): Promise<void> {
    try {
      await readFile(this.#file, "utf8");
      return; // another writer seeded it while we waited for the lock
    } catch (err) {
      if (errorCode(err) !== "ENOENT") throw this.#ioError("could not read", err);
    }
    await this.#write({ schemaVersion: SCHEMA_VERSION, records: this.#options.seed() });
  }

  #parse(text: string): CollectionDocument<T> {
    const { label, schema } = this.#options;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new ConnectorError(label, `data file ${this.#file} is not valid JSON; run \`pnpm data:reset\` to reseed`, {
        cause: err,
      });
    }
    if (!isObject(parsed) || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.records)) {
      throw new ConnectorError(label, `data file ${this.#file} has an unexpected shape; run \`pnpm data:reset\` to reseed`);
    }
    const records: T[] = [];
    for (const [index, record] of parsed.records.entries()) {
      if (!schema.is(record)) {
        throw new ConnectorError(
          label,
          `record ${index} in ${this.#file} is invalid (fields: ${schema.problems(record).join(", ")})`,
        );
      }
      records.push(record);
    }
    return { schemaVersion: SCHEMA_VERSION, records };
  }

  async #write(document: CollectionDocument<T>): Promise<void> {
    const tmp = `${this.#file}.${process.pid}.${randomUUID()}.tmp`;
    await withSimulatedLatency(async () => {
      try {
        await mkdir(path.dirname(this.#file), { recursive: true });
        await writeFile(tmp, `${JSON.stringify(document, null, 2)}\n`, "utf8");
        await rename(tmp, this.#file);
      } catch (err) {
        await rm(tmp, { force: true });
        throw this.#ioError("could not write", err);
      }
    }, this.#options.latency);
  }

  /** `fn` gets an `assertOwned` guard to await right before committing. */
  async #withFileLock<R>(fn: (assertOwned: () => Promise<void>) => Promise<R>): Promise<R> {
    const lockFile = `${this.#file}.lock`;
    const token = `${process.pid}:${randomUUID()}`;
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    await mkdir(path.dirname(this.#file), { recursive: true }).catch((err: unknown) => {
      throw this.#ioError("could not create data directory for", err);
    });
    for (;;) {
      try {
        await writeFile(lockFile, token, { flag: "wx" });
        break;
      } catch (err) {
        if (errorCode(err) !== "EEXIST") throw this.#ioError("could not lock", err);
        await this.#removeLockIfOwnerDead(lockFile);
        if (Date.now() > deadline) throw new ConnectorError(this.#options.label, `timed out acquiring lock on ${this.#file}`);
        await delay(LOCK_RETRY_MS);
      }
    }
    const owned = async () => (await readFile(lockFile, "utf8").catch(() => undefined)) === token;
    try {
      return await fn(async () => {
        if (!(await owned())) throw new ConnectorError(this.#options.label, `lost lock on ${this.#file}; write aborted`);
      });
    } finally {
      if (await owned()) await rm(lockFile, { force: true });
    }
  }

  async #removeLockIfOwnerDead(lockFile: string): Promise<void> {
    const holder = await readFile(lockFile, "utf8").catch(() => undefined);
    if (holder === undefined) return;
    const pid = Number.parseInt(holder.split(":")[0] ?? "", 10);
    if (Number.isInteger(pid) && pid > 0 && isProcessAlive(pid)) return;
    await rm(lockFile, { force: true });
  }

  #ioError(action: string, err: unknown): ConnectorError {
    return new ConnectorError(this.#options.label, `${action} ${this.#file}`, { cause: err });
  }
}
