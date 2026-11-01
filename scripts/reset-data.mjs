#!/usr/bin/env node
/** Deletes the local JSON data directory. Collections are re-seeded on next access. */
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.env.PLATFORM_DATA_DIR
  ? path.resolve(process.env.PLATFORM_DATA_DIR)
  : path.join(root, "packages/backend-common/data");
rmSync(dir, { recursive: true, force: true });
console.log(`Removed ${dir}`);
