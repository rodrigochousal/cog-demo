#!/usr/bin/env node
/**
 * Enforces the BFF architecture's import boundaries. Run with `pnpm lint:boundaries`.
 *
 *  apps/<x>                  -> may depend on @platform/shared-types and ui-shared only (both required);
 *                               talks to its BFF through ui-shared's apiClient, so app source never
 *                               calls fetch. No backend packages, Node built-ins or database/infra clients.
 *                               src/ holds only app/, pages/, common/ and features/. Server state is
 *                               TanStack Query: no useEffect in app source, and useQuery/useMutation
 *                               are only called from src/features/<feature>/api/.
 *  packages/ui-shared        -> npm packages + @platform/shared-types; src/api/api-client.ts is the
 *                               only file in any frontend that may call fetch.
 *  services/<x>              -> may depend on @platform/backend-common and @platform/shared-types.
 *                               Never on another service or any app. Source may not touch the
 *                               file system: data goes through backend-common connectors.
 *  packages/backend-common   -> npm packages + @platform/shared-types only. Never services/* or apps/*.
 *                               Vendor edge modules (src/connectors/<x>/vendors/*) may only be imported
 *                               from their own connector directory, so vendor shapes never leak.
 *  packages/shared-types     -> no dependency but `zod` (its runtime contracts); imports nothing else outside itself.
 *  everywhere                -> relative imports may not escape their own workspace package.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_EXT = /\.(c|m)?(t|j)sx?$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", ".turbo", "coverage"]);
const IMPORT_RE =
  /(?:^|[^\w$.])(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\sfrom\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;
const DB_AND_INFRA_CLIENTS = [
  "pg", "postgres", "mysql", "mysql2", "sqlite3", "better-sqlite3", "mongodb", "mongoose", "redis", "ioredis",
  "knex", "typeorm", "sequelize", "drizzle-orm", "@prisma/client", "prisma", "@supabase/supabase-js",
  "firebase", "firebase-admin", "@aws-sdk", "aws-sdk", "@google-cloud", "@azure", "axios",
];
const FS_MODULES = new Set(["fs", "node:fs", "fs/promises", "node:fs/promises"]);
/** The only package shared-types may depend on / import: its schemas are the contracts' source of truth. */
const SHARED_TYPES_ALLOWED = new Set(["zod"]);
const NODE_BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));

