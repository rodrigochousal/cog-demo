# Internal Platform

Shared scaffolding for a suite of internal applications. It is a **pnpm + Turborepo monorepo** using a
**Backend-for-Frontend (BFF) architecture**, and it runs entirely on one machine: no cloud services,
hosted databases, or third-party infrastructure.

| Layer    | Stack                                                                    |
| -------- | ------------------------------------------------------------------------ |
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Table |
| Backend  | Node.js, Express 5, TypeScript                                           |
| Storage  | Local JSON files or in-memory arrays (`packages/backend-common`)         |
| Tooling  | pnpm workspaces, Turborepo, Vitest                                       |

## Layout

```text
apps/                     Frontend UI surfaces (one per team)
  compliance/             Risk & Compliance        → KYC Review Queue      :3000
  finance/                Operations & Support     → Refunds Dashboard     :3001
  engineering/            DevOps & SRE             → Feature-Flag Panel    :3002
services/                 BFFs (one per app; each app's only backend)
  compliance/             Express BFF for apps/compliance                  :4000
  finance/                Express BFF for apps/finance                     :4001
  engineering/            Express BFF for apps/engineering                 :4002
packages/
  backend-common/         Closed backend module shared by every service
  shared-types/           Zero-dependency TypeScript schemas and DTOs
scripts/
  check-boundaries.mjs    Enforces the import rules below (`pnpm lint:boundaries`)
  reset-data.mjs          Wipes local data (`pnpm data:reset`)
```

## The BFF architecture

```text
 apps/compliance ──HTTP──▶ services/compliance ─┐
 apps/finance    ──HTTP──▶ services/finance    ─┼──▶ packages/backend-common ──▶ .data/*.json
 apps/engineering──HTTP──▶ services/engineering─┘
        │                         │                          │
        └──────────────── packages/shared-types ─────────────┘
```

Each frontend in `apps/` has one service in `services/` with the same name, and that service exists
only to serve it. The service is the **only backend its frontend talks to**, and it shapes its
responses around what that frontend's screens need. Code that is, or could be, used by more than one
surface goes in `packages/backend-common`.

### Rules

These rules are architectural. `pnpm lint:boundaries` enforces them, and `pnpm check` runs them too.

1. **`apps/*`: UI only.**
   - Apps contain no database logic and make no direct third-party calls.
   - An app talks only to its own BFF, over HTTP/fetch, through `src/lib/api-client.ts`. This is the only file allowed to call `fetch`. The BFF URL comes from `NEXT_PUBLIC_BFF_URL`.
   - Apps may import `@platform/shared-types`. They may not import `backend-common`, any service, Node built-ins, or DB/cloud SDKs.
2. **`services/*`: one BFF per app.**
   - A service receives requests from its paired app, runs that domain's business rules, and returns payloads shaped for that app's screens.
   - CORS only allows the paired app's origin (`APP_ORIGINS`).
   - Services may import `@platform/backend-common` and `@platform/shared-types`. They never import another service or an app. If two services need the same code, move it into `backend-common`.
3. **`packages/backend-common`: closed and shared.**
   - It may import npm packages and `@platform/shared-types`, and nothing else from the workspace.
   - It knows nothing about any service or app and must never import from `services/*` or `apps/*`.
   - It holds surface-agnostic building blocks: the Express service bootstrap, the error envelope, logging, config, and local storage.
4. **`packages/shared-types`: pure contracts.**
   - It has zero dependencies and no runtime code beyond type-adjacent constants.
   - `src/common.ts` holds cross-cutting types (`Money`, `ApiErrorBody`, `HealthResponse`).
   - `src/domain/*` holds shared domain records.
   - `src/dto/<surface>.ts` holds the screen-shaped request/response types for each app↔BFF pair.
5. **Relative imports never cross a workspace package.** Go through the package's public entry point (`@platform/...`).

### Where does new code go?

| You are adding…                                              | Put it in                                  |
| ------------------------------------------------------------ | ------------------------------------------ |
| A screen, component, or hook for one team                    | `apps/<team>/src/features/<feature>/`      |
| An endpoint, a business rule, or response shaping for that screen | `services/<team>/src/routes/` (+ `policy/`, `presenters/` as it grows) |
| A request/response type for that endpoint                    | `packages/shared-types/src/dto/<team>.ts`  |
| A store, an integration mock, or a rule needed by 2+ services | `packages/backend-common/src/<module>/`    |
| A domain record used by several surfaces                     | `packages/shared-types/src/domain/`        |
| A shadcn/ui primitive                                        | `pnpm dlx shadcn@latest add <component>` inside the app |

## Local storage (no database)

`packages/backend-common` stands in for infrastructure with **document stores**. A document store
holds one JSON document and supports all-or-nothing `transact()` updates.

- **File mode** (the default) persists data to `<repo>/.data/<name>.json`. It writes atomically (to a temp file, then renames it) and takes a cross-process lock file, so several services can share a store safely.
- **Memory mode** (`PLATFORM_STORAGE=memory`) keeps data in in-memory arrays that are lost on restart. It is meant for tests and demos.
- If a transaction callback throws, nothing is committed.
- `transact()` callbacks must be synchronous. If a callback returns a Promise, the call throws and nothing is committed. Do any async work (HTTP, provider calls) before or after the transaction.
- A lock is treated as stale only when the process that owns it has died. A transaction that finds it no longer owns its lock aborts instead of overwriting someone else's commit.

There are two starter stores, and both start empty:

