#!/usr/bin/env node
/** Deletes the local JSON stores and connector data. Both are re-created from their seeds on next access. */
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fromEnv = (name, fallback) => (process.env[name] ? path.resolve(process.env[name]) : fallback);
const dirs = [
  fromEnv("PLATFORM_DATA_DIR", path.join(root, ".data")),
  fromEnv("PLATFORM_CONNECTOR_DATA_DIR", path.join(root, "packages/backend-common/data")),
];
for (const dir of dirs) {
  rmSync(dir, { recursive: true, force: true });
  console.log(`Removed ${dir}`);
}
