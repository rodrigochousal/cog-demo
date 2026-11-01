import { afterEach, expect, it } from "vitest";
import { readPort } from "../src/index.js";

afterEach(() => {
  delete process.env.TEST_PORT;
});

it.each(["4000oops", "40.5", "-1", "0", "70000", "abc"])("rejects PORT=%s", (value) => {
  process.env.TEST_PORT = value;
  expect(() => readPort("TEST_PORT", 1)).toThrow(/valid TCP port/);
});

it("accepts a valid port and falls back when unset", () => {
  expect(readPort("TEST_PORT", 4000)).toBe(4000);
  process.env.TEST_PORT = "4123";
  expect(readPort("TEST_PORT", 4000)).toBe(4123);
});
