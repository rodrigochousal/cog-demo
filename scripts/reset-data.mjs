#!/usr/bin/env node
/** Deletes the local JSON stores. Services re-create them from their seed on next access. */
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.PLATFORM_DATA_DIR ? path.resolve(process.env.PLATFORM_DATA_DIR) : path.join(root, ".data");
rmSync(dataDir, { recursive: true, force: true });
console.log(`Removed ${dataDir}`);
