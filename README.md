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

## Platform guardrail layers

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
  check-boundaries.mjs    Enforces the import rules below (`pnpm lint:boundaries`)
  reset-data.mjs          Wipes local data (`pnpm data:reset`)
```

## The BFF architecture

```text
 apps/compliance ──HTTP──▶ services/compliance ─┐
 apps/finance    ──HTTP──▶ services/finance    ─┼──▶ packages/backend-common ──▶ data/*.json
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
   - An app talks only to its own BFF, over HTTP, through the `apiClient` it builds in `src/common/api-client.ts` with ui-shared's `createApiClient`. Every response is parsed against its `@platform/shared-types` Zod schema (`apiClient.getParsed(url, schema)`); a mismatch throws `SchemaMismatchError`. App source never calls `fetch` (`packages/ui-shared/src/api/api-client.ts` is the only caller). The BFF URL comes from `NEXT_PUBLIC_BFF_URL`.
   - Apps may import `@platform/shared-types` and `ui-shared` (`"ui-shared": "workspace:*"`, required). They may not import `backend-common`, any service, Node built-ins, or DB/cloud SDKs.
   - Server state is TanStack Query only: no `useEffect` in app source, and `useQuery`/`useMutation` live in `src/features/<feature>/api/`. Mutations invalidate their feature's query keys on success.
2. **`services/*`: one BFF per app.**
   - A service receives requests from its paired app, runs that domain's business rules, and returns payloads shaped for that app's screens.
   - CORS only allows the paired app's origin (`APP_ORIGINS`).
   - Services may import `@platform/backend-common` and `@platform/shared-types`. They never import another service or an app. If two services need the same code, move it into `backend-common`.
3. **`packages/backend-common`: closed and shared.**
   - It may import npm packages and `@platform/shared-types`, and nothing else from the workspace.
   - It knows nothing about any service or app and must never import from `services/*` or `apps/*`.
   - It holds surface-agnostic building blocks: the Express service bootstrap, the error envelope, logging, config, local storage, the generic domain types (`src/domain`) and the connectors.
4. **`packages/shared-types`: pure contracts.**
   - Its only dependency is `zod`, and it has no runtime code beyond Zod schemas and type-adjacent constants.
   - `src/contracts/*` holds the Zod client-row contracts; their TypeScript types are inferred from them, never hand-written.
   - `src/common.ts` holds cross-cutting types (`ApiErrorBody`, `HealthResponse`, `ValidationIssue`).
   - `src/dto/<surface>.ts` holds the screen-shaped request/response types for each app↔BFF pair.
   - It holds only what clients see. Backend domain types and vendor shapes never go here (see [Data types](#data-types-vendor-edge--domain--client-row)).
5. **Relative imports never cross a workspace package.** Go through the package's public entry point (`@platform/...`).

### Where does new code go?

| You are adding…                                              | Put it in                                  |
| ------------------------------------------------------------ | ------------------------------------------ |
| A screen or component for one team                           | `apps/<team>/src/features/<feature>/`      |
| A useQuery / useMutation hook for that screen                | `apps/<team>/src/features/<feature>/api/`  |
| A UI pattern, primitive or hook needed by 2+ apps            | `packages/ui-shared/src/`                  |
| An endpoint, a business rule, or response shaping for that screen | `services/<team>/src/routes/` (+ `policy/`, `presenters/` as it grows) |
| A request/response type for that endpoint                    | `packages/shared-types/src/dto/<team>.ts`  |
| A store, an integration mock, or a rule needed by 2+ services | `packages/backend-common/src/<module>/`    |
| A generic (vendor-agnostic) domain type                      | `packages/backend-common/src/domain/`      |
| A new vendor behind an existing connector                    | `packages/backend-common/src/connectors/<x>/vendors/<vendor>.ts` |
| A shadcn/ui primitive                                        | `pnpm dlx shadcn@latest add <component>` inside `packages/ui-shared` (rewrite `@/lib/utils` to `../../lib/utils`) |

## Local storage (no database)

`packages/backend-common` has one storage engine, `JsonCollection` (`src/connectors/json-collection.ts`).
It sits behind every connector below and is internal to the package. A collection is a versioned JSON
document (`{ schemaVersion, records }`). It is read and written asynchronously, and changed only through
all-or-nothing `mutate()` calls.

- **File mode** (the default, `PLATFORM_STORAGE=file`) keeps each collection in
  `packages/backend-common/data/<name>.json` (override the folder with `PLATFORM_DATA_DIR`).
  Writes are atomic (temp file, then rename) and take a cross-process `<file>.lock`, so several services
  can safely share a file.
- **Memory mode** (`PLATFORM_STORAGE=memory`) keeps each collection inside its instance and never touches
  disk. Data is seeded the same way and lost on restart. It is meant for tests and demos.
- If a `mutate()` callback throws, nothing is written. Records are validated against the collection's
  schema before every write and after every read.
- `mutate()` callbacks must be synchronous. If a callback returns a Promise, the call rejects and nothing
  is written. Do any async work (HTTP, provider calls) before or after the mutation.
- A lock is treated as stale only when the process that owns it has died. A writer that finds it no longer
  owns its lock aborts instead of overwriting someone else's commit.

Run `pnpm data:reset` to delete all local data; collections are re-seeded on next access.

## Service & database connectors

In production each BFF would talk to a PostgreSQL cluster or a SaaS vendor API. Locally, those
dependencies are replaced by **connectors**: interfaces in `backend-common/src/connectors`, backed by
async (`fs/promises`) JSON-file drivers, so everything works with zero credentials.

| Connector interface    | Hub factory                | Used by                | Domain type       | Vendor mocks (`packages/backend-common/data/`) |
| ---------------------- | -------------------------- | ---------------------- | ----------------- | ---------------------------------------------- |
| `ILedgerDatabase`      | `getLedgerDatabase()`      | `services/finance`     | `Refund`          | `stripe-refunds.json`, `paypal-refunds.json` |
| `IKycVendorClient`     | `getKycVendorClient()`     | `services/compliance`  | `KycVerification` | `persona-inquiries.json`, `alloy-evaluations.json` |
| `IFeatureFlagProvider` | `getFeatureFlagProvider()` | `services/engineering` | `FeatureFlag`     | `launchdarkly-flags.json`, `unleash-features.json` |

- **Hub only.** Services resolve connectors through the hub factories and pass them to their routers as
  `ApiDependencies`. The `Disk*` drivers are not exported, and `pnpm lint:boundaries` rejects `fs` imports
  in `services/*/src`, so handlers never see file paths or the storage driver.
- **One adapter per vendor.** Each connector reads and writes every vendor it fronts and merges the
  results. Refunds are stored with the processor of their original charge (`processor`); KYC
  verifications and flags stay with the vendor that holds them.
- **Seeding.** If a data file is missing (first boot, or after `pnpm data:reset`), the driver creates the
  directory and seeds it with realistic mock data in that vendor's shape (15+ records per connector). Services call
  `initializeConnectors([...])` at boot so seeding happens before the first request.
- **Simulated latency.** Every read and write waits a pseudo-random 50–150 ms
  (`PLATFORM_SIMULATED_LATENCY_MS`, e.g. `80`, `20-60` or `off`) so frontends show their loading states.
- **Errors.** Unknown ids → `NOT_FOUND` (404); blank ids or invalid input → `BUSINESS_RULE_VIOLATION`
  (422); deciding an already-finalised KYC applicant → `CONFLICT` (409). All use the shared error envelope.
  Unreadable or corrupt data files raise `ConnectorError`, which is logged and returned as a 500.
- **Storage.** Every driver is a `JsonCollection` (see [Local storage](#local-storage-no-database)), so
  `PLATFORM_STORAGE=memory` runs all three connectors without touching disk.
- **Tests.** Call `configureConnectors({ mode: "memory", latency: false })` (or `{ dataDir, latency: false }`)
  before resolving connectors, or pass fakes to a service's `createApp({ dependencies })`.

## Data types: vendor edge → domain → client row

Each piece of data has three types, and each layer only sees its own:

```text
 StripeRefund / PayPalRefund        Refund              RefundTransactionRow
 PersonaInquiry / AlloyEvaluation → KycVerification  →  KycReviewRow
 LaunchDarklyFlag / UnleashFeature  FeatureFlag         FeatureFlagRow
 ───────────────────────────────    ───────────────     ─────────────────────
 edge: one per vendor, private to   generic domain:     client-only row: Zod schema
 backend-common/src/connectors/     backend-common/     in shared-types, built by the
 <x>/vendors, validated on disk     src/domain          BFF's presenter, sent to the app
