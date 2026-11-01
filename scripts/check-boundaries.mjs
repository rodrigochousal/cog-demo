#!/usr/bin/env node
/**
 * Enforces the BFF architecture's import boundaries. Run with `pnpm lint:boundaries`.
 *
 *  apps/<x>                  -> may depend on @platform/shared-types only; talks to its BFF via
 *                               src/lib/api-client.ts (the only file allowed to call fetch).
 *                               No backend packages, Node built-ins or database/infra clients.
 *  services/<x>              -> may depend on @platform/backend-common and @platform/shared-types.
 *                               Never on another service or any app. Source may not touch the
 *                               file system: data goes through backend-common connectors.
 *  packages/backend-common   -> npm packages + @platform/shared-types only. Never services/* or apps/*.
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
for (const app of apps) {
  const pkgFile = path.join(app.dir, "package.json");
  for (const dep of Object.keys(allDeps(app.pkg))) {
    if (dep.startsWith("@platform/") && dep !== "@platform/shared-types") fail(pkgFile, `apps may only depend on @platform/shared-types, found ${dep}`);
    if (DB_AND_INFRA_CLIENTS.some((c) => dep === c || dep.startsWith(`${c}/`))) fail(pkgFile, `apps must not depend on database/infra client '${dep}'`);
  }
  const apiClient = path.join(app.dir, "src/lib/api-client.ts");
  checkWorkspace(app, (spec, file) => {
    const name = packageName(spec);
    const isConfig = !file.startsWith(path.join(app.dir, "src") + path.sep);
    if (name.startsWith("@platform/") && name !== "@platform/shared-types") return `apps may not import ${name}; call the paired BFF over HTTP instead`;
    if (DB_AND_INFRA_CLIENTS.includes(name)) return `apps may not import database/infra client '${name}'`;
    if (NODE_BUILTINS.has(name) && !isConfig) return `app source may not import Node built-in '${spec}' (no server-side data access in apps)`;
    return null;
  });
  for (const file of walk(path.join(app.dir, "src"))) {
    if (file !== apiClient && /(?:^|[^\w.])fetch\s*\(/m.test(readFileSync(file, "utf8"))) {
      fail(file, "only src/lib/api-client.ts may call fetch (all traffic goes to the paired BFF)");
    }
  }
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

if (violations.length) {
  console.error(`✖ ${violations.length} architecture boundary violation(s):\n`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`✔ Boundaries OK (${apps.length} apps, ${services.length} services, ${packages.length} packages)`);
