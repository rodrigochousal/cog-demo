import { describe, expect, it } from "vitest";
import { computeDelta, REDACTED, snapshotRecord } from "../src/index.js";

describe("computeDelta", () => {
  it("create: oldValue null, newValue is the full record", () => {
    const record = { id: "r1", amount: 100, meta: { tags: ["a"] } };
    expect(computeDelta(null, record)).toEqual({ oldValue: null, newValue: record });
    expect(computeDelta(undefined, record).oldValue).toBeNull();
  });

  it("delete: oldValue is the full record, newValue null", () => {
    const record = { id: "r1", status: "OPEN" };
    expect(computeDelta(record, null)).toEqual({ oldValue: record, newValue: null });
  });

  it("update: keeps only changed keys, recursing into nested objects", () => {
    const before = { id: "r1", status: "OPEN", amount: 100, owner: { id: "u1", name: "Ann", team: "ops" } };
    const after = { id: "r1", status: "APPROVED", amount: 100, owner: { id: "u1", name: "Ann", team: "risk" } };
    expect(computeDelta(before, after)).toEqual({
      oldValue: { status: "OPEN", owner: { team: "ops" } },
      newValue: { status: "APPROVED", owner: { team: "risk" } },
    });
  });

  it("update: added keys only appear in newValue, removed keys only in oldValue", () => {
    expect(computeDelta({ a: 1, gone: true }, { a: 1, added: "x" })).toEqual({
      oldValue: { gone: true },
      newValue: { added: "x" },
    });
  });

  it("update: compares arrays whole and treats null as a real value", () => {
    expect(computeDelta({ tags: ["a", "b"], note: null }, { tags: ["a", "c"], note: "hi" })).toEqual({
      oldValue: { tags: ["a", "b"], note: null },
      newValue: { tags: ["a", "c"], note: "hi" },
    });
    expect(computeDelta({ tags: ["a"] }, { tags: ["a"] })).toEqual({ oldValue: {}, newValue: {} });
  });

  it("update with no changes yields two empty objects", () => {
    expect(computeDelta({ a: { b: 1 } }, { a: { b: 1 } })).toEqual({ oldValue: {}, newValue: {} });
  });

  it("is pure: inputs are untouched and outputs never alias them", () => {
    const before = { nested: { list: [1, 2] } };
    const after = { nested: { list: [1, 3] } };
    const frozen = JSON.stringify([before, after]);
    const delta = computeDelta(before, after);
    expect(JSON.stringify([before, after])).toBe(frozen);
    const newNested = delta.newValue?.nested as { list: number[] };
    newNested.list.push(99);
    expect(after.nested.list).toEqual([1, 3]);
  });

  it("produces JSON-safe output (Dates, bigint, undefined, functions, cycles)", () => {
    const cyclic: Record<string, unknown> = { id: "c" };
    cyclic.self = cyclic;
    const created = new Date("2026-01-02T03:04:05.000Z");
    const delta = computeDelta(null, { created, big: 10n, skip: undefined, fn: () => 1, cyclic, nan: Number.NaN });
    expect(delta.newValue).toEqual({
      created: "2026-01-02T03:04:05.000Z",
      big: "10",
      cyclic: { id: "c", self: "[Circular]" },
      nan: "NaN",
    });
    expect(() => JSON.stringify(delta)).not.toThrow();
  });

  it("does not treat shared (non-cyclic) references as circular", () => {
    const shared = { x: 1 };
    expect(computeDelta(null, { a: shared, b: shared }).newValue).toEqual({ a: { x: 1 }, b: { x: 1 } });
  });

  it("redacts sensitive keys at any depth, but still reveals that they changed", () => {
    const delta = computeDelta(
      { user: { password: "old", name: "a" }, card_number: "4111" },
      { user: { password: "new", name: "a" }, card_number: "4111" },
    );
    expect(delta).toEqual({ oldValue: { user: { password: REDACTED } }, newValue: { user: { password: REDACTED } } });
    expect(computeDelta(null, { apiKey: "k", nested: [{ CVV: "123" }] }).newValue).toEqual({
      apiKey: REDACTED,
      nested: [{ CVV: REDACTED }],
    });
    expect(computeDelta(null, { token: "t" }, { redactKeys: [] }).newValue).toEqual({ token: "t" });
  });

  it("keeps __proto__ keys as plain data", () => {
    const parsed: unknown = JSON.parse('{"__proto__": {"polluted": true}, "a": 1}');
    const delta = computeDelta(null, parsed);
    expect(Object.keys(delta.newValue ?? {})).toEqual(["__proto__", "a"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("wraps non-object states so deltas are always keyed", () => {
    expect(snapshotRecord(5)).toEqual({ value: 5 });
    expect(snapshotRecord([1, 2])).toEqual({ value: [1, 2] });
    expect(computeDelta("a", "b")).toEqual({ oldValue: { value: "a" }, newValue: { value: "b" } });
  });
});
