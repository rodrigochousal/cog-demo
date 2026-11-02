# Internal Platform

Shared scaffolding for a suite of internal applications. It is a **pnpm + Turborepo monorepo** using a
**Backend-for-Frontend (BFF) architecture**, and it runs entirely on one machine: no cloud services,
hosted databases, or third-party infrastructure.

| Layer    | Stack                                                                    |
| -------- | ------------------------------------------------------------------------ |
| Frontend | Next.js (Pages Router), TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query v5, TanStack Table v9 (`packages/ui-shared`) |
| Backend  | Node.js, Express 5, TypeScript                                           |
| Storage  | Local JSON files or in-memory collections (`packages/backend-common`)    |
| Tooling  | pnpm workspaces, Turborepo, Vitest                                       |

## Platform features

This platform replaces the enterprise guardrails that low-code ecosystems such as Microsoft Power Apps normally hide from you. It is made of five layers, each built as a decoupled, scalable module in this monorepo. Shared backend parts live in `packages/backend-common`, shared contracts in `packages/shared-types`, and UI parts in each `apps/*`.

### 1. Granular role-based access control (RBAC)

- **Framework:** a strict, type-safe permission matrix that evaluates four operational roles: `admin`, `compliance_analyst`, `finance_analyst` and `engineer`.
- **Local implementation:** enterprise authentication is simulated with a custom HTTP header, `x-authenticated-user-role`. Express router guards reject unauthorized requests immediately with HTTP 403, before any downstream service business logic runs. The 403 uses the standard error envelope, `{ "error": { "code": "FORBIDDEN", "message": … } }`.

### 2. Structural delta auditing

- **Framework:** a centralized, automated logging engine that intercepts every state-changing request (POST, PUT, DELETE) and produces an immutable audit trail for compliance verification (e.g. SOC2, PCI-DSS).
- **Local implementation:** computes object-level differences between states (`oldValue` vs `newValue`) and writes the formatted JSON payloads to standard output (`process.stdout`), the way real log aggregation agents such as Datadog or FluentBit expect.

### 3. Modular service and database connectors

- **Framework:** an abstract Repository/Provider pattern that separates the API business routes from the underlying persistence layer.
- **Local implementation:** interface-driven adapters (`ILedgerDatabase`, `IKycVendorClient`) read and write data asynchronously through local file-system streams (`fs/promises`). They add simulated network latency so frontend loading states can be tested without any external database.

### 4. Strict runtime data contracts

- **Framework:** end-to-end type safety. Incoming application inputs are validated at the API boundary before any code runs on them.
- **Local implementation:** `Zod` schema parsing combined with TypeScript type inference. A malformed client payload fails schema validation in the Express middleware layer, and a structured error map goes back to the calling client.

### 5. High-density enterprise UI engine

- **Framework:** one compact, unified dashboard interface, optimized for high-throughput data processing across internal teams.
- **Local implementation:** `shadcn/ui` components give clean Tailwind styling, and you own all of the markup. They are paired with the headless logic engine of `TanStack Table (v9)`, which handles generic datasets, client- and server-side pagination, and advanced row filtering.

## Blast radius by design

The layers above aren't only features. They are arranged so that most internal-app work can be handed to product managers and AI agents (e.g. Devin) without spending core engineering time. Team surfaces are isolated from each other, and authentication, audit logging, data contracts and storage live in a closed shared package that feature code consumes but cannot change or bypass. An AI-driven feature change is then confined to one team's surface. It cannot weaken the guardrails without a platform-team review.

### Change zones

| Zone | Paths | Who changes it |
| ---- | ----- | -------------- |
| **Green: self-serve** | `apps/<team>/`, `services/<team>/src/routes/` (plus `policy/`, `presenters/`), `services/<team>/test/` | PMs and agents, for one team at a time. A change here can only affect that team's screen and BFF. |
| **Amber: review required** | `packages/shared-types/` | Anyone, but each change is reviewed: a contract change reaches every surface that uses it. |
| **Red: platform team** | `packages/backend-common/`, `scripts/`, `.github/`, `turbo.json`, root `package.json`, `pnpm-*.yaml`, `tsconfig.base.json`, `AGENTS.md` | The platform team only. These hold the guardrails *and* the gates that enforce them. |

[`.github/CODEOWNERS`](.github/CODEOWNERS) maps these zones to owners, and [`AGENTS.md`](AGENTS.md) tells coding agents to stay in the green zone and escalate instead of editing red-zone code.

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
  shared-types/           Zod client-row contracts + inferred types and DTOs (only dependency: zod)
  ui-shared/              Shared frontend: design system, schema-validating apiClient, Query root, <CoreDataTable />
