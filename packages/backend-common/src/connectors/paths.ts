import path from "node:path";
import { fileURLToPath } from "node:url";

/** `packages/backend-common/` — this file sits at the same depth in `src/` and `dist/`. */
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Default home of the connector JSON files: `packages/backend-common/data/`. */
export const DEFAULT_CONNECTOR_DATA_DIR = path.join(PACKAGE_ROOT, "data");
