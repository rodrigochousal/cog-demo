import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
