import path from "node:path";
import type { z } from "zod";
import type { StorageMode } from "../config.js";
import { notFound } from "../errors.js";
import { ConnectorError, indexOrThrow } from "./errors.js";
import { JsonCollection } from "./json-collection.js";
import type { LatencySetting } from "./latency.js";
import type { RecordSchema } from "./schema.js";

/**
 * The edge of a connector: one external vendor's record shape (`E`, e.g. `StripeRefund`) and
 * its lossless mapping to and from the platform's generic domain type (`D`, e.g. `Refund`).
 * Edge types never leave their adapter module; drivers, services and apps only see `D`.
 */
export interface VendorAdapter<E, D> {
  /** Vendor name, e.g. `stripe`. Used in log labels. */
  vendor: string;
  /** Data file (inside the data dir) that mocks this vendor's API. */
  fileName: string;
  /** Validates the vendor's records as stored on disk. Must not transform. */
  schema: z.ZodType<E>;
  /** Realistic mock records in the vendor's own shape. */
  seed(): E[];
  toDomain(edge: E): D;
  toEdge(record: D): E;
}

/** What a driver sees of one vendor's records: domain types only. */
export interface DomainCollection<D> {
  readonly vendor: string;
  initialize(): Promise<void>;
  readAll(): Promise<D[]>;
  /** Stores a new record and returns it as read back from the vendor shape. */
  insert(record: D): Promise<D>;
  /**
   * Replaces the record with `id` by `change(current)`, all-or-nothing. `change` must be
   * synchronous; if it throws (e.g. a CONFLICT), nothing is written.
   */
  update(id: string, change: (current: D) => D): Promise<D>;
}

export interface VendorCollectionOptions {
  dataDir: string;
  mode?: StorageMode;
  latency: LatencySetting;
}

/** Adapts a Zod edge schema to the `RecordSchema` that `JsonCollection` checks on read and write. */
export function zodRecordSchema<E>(schema: z.ZodType<E>): RecordSchema<E> {
  const problems = (value: unknown): string[] => {
    const result = schema.safeParse(value);
    if (result.success) return [];
    return [...new Set(result.error.issues.map((issue) => (issue.path.length ? issue.path.join(".") : "<record>")))];
  };
  return {
    problems,
    is: (value): value is E => schema.safeParse(value).success,
    pick: (value) => schema.parse(value),
  };
}

/** A `JsonCollection` of one vendor's edge records, exposed as domain records. */
export class VendorCollection<E, D> implements DomainCollection<D> {
  readonly vendor: string;
  readonly #adapter: VendorAdapter<E, D>;
  readonly #collection: JsonCollection<E>;
  readonly #label: string;
  readonly #entity: string;
  readonly #idOf: (record: D) => string;

  constructor(
    adapter: VendorAdapter<E, D>,
    { dataDir, mode, latency }: VendorCollectionOptions,
    { connector, entity, idOf }: { connector: string; entity: string; idOf: (record: D) => string },
  ) {
    this.vendor = adapter.vendor;
    this.#adapter = adapter;
    this.#label = `${connector}/${adapter.vendor}`;
    this.#entity = entity;
    this.#idOf = idOf;
    this.#collection = new JsonCollection({
      label: this.#label,
      filePath: path.join(dataDir, adapter.fileName),
      mode,
      latency,
      schema: zodRecordSchema(adapter.schema),
      seed: () => adapter.seed(),
    });
  }

  initialize(): Promise<void> {
    return this.#collection.initialize();
  }

  async readAll(): Promise<D[]> {
    return (await this.#collection.readAll()).map((edge) => this.#toDomain(edge));
  }

  insert(record: D): Promise<D> {
    const edge = this.#adapter.toEdge(record);
    return this.#collection.mutate((records) => {
      records.push(edge);
      return this.#toDomain(structuredClone(edge));
    });
  }

  update(id: string, change: (current: D) => D): Promise<D> {
    return this.#collection.mutate((records) => {
      const domain = records.map((edge) => this.#toDomain(edge));
      const index = indexOrThrow(domain, this.#entity, id, this.#idOf);
      const edge = this.#adapter.toEdge(change(domain[index] as D));
      records[index] = edge;
      return this.#toDomain(structuredClone(edge));
    });
  }

  #toDomain(edge: E): D {
    try {
      return this.#adapter.toDomain(edge);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new ConnectorError(this.#label, `could not map a ${this.vendor} record: ${reason}`, { cause: err });
    }
  }
}

/** Every record across `collections`, in collection order. */
export async function readAllFrom<D>(collections: readonly DomainCollection<D>[]): Promise<D[]> {
  return (await Promise.all(collections.map((collection) => collection.readAll()))).flat();
}

/** The collection holding the record with `id`; NOT_FOUND if none does. */
export async function ownerOf<D>(
  collections: readonly DomainCollection<D>[],
  entity: string,
  id: string,
  idOf: (record: D) => string,
): Promise<DomainCollection<D>> {
  const lists = await Promise.all(collections.map((collection) => collection.readAll()));
  const owner = collections[lists.findIndex((list) => list.some((record) => idOf(record) === id))];
  if (!owner) throw notFound(entity, id);
  return owner;
}

/** A one-to-one mapping between a domain enum and a vendor enum, usable in both directions. */
export function bijection<A extends string, B extends string>(forward: Readonly<Record<A, B>>) {
  const entries = Object.entries(forward) as [A, B][];
  return {
    to: (value: A): B => forward[value],
    from(value: B): A {
      const match = entries.find(([, vendorValue]) => vendorValue === value);
      if (!match) throw new Error(`unmapped value '${value}'`);
      return match[0];
    },
  };
}

/** ISO-8601 ↔ epoch milliseconds / seconds, as vendors represent timestamps. */
export const toEpochMs = (iso: string): number => Date.parse(iso);
export const fromEpochMs = (ms: number): string => new Date(ms).toISOString();
export const toEpochSeconds = (iso: string): number => Math.floor(Date.parse(iso) / 1000);
export const fromEpochSeconds = (seconds: number): string => new Date(seconds * 1000).toISOString();
