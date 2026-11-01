import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StorageMode } from "../src/config.js";
import { ConnectorError } from "../src/connectors/errors.js";
import { JsonCollection } from "../src/connectors/json-collection.js";
import { defineSchema, isNonEmptyString } from "../src/connectors/schema.js";

interface Item {
  id: string;
  n: number;
}

const itemSchema = defineSchema<Item>({
  id: isNonEmptyString,
  n: (value): value is number => typeof value === "number",
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "collection-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const fileOf = (name = "items") => path.join(dir, `${name}.json`);
const open = (mode: StorageMode, name = "items") =>
  new JsonCollection<Item>({
    label: name,
    filePath: fileOf(name),
    mode,
    schema: itemSchema,
    seed: () => [{ id: "a", n: 1 }],
    latency: false,
  });
const onDisk = (name = "items"): unknown => JSON.parse(readFileSync(fileOf(name), "utf8"));
const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (err: unknown) => err,
  );

describe.each<StorageMode>(["file", "memory"])("%s collection", (mode) => {
  it("seeds, commits and isolates reads", async () => {
    const items = open(mode);
    expect(await items.readAll()).toEqual([{ id: "a", n: 1 }]);
    await items.mutate((records) => records.push({ id: "b", n: 2 }));
    const snapshot = await items.readAll();
    snapshot[0]!.n = 99;
    snapshot.push({ id: "z", n: 0 });
    expect(await items.readAll()).toEqual([
      { id: "a", n: 1 },
      { id: "b", n: 2 },
    ]);
  });

  it("returns the callback's result", async () => {
    expect(await open(mode).mutate((records) => records.length)).toBe(1);
  });

  it("rolls back when the mutation throws", async () => {
    const items = open(mode);
    const err = await rejection(
      items.mutate((records) => {
        records[0]!.n = 2;
        records.push({ id: "b", n: 2 });
        throw new Error("boom");
      }),
    );
    expect(err).toEqual(new Error("boom"));
    expect(await items.readAll()).toEqual([{ id: "a", n: 1 }]);
  });

  it("rejects async callbacks without writing", async () => {
    const items = open(mode);
    const err = await rejection(
      items.mutate(async (records) => {
        records.push({ id: "b", n: 2 });
      }),
    );
    expect(err).toBeInstanceOf(TypeError);
    expect((err as TypeError).message).toMatch(/must be synchronous/);
    expect(await items.readAll()).toEqual([{ id: "a", n: 1 }]);
  });

  it("refuses to write records that fail the schema", async () => {
    const items = open(mode);
    const err = await rejection(
      items.mutate((records) => {
        records.push({ id: "", n: 2 });
      }),
    );
    expect(err).toBeInstanceOf(ConnectorError);
    expect((err as Error).message).toMatch(/invalid record at index 1 \(fields: id\)/);
    expect(await items.readAll()).toEqual([{ id: "a", n: 1 }]);
  });

  it("keeps the next mutation working after a failed one", async () => {
    const items = open(mode);
    const failed = items.mutate(() => {
      throw new Error("boom");
    });
    const next = items.mutate((records) => records.push({ id: "b", n: 2 }));
    await rejection(failed);
    await next;
    expect(await items.readAll()).toHaveLength(2);
  });
});

describe("file mode", () => {
  it("persists to disk across instances", async () => {
    await open("file").mutate((records) => {
      records[0]!.n = 5;
    });
    expect(onDisk()).toEqual({ schemaVersion: 1, records: [{ id: "a", n: 5 }] });
    expect(await open("file").readAll()).toEqual([{ id: "a", n: 5 }]);
  });

  it("reclaims a lock left by a dead process", async () => {
    const items = open("file");
    await items.initialize();
    writeFileSync(`${fileOf()}.lock`, "2147483646:dead");
    await items.mutate((records) => {
      records[0]!.n = 1;
    });
    expect(onDisk()).toEqual({ schemaVersion: 1, records: [{ id: "a", n: 1 }] });
    expect(existsSync(`${fileOf()}.lock`)).toBe(false);
  });

  it("aborts instead of writing when the lock was taken over", async () => {
    const items = open("file");
    await items.initialize();
    const err = await rejection(
      items.mutate((records) => {
        records[0]!.n = 2;
        writeFileSync(`${fileOf()}.lock`, `${process.pid}:someone-else`);
      }),
    );
    expect(err).toBeInstanceOf(ConnectorError);
    expect((err as Error).message).toMatch(/lost lock/);
    expect(onDisk()).toEqual({ schemaVersion: 1, records: [{ id: "a", n: 1 }] });
    expect(readFileSync(`${fileOf()}.lock`, "utf8")).toBe(`${process.pid}:someone-else`);
  });

  it("does not steal a lock held by a live process", async () => {
    const items = open("file");
    await items.initialize();
    writeFileSync(`${fileOf()}.lock`, `${process.pid}:live`);
    const err = await rejection(items.mutate(() => undefined));
    expect((err as Error).message).toMatch(/timed out acquiring lock/);
    expect(onDisk()).toEqual({ schemaVersion: 1, records: [{ id: "a", n: 1 }] });
  }, 10_000);
});

describe("memory mode", () => {
  it("never touches disk and does not share state between instances", async () => {
    const a = open("memory");
    await a.mutate((records) => records.push({ id: "b", n: 2 }));
    expect(await a.readAll()).toHaveLength(2);
    expect(await open("memory").readAll()).toHaveLength(1);
    expect(readdirSync(dir)).toEqual([]);
  });
});
