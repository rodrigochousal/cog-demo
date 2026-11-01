import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFileStore, createMemoryStore } from "../src/index.js";

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe.each([
  ["memory", () => createMemoryStore("t", () => ({ items: [1] }))],
  [
    "file",
    () => {
      dir = mkdtempSync(path.join(tmpdir(), "bc-"));
      return createFileStore(path.join(dir, "t.json"), () => ({ items: [1] }));
    },
  ],
])("%s store", (_name, make) => {
  it("seeds, commits and isolates reads", () => {
    const store = make();
    expect(store.read()).toEqual({ items: [1] });
    store.transact((d) => d.items.push(2));
    const snapshot = store.read();
    snapshot.items.push(99);
    expect(store.read()).toEqual({ items: [1, 2] });
  });

  it("rolls back when the transaction throws", () => {
    const store = make();
    expect(() =>
      store.transact((d) => {
        d.items.push(2);
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(store.read()).toEqual({ items: [1] });
  });
});

it("file store persists to disk", () => {
  dir = mkdtempSync(path.join(tmpdir(), "bc-"));
  const file = path.join(dir, "persist.json");
  createFileStore(file, () => ({ n: 0 })).transact((d) => {
    d.n = 5;
  });
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ n: 5 });
  expect(createFileStore(file, () => ({ n: 0 })).read()).toEqual({ n: 5 });
});

describe.each([
  ["memory", () => createMemoryStore("a", () => ({ items: [1] }))],
  [
    "file",
    () => {
      dir = mkdtempSync(path.join(tmpdir(), "bc-"));
      return createFileStore(path.join(dir, "a.json"), () => ({ items: [1] }));
    },
  ],
])("%s store async guard", (_name, make) => {
  it("rejects async callbacks without committing", () => {
    const store = make();
    expect(() =>
      store.transact(async (d) => {
        d.items.push(2);
      }),
    ).toThrow(/must be synchronous/);
    expect(store.read()).toEqual({ items: [1] });
  });
});

describe("file store locking", () => {
  it("reclaims a lock left by a dead process", () => {
    dir = mkdtempSync(path.join(tmpdir(), "bc-"));
    const file = path.join(dir, "l.json");
    const store = createFileStore(file, () => ({ n: 0 }));
    store.read();
    writeFileSync(`${file}.lock`, "2147483646:dead");
    store.transact((d) => {
      d.n = 1;
    });
    expect(store.read()).toEqual({ n: 1 });
    expect(existsSync(`${file}.lock`)).toBe(false);
  });

  it("aborts instead of committing when the lock was taken over", () => {
    dir = mkdtempSync(path.join(tmpdir(), "bc-"));
    const file = path.join(dir, "l.json");
    const store = createFileStore(file, () => ({ n: 0 }));
    expect(() =>
      store.transact((d) => {
        d.n = 1;
        writeFileSync(`${file}.lock`, `${process.pid}:someone-else`);
      }),
    ).toThrow(/Lost lock/);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ n: 0 });
    expect(readFileSync(`${file}.lock`, "utf8")).toBe(`${process.pid}:someone-else`);
  });

  it("does not steal a lock held by a live process", () => {
    dir = mkdtempSync(path.join(tmpdir(), "bc-"));
    const file = path.join(dir, "l.json");
    const store = createFileStore(file, () => ({ n: 0 }));
    store.read();
    writeFileSync(`${file}.lock`, `${process.pid}:live`);
    expect(() => store.transact(() => undefined)).toThrow(/Timed out/);
  }, 10_000);
});