```

- **Edge → domain** (connector adapters). Each vendor module defines its Zod schema (and
  `z.infer` type) and a lossless `toDomain` / `toEdge` pair. The vendor's units, enums, casing,
  timestamps and metadata conventions stop here. `pnpm lint:boundaries` rejects imports of
  `connectors/<x>/vendors/*` from anywhere else. Adding a vendor means adding one adapter;
  services and apps don't change.
- **Domain → row** (`services/<team>/src/presenters`). The BFF maps the generic type to the
  row its screen needs and parses it with the row schema before responding, so a mapping bug
  is a logged 500 instead of a malformed payload.
- **Apps** import only the row types and DTOs from `shared-types`. They never see domain or
  vendor types.

| Endpoint                      | Role needed            | Response (`dto/<team>.ts`) |
| ----------------------------- | ---------------------- | -------------------------- |
| `GET /api/refunds` (finance)  | `finance` · `read`     | `RefundTransactionsResponse { rows: RefundTransactionRow[] }` |
| `GET /api/kyc/verifications` (compliance) | `compliance` · `read` | `KycReviewQueueResponse { rows: KycReviewRow[] }` |
| `GET /api/feature-flags` (engineering) | `engineering` · `read` | `FeatureFlagsResponse { rows: FeatureFlagRow[] }` |

## Strict runtime data contracts

The client-row contracts are Zod schemas in `packages/shared-types/src/contracts`. Each schema is the
single source of truth for its type: services validate against the schema, and apps and services
import the type that `z.infer` derives from it.

| Schema                       | Inferred type          | Surface            | Notable rules |
| ---------------------------- | ---------------------- | ------------------ | ------------- |
| `kycReviewRowSchema`         | `KycReviewRow`         | `apps/compliance`  | status `PENDING`/`APPROVED`/`REJECTED`, `documentUrl` absolute http(s) URL, `riskScore` 0–100, `notes` optional (defaults to `""`) |
| `refundTransactionRowSchema` | `RefundTransactionRow` | `apps/finance`     | `amount` > 0 (major units), status `PENDING_APPROVAL`/`PROCESSED`/`FAILED`, `currency` 3 letters (upper-cased), `createdTimestamp` ISO-8601, `approvalsReceived` distinct (defaults to `[]`) |
| `featureFlagRowSchema`       | `FeatureFlagRow`       | `apps/engineering` | `key` snake_case, `targetedTiers` distinct, `updatedAt` ISO-8601 |

- Every text field is trimmed before it is checked, so a whitespace-only value counts as empty. Ids are
  URL-safe (`[A-Za-z0-9_-]`, UUIDs included). Unknown keys are stripped.
- Each schema also exports its status enum (`KYC_REVIEW_STATUSES`, `REFUND_TRANSACTION_STATUSES`).

`validateBody(schema)` from `backend-common` enforces a contract at the Express boundary. On
POST/PUT/PATCH it parses `req.body`, replaces it with the parsed output, and types `req.body` as the
schema's output in the handlers after it. Other methods pass through.

```ts
router.post("/v1/refunds", auditAction("CREATE_REFUND"), requirePermission("finance", "execute"),
  validateBody(refundTransactionRowSchema), async (req, res) => {
    req.body.currency; // string, already trimmed and upper-cased
  });
```

An invalid or missing body stops the request with HTTP 400 before any handler or connector runs. It uses
the shared error envelope, with field-level issues in `details` (`ValidationErrorDetails`):

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Request body failed validation",
  "details": { "issues": [{ "path": ["currency"], "field": "currency", "code": "invalid_format",
    "message": "Must be a 3-letter ISO-4217 currency code, e.g. USD" }] } } }
```

Apps receive it as an `ApiRequestError` with code `VALIDATION_FAILED`, and the audit trail records it as a
`VALIDATION_FAILED` failure.

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

**Mock identity injection.** With no identity provider, `injectMockUser` reads the `x-authenticated-user-role` header and attaches the matching mock profile to `req.user`. If the header is missing on a GET/HEAD/OPTIONS request it uses `finance_analyst` and logs a warning to stdout (once per process). If it's missing on a mutating request (POST/PATCH/PUT/DELETE…) the request gets a 400. This matters because a browser can send a cross-site form POST without custom headers, so a default role there would let any web page trigger actions on a local BFF. An unknown role gets a 400. Any caller can claim any role, so this is for local development only.

**Route guards.** `requirePermission(resource, action)` lets the request through only if `req.user.role` is allowed to do that action on that resource. Otherwise it passes `HttpError(403, "FORBIDDEN", …)` to the shared error handler, so the response uses the standard envelope: `403 { "error": { "code": "FORBIDDEN", "message": "User role does not possess required permissions for this action." } }`. It also denies requests when no identity middleware has run (fails closed). The apps' API client needs no special case; the denial surfaces as `ApiRequestError(403, "FORBIDDEN", message)` and the feature's error panel shows it. Resource and action names are type-checked, so `requirePermission("finance", "toggle")` won't compile.

**Where identity is mounted.** `createServiceApp` mounts identity on `/api` ahead of the service's routes, so each service only calls `app.use("/api", createApiRouter())`. `/health` and anything else outside `/api` never sees it. The `identity` option defaults to `injectMockUser`. Pass a different middleware to replace it (e.g. real auth later), or `false` to turn it off.

Every service exposes placeholder probes from `createAccessCheckRouter(resource)`: `GET /api/access/read` and `POST /api/access/<approve|execute|toggle>`. Each app's top bar has a role dropdown. The choice is kept in a `mock-user-role` cookie, which is shared by all apps on localhost, and ui-shared's `mockIdentityHeaders` sends it as the header. Switching roles resets every cached query, so each screen re-fetches as the new role (403s render inline). The probes remain for manual `curl` checks.

```ts
import { createServiceApp, requirePermission } from "@platform/backend-common";

createServiceApp({ name, allowedOrigins, routes: (app) => app.use("/api", router) }); // identity: injectMockUser by default
router.get("/refunds", requirePermission("finance", "read"), listRefunds);
router.post("/refunds/:id/execute", requirePermission("finance", "execute"), executeRefund);
```

## Audit trail

Every POST, PUT, PATCH and DELETE handled by any BFF writes one audit line to stdout as single-line JSON. In production a log agent such as Datadog Agent or Fluent Bit would scrape these lines and ship them to immutable storage. The engine is in `packages/backend-common/src/audit`. `createServiceApp` mounts `auditLogger` for every service and uses the service `name` as `targetService`. To customise it, pass `audit: { ... }`. To turn it off, pass `audit: false`.

```json
{"kind":"audit","timestamp":"2026-11-01T12:00:00.000Z","actorId":"mock-finance_analyst","actorRole":"finance_analyst","targetService":"finance-service","endpoint":"/api/v1/refunds/:id/execute","action":"EXECUTE_REFUND","status":"SUCCESS","delta":{"oldValue":{"status":"PENDING"},"newValue":{"status":"EXECUTED"}},"method":"POST","httpStatus":200,"requestId":"…","durationMs":3.2}
```

- **Outcome.** 2xx and 3xx responses are `SUCCESS`. 4xx and 5xx responses are `FAILED`, and `error` is taken from the response body. That covers zod/`parseOrThrow` 400s, RBAC 403s, unknown roles, malformed JSON and unknown routes. A client disconnect is recorded as `FAILED` with `CLIENT_CLOSED_REQUEST`. Calling `useAudit(req).fail(err)` forces `FAILED`.
- **Actor.** The actor comes from `req.user`. If the request is rejected before an identity is attached, the actor is `anonymous`.
- **Delta.** `computeDelta(old, new)` is pure. A create gives `{ oldValue: null, newValue: <record> }`. A delete gives `{ oldValue: <record>, newValue: null }`. An update keeps only the changed keys on both sides and keeps the nested structure. Keys such as `password`, `token` and `cardNumber` (see `DEFAULT_REDACT_KEYS`) are written as `"[REDACTED]"`.
- **Non-blocking.** The line is written with `setImmediate` after the response is sent. If auditing throws, the error is logged and the request is unaffected.

Handlers add business context. `auditAction` names the action and should come first so that RBAC and validation failures are still labelled. `useAudit(req)` returns the trail for recording snapshots. It throws if the audit middleware isn't mounted, so a mutation can't silently skip its audit line. Snapshots are synchronous copies, so take them right after reading and right after writing through the connector:

```ts
import { auditAction, requirePermission, useAudit } from "@platform/backend-common";

router.post("/v1/refunds/:id/execute", auditAction("EXECUTE_REFUND"), requirePermission("finance", "execute"), async (req, res) => {
  const audit = useAudit(req);
  const id = String(req.params.id);
  audit.before(await deps.ledger.findById(id));
  const refund = await deps.ledger.updateRecord(id, { status: "approved" });
  audit.after(refund);
  res.json(refund);
});
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

- **403 from the route guard.** `finance_analyst` and `engineer` get `403 FORBIDDEN` on `GET /api/kyc/verifications` and on `POST /api/kyc/verifications/:applicantId/decisions`. A read with no `x-authenticated-user-role` header falls back to `finance_analyst` and is also rejected with 403. A *mutation* with no header is rejected earlier with `400 BAD_REQUEST`, by design, because cross-site form POSTs can't set custom headers (see [Access control](#access-control-rbac)).
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

## Anatomy of a surface

```text
packages/ui-shared/src/   Shared frontend infrastructure (TypeScript source, transpiled by each app)
  styles/globals.css      Tailwind v4 + shadcn tokens: compact density, light/dark variables (`ui-shared/styles.css`)
  components/ui/          shadcn/ui primitives (radix-vega style; add more with `pnpm dlx shadcn add` here)
  api/                    createApiClient → getParsed / postParsed (Zod-validated), ApiRequestError, SchemaMismatchError
  query/                  QueryProvider (QueryClient defaults), runBatch for bulk mutations
  data-table/             <CoreDataTable<TData, TValue> /> on TanStack Table v9: sorting, column + global
                          filtering, pagination, row selection; createCoreColumnHelper, selectionColumn
  shell/ theme/ identity/ AppShell, PageHeader, StatCard, BffHealthBadge, ReasonDialog, ThemeToggle, mock role

apps/<team>/src/          (Pages Router; only these four layers are allowed)
  app/                    Global wrappers: providers.tsx (QueryProvider, Toaster), app-frame.tsx, globals.css
  pages/                  Thin routes: _app.tsx, _document.tsx (theme init), index.tsx mounts the feature
  common/                 App-local shared code: api-client.ts (the paired BFF), surface.ts
  features/<feature>/     Domain screens; api/ holds every useQuery/useMutation hook and query keys
                          (compliance: kyc-queue, finance: refunds-panel, engineering: feature-flags)

services/<team>/src/
  index.ts                Process entry point (port, graceful shutdown)
  app.ts                  createServiceApp(): CORS, audit, JSON, logging, /health, identity on /api, 404, error envelope
  config.ts               PORT / APP_ORIGINS
  routes/index.ts         Screen-shaped endpoints mounted at /api
```

Every service returns errors in the same envelope, `{ "error": { "code", "message", "details?" } }`
(`ApiErrorBody`). Apps receive these errors as `ApiRequestError`.

**Throw:**

- `HttpError` for request-level failures.
- `DomainError` for violated invariants.

**Validate:** mount `validateBody(schema)` on body-carrying routes (see [Strict runtime data contracts](#strict-runtime-data-contracts)). For other input, such as query params, pass any `safeParse`-compatible schema to `parseOrThrow`.