| Store              | API                    | File                  | Stands in for                    |
| ------------------ | ---------------------- | --------------------- | -------------------------------- |
| Transactional ledger | `openLedgerStore()`  | `.data/ledger.json`   | A ledger database (append-only `LedgerEntry[]`) |
| Mock KYC provider  | `openKycMockStore()`   | `.data/kyc-mock.json` | A third-party KYC provider's database |

To add a new store, call `openStore(name, seed)`. Run `pnpm data:reset` to delete all local data.

## Security posture

There is no real authentication yet. Services bind to `127.0.0.1` by default (`HOST`), and CORS only limits which browsers can read responses; it does not authenticate callers. Replace the mock identity middleware below with real authentication before you expose a BFF beyond the local machine.

## Access control (RBAC)

`backend-common` ships a role-based access control engine (`packages/backend-common/src/auth`); the role and user types live in `shared-types` (`UserRole`, `AuthenticatedUser`).

| Role                 | compliance (KYC)   | finance (Refunds)  | engineering (Feature flags) |
| -------------------- | ------------------ | ------------------ | --------------------------- |
| `admin`              | everything         | everything         | everything                  |
| `compliance_analyst` | `read`, `approve`  | —                  | —                           |
| `finance_analyst`    | —                  | `read`, `execute`  | —                           |
| `engineer`           | —                  | —                  | `read`, `toggle`            |

The matrix is declared once in `PERMISSIONS` (`auth/permissions.ts`).

**Mock identity injection.** With no identity provider, `injectMockUser` reads the `x-authenticated-user-role` header and attaches the matching mock profile to `req.user`. If the header is missing it logs a warning to stdout and uses `finance_analyst`. An unknown role gets a 400. Any caller can claim any role, so this is for local development only.

**Route guards.** `requirePermission(resource, action)` lets the request through only if `req.user.role` is allowed to do that action on that resource. Otherwise it returns `403 { "error": "Unauthorized", "reason": "User role does not possess required permissions for this action." }`. It also denies requests when no identity middleware has run (fails closed). Resource and action names are type-checked, so `requirePermission("finance", "toggle")` won't compile.

```ts
import { injectMockUser, requirePermission } from "@platform/backend-common";

app.use("/api", injectMockUser, router);
router.get("/refunds", requirePermission("finance", "read"), listRefunds);
router.post("/refunds/:id/execute", requirePermission("finance", "execute"), executeRefund);
```

## Getting started

Prerequisites: Node.js ≥ 20.9 (see `.nvmrc`) and pnpm, which you can enable with `corepack enable`.

```bash
pnpm install
pnpm dev                 # all 3 apps + all 3 BFFs
pnpm dev:compliance      # one app + its BFF (also dev:finance, dev:engineering)
```

Open http://localhost:3000, http://localhost:3001, and http://localhost:3002. Each app's home page
calls its BFF's `/health` endpoint to confirm the app → BFF wiring works.

### Commands

| Command                | Does                                                    |
| ---------------------- | ------------------------------------------------------- |
| `pnpm dev`             | Runs every app and service in watch mode                |
| `pnpm build`           | Builds all packages, services, and apps (Turborepo, dependency-ordered) |
| `pnpm start`           | Runs the production builds                              |
| `pnpm typecheck`       | Runs `tsc --noEmit` across the workspace                |
| `pnpm test`            | Runs Vitest suites (`backend-common` and each service)  |
| `pnpm lint:boundaries` | Checks the architecture boundary rules                  |
| `pnpm check`           | Runs boundaries, typecheck, test, and build together. Use it before opening a PR |
| `pnpm data:reset`      | Deletes `.data/`                                        |
| `pnpm clean`           | Removes build output and `node_modules`                 |

### Environment variables

Each app and service has a `.env.example`. The defaults work without any `.env` file.

| Variable              | Where     | Default                     | Purpose                                 |
| --------------------- | --------- | --------------------------- | --------------------------------------- |
| `NEXT_PUBLIC_BFF_URL` | apps      | `http://localhost:400x`     | The one backend this app calls          |
| `PORT`                | services  | `4000` / `4001` / `4002`    | BFF listen port                         |
| `HOST`                | services  | `127.0.0.1`                 | Bind address (loopback only by default) |
| `APP_ORIGINS`         | services  | `http://localhost:300x`     | CORS allow-list (the paired app only)   |
| `PLATFORM_STORAGE`    | services  | `file`                      | Set to `file` or `memory`               |
| `PLATFORM_DATA_DIR`   | services  | `<repo>/.data`              | Location of the JSON stores             |

## Anatomy of a surface

```text
apps/<team>/src/
  app/                    Next.js App Router routes (layout.tsx wraps the shared AppShell)
  components/ui/          shadcn/ui primitives
  components/data-table/  Generic TanStack Table (search, select filters, sorting, pagination)
  components/layout/      AppShell, PageHeader, BffStatus
  features/<feature>/     Screens for this surface (create as you build)
  lib/api-client.ts       The only fetch: typed get/post/patch to the paired BFF + BffError
  lib/use-bff-query.ts    Small client-side data hook
  lib/surface.ts          Surface identity, BFF URL, links to sibling surfaces

services/<team>/src/
  index.ts                Process entry point (port, graceful shutdown)
  app.ts                  createServiceApp(): CORS, JSON, logging, /health, 404, error envelope
  config.ts               PORT / APP_ORIGINS
  routes/index.ts         Screen-shaped endpoints mounted at /api
```

Every service returns errors in the same envelope, `{ "error": { "code", "message", "details?" } }`
(`ApiErrorBody`). Apps receive these errors as `BffError`.

**Throw:**

- `HttpError` for request-level failures.
- `DomainError` for violated invariants.

**Validate:** pass any `safeParse`-compatible schema to `parseOrThrow`, for example a zod schema.