scripts/
  check-boundaries.mjs    Enforces the import boundaries (`pnpm lint:boundaries`)
  reset-data.mjs          Wipes local data (`pnpm data:reset`)
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
| `pnpm lint`            | Boundary rules, then typecheck of every workspace (Turborepo `lint` task) |
| `pnpm typecheck`       | Runs `tsc --noEmit` across the workspace                |
| `pnpm test`            | Runs Vitest suites (`backend-common` and each service)  |
| `pnpm lint:boundaries` | Checks the architecture boundary rules                  |
| `pnpm check`           | Runs lint, test, and build together (what CI runs). Use it before opening a PR |
| `pnpm data:reset`      | Deletes `packages/backend-common/data/` (or `PLATFORM_DATA_DIR`) |
| `pnpm clean`           | Removes build output and `node_modules`                 |

### Environment variables

Each app and service has a `.env.example`. The defaults work without any `.env` file.

| Variable              | Where     | Default                     | Purpose                                 |
| --------------------- | --------- | --------------------------- | --------------------------------------- |
| `NEXT_PUBLIC_BFF_URL` | apps      | `http://localhost:400x`     | The one backend this app calls          |
| `PORT`                | services  | `4000` / `4001` / `4002`    | BFF listen port                         |
| `HOST`                | services  | `127.0.0.1`                 | Bind address (loopback only by default) |
| `APP_ORIGINS`         | services  | `http://localhost:300x`     | CORS allow-list (the paired app only)   |
| `PLATFORM_STORAGE`    | services  | `file`                      | `file` persists to disk; `memory` never touches disk |
| `PLATFORM_DATA_DIR`   | services  | `packages/backend-common/data` | Location of the local JSON data files |
| `PLATFORM_SIMULATED_LATENCY_MS` | services | `50-150` | Simulated connector latency (`off` disables) |

## Testing and CI/CD

Every check that CI runs also runs locally. `pnpm test` from the root runs every Vitest suite through Turborepo.

### Test suites

| Where | Kind | What it proves |
| ----- | ---- | -------------- |
| `packages/backend-common/test/permissions.test.ts` | Unit | The RBAC matrix, checked role by role against an independently written grant table. Each allowed `[resource, action]` pair must return `true`, and every other pair, including unknown and prototype keys, must return `false`. |
| `packages/backend-common/test/audit-delta.test.ts` | Unit | `computeDelta` keeps only the changed keys, keeps nested structure, records added and removed keys, redacts secrets, and never mutates its inputs. |
| `packages/backend-common/test/*.test.ts` (rest) | Unit / in-process HTTP | `JsonCollection` locking and rollback, connectors, `createServiceApp`, identity middleware, and the audit middleware. |
| `services/compliance/test/kyc.integration.test.ts` | API contract (Supertest) | The Compliance BFF over HTTP. The disk-backed KYC driver is replaced with `vi.fn()` spies through `vi.mock("@platform/backend-common")`, so no file is touched. Guard failures and validation failures must leave every driver spy uncalled. |
| `services/*/test/app.test.ts` | Smoke | Health, the 404 envelope, the RBAC probe wiring, and each BFF's row endpoint (rows parse against their contract and carry no backend or vendor fields). |

The contract tests cover these cases:

- **403 from the route guard.** `finance_analyst` and `engineer` get `403 FORBIDDEN` on `GET /api/kyc/verifications` and on `POST /api/kyc/verifications/:applicantId/decisions`. A read with no `x-authenticated-user-role` header falls back to `finance_analyst` and is also rejected with 403. A *mutation* with no header is rejected earlier with `400 BAD_REQUEST`, by design, because cross-site form POSTs can't set custom headers.
- **400 from Zod validation.** A missing or unknown `outcome`, a blank or non-string `reason`, unknown keys (including a client-supplied `reviewerId`), a non-object body, a missing body, or malformed JSON all stop with `400` before the connector is called. Schema failures return `VALIDATION_FAILED` and the Zod issues in `error.details`. Schemas live next to their routes (`services/compliance/src/routes/schemas.ts`) and are applied with `parseOrThrow`.

### Turborepo task graph

```
lint      -> //#lint:boundaries + typecheck   (typecheck -> ^build)
build     -> ^build                           (outputs dist/**, .next/**)
test      -> ^build                           (suites import workspace deps from dist)
```

`^build` means "build this workspace's dependencies first". For example, `pnpm test` builds `shared-types`, then `backend-common`, and only then runs the service suites. Results are cached, so an unchanged workspace is replayed from `.turbo/cache`.

### GitHub Actions pipeline

`.github/workflows/ci.yml` runs on every pull request, on pushes to `main`, and on manual dispatch:

1. Check out the full history, set up pnpm (the version comes from `packageManager`), and set up Node from `.nvmrc`. The pnpm store is cached and keyed on `pnpm-lock.yaml`.
2. Restore `.turbo/cache`, then run `pnpm install --frozen-lockfile`.
3. `pnpm lint` checks boundaries and typechecks every workspace.
4. `pnpm build` and `pnpm test` run with `--affected` on pull requests, so only workspaces changed against the base branch, and the workspaces that depend on them, are built and tested. Pushes to `main` verify the whole graph.

CI runs with `PLATFORM_SIMULATED_LATENCY_MS=off`. The connector suites write to their own temp directories, never to `packages/backend-common/data/`. A newer run on the same PR cancels the older one.