const violations = [];
const fail = (file, msg) => violations.push(`${path.relative(root, file)}: ${msg}`);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (SOURCE_EXT.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

const packageName = (spec) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
const isRelative = (spec) => spec.startsWith(".") || spec.startsWith("/");

function importsOf(file) {
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1");
  return [...src.matchAll(IMPORT_RE)].map((m) => m[1] ?? m[2] ?? m[3]).filter(Boolean);
}

function listWorkspaces(group) {
  const dir = path.join(root, group);
  return readdirSync(dir)
    .filter((n) => statSync(path.join(dir, n)).isDirectory())
    .map((n) => {
      const pkgDir = path.join(dir, n);
      return { name: n, dir: pkgDir, pkg: JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8")) };
    });
}

const apps = listWorkspaces("apps");
const services = listWorkspaces("services");
const packages = listWorkspaces("packages");
const appPkgs = new Set(apps.map((w) => w.pkg.name));
const servicePkgs = new Set(services.map((w) => w.pkg.name));
const allDeps = (pkg) => ({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies });

/** Checks each import in a workspace with `rule(spec, file)` returning an error string or null. */
function checkWorkspace(ws, rule) {
  for (const file of walk(ws.dir)) {
    for (const spec of importsOf(file)) {
      if (isRelative(spec)) {
        const target = path.resolve(path.dirname(file), spec);
        if (!target.startsWith(ws.dir + path.sep)) fail(file, `relative import '${spec}' escapes its workspace package`);
        continue;
      }
      const err = rule(spec, file);
      if (err) fail(file, err);
    }
  }
}

// ---- apps/* -----------------------------------------------------------------
const APP_SRC_LAYERS = new Set(["app", "pages", "common", "features"]);
const FETCH_RE = /(?:^|[^\w.])fetch\s*\(/m;
const EFFECT_RE = /\buse(?:Layout|Insertion)?Effect\b/;
const QUERY_HOOK_RE = /\b(?:useQuery|useMutation|useSuspenseQuery|useInfiniteQuery|useQueries)\s*\(/;
for (const app of apps) {
  const pkgFile = path.join(app.dir, "package.json");
  const deps = allDeps(app.pkg);
  for (const dep of Object.keys(deps)) {
    if (dep.startsWith("@platform/") && dep !== "@platform/shared-types") fail(pkgFile, `apps may only depend on @platform/shared-types, found ${dep}`);
    if (DB_AND_INFRA_CLIENTS.some((c) => dep === c || dep.startsWith(`${c}/`))) fail(pkgFile, `apps must not depend on database/infra client '${dep}'`);
    if (dep === "@tanstack/react-table") fail(pkgFile, "apps render tables through ui-shared's <CoreDataTable />, not @tanstack/react-table directly");
  }
  if (app.pkg.dependencies?.["ui-shared"] !== "workspace:*") fail(pkgFile, `apps must depend on "ui-shared": "workspace:*"`);
  checkWorkspace(app, (spec, file) => {
    const name = packageName(spec);
    const isConfig = !file.startsWith(path.join(app.dir, "src") + path.sep);
    if (name.startsWith("@platform/") && name !== "@platform/shared-types") return `apps may not import ${name}; call the paired BFF over HTTP instead`;
    if (DB_AND_INFRA_CLIENTS.includes(name)) return `apps may not import database/infra client '${name}'`;
    if (NODE_BUILTINS.has(name) && !isConfig) return `app source may not import Node built-in '${spec}' (no server-side data access in apps)`;
    if (name === "ui-shared" && spec !== name) return `import ui-shared through its entry point, not '${spec}'`;
    return null;
  });
  const srcDir = path.join(app.dir, "src");
  for (const entry of readdirSync(srcDir)) {
    if (!APP_SRC_LAYERS.has(entry)) fail(path.join(srcDir, entry), "app src/ may only contain app/, pages/, common/ and features/");
  }
  for (const file of walk(srcDir)) {
    const src = readFileSync(file, "utf8");
    if (FETCH_RE.test(src)) fail(file, "app source may not call fetch; use apiClient.getParsed / postParsed from ui-shared");
    if (EFFECT_RE.test(src)) fail(file, "app source may not use effects; server state belongs to TanStack Query hooks in src/features/<feature>/api/");
    const [layer, , sub] = path.relative(srcDir, file).split(path.sep);
    if (QUERY_HOOK_RE.test(src) && !(layer === "features" && sub === "api")) {
      fail(file, "useQuery/useMutation may only be called from src/features/<feature>/api/");
    }
  }
}

// ---- packages/ui-shared: the single network edge of every frontend ---------------
const uiShared = packages.find((p) => p.pkg.name === "ui-shared");
if (uiShared) {
  const clientFile = path.join(uiShared.dir, "src/api/api-client.ts");
  for (const file of walk(path.join(uiShared.dir, "src"))) {
    if (file !== clientFile && FETCH_RE.test(readFileSync(file, "utf8"))) fail(file, "only ui-shared/src/api/api-client.ts may call fetch");
  }
} else {
  fail(path.join(root, "packages"), "packages/ui-shared is missing");
}

// ---- services/* -------------------------------------------------------------
for (const svc of services) {
  const pkgFile = path.join(svc.dir, "package.json");
  for (const dep of Object.keys(allDeps(svc.pkg))) {
    if (servicePkgs.has(dep) || appPkgs.has(dep)) fail(pkgFile, `services must not depend on other services or apps (${dep})`);
  }
  checkWorkspace(svc, (spec, file) => {
    const name = packageName(spec);
    if (servicePkgs.has(name) || appPkgs.has(name)) return `services may not import ${name}; move shared code to @platform/backend-common`;
    if (name.startsWith("@platform/") && spec !== name) return `import ${name} through its entry point, not '${spec}'`;
    const inSrc = file.startsWith(path.join(svc.dir, "src") + path.sep);
    if (inSrc && FS_MODULES.has(spec)) return `service source may not import '${spec}'; resolve data through the backend-common connector hub (getLedgerDatabase() etc.)`;
    return null;
  });
}

// ---- packages/* -------------------------------------------------------------
for (const p of packages) {
  const pkgFile = path.join(p.dir, "package.json");
  if (p.pkg.name === "@platform/shared-types") {
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      for (const dep of Object.keys(p.pkg[field] ?? {})) {
        if (!SHARED_TYPES_ALLOWED.has(dep)) fail(pkgFile, `shared-types may only depend on zod, found ${field} '${dep}'`);
      }
    }
    checkWorkspace(p, (spec) =>
      SHARED_TYPES_ALLOWED.has(packageName(spec)) ? null : `shared-types must be self-contained (zod aside), found import '${spec}'`,
    );
    continue;
  }
  for (const dep of Object.keys(allDeps(p.pkg))) {
    if (servicePkgs.has(dep) || appPkgs.has(dep)) fail(pkgFile, `${p.pkg.name} must not depend on ${dep}`);
  }
  checkWorkspace(p, (spec) => {
    const name = packageName(spec);
    if (servicePkgs.has(name) || appPkgs.has(name)) return `${p.pkg.name} is closed and may not import ${name}`;
    if (name.startsWith("@platform/") && name !== "@platform/shared-types") return `${p.pkg.name} may only import @platform/shared-types from the workspace, found ${name}`;
    return null;
  });
}

// ---- vendor edge types stay inside their connector -------------------------
const backendCommon = packages.find((p) => p.pkg.name === "@platform/backend-common");
if (backendCommon) {
  const connectorsDir = path.join(backendCommon.dir, "src/connectors");
  for (const file of walk(path.join(backendCommon.dir, "src"))) {
    for (const spec of importsOf(file)) {
      if (!isRelative(spec)) continue;
      const [connector, folder] = path.relative(connectorsDir, path.resolve(path.dirname(file), spec)).split(path.sep);
      if (connector === undefined || connector === ".." || folder !== "vendors") continue;
      if (!file.startsWith(path.join(connectorsDir, connector) + path.sep)) {
        fail(file, `vendor edge module '${spec}' may only be imported inside src/connectors/${connector}/; use the domain types instead`);
      }
    }
  }
}

if (violations.length) {
  console.error(`✖ ${violations.length} architecture boundary violation(s):\n`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`✔ Boundaries OK (${apps.length} apps, ${services.length} services, ${packages.length} packages)`);
