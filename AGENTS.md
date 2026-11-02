# Agent instructions

This repo is built so an AI agent can ship features for one team without touching the platform features. Read [README → Blast radius by design](README.md#blast-radius-by-design) first.

## Change zones

| Zone | Paths | What you may do |
| ---- | ----- | --------------- |
| Green: self-serve | `apps/<team>/`, `services/<team>/src/routes/` (plus `policy/`, `presenters/`), `services/<team>/test/` | Build and iterate on screens, endpoints, business rules and response shaping for **one** team. |
| Amber: review required | `packages/shared-types/` | Add or change contracts and DTOs. Call it out in the PR description; it affects every surface. |
| Red: platform team only | `packages/backend-common/`, `scripts/`, `.github/`, `turbo.json`, root `package.json`, `pnpm-*.yaml`, `tsconfig.base.json`, `AGENTS.md` | Do not change these to make a feature work. Stop and ask for a platform change instead. |

## Rules for feature work

- An app talks only to its own BFF, through `src/lib/api-client.ts`.
- Every new `/api` route that reads data uses `requirePermission(...)`. Every route that changes data also validates its body with a Zod schema (`parseOrThrow` / `validateBody`).
- Never pass `audit: false` or `identity: false` to `createServiceApp`.
- Never import `fs`, database or cloud SDKs, another service, or `backend-common` internals (only `@platform/backend-common`).
- If `pnpm check` fails on a boundary rule, change your code, never the rule (`scripts/check-boundaries.mjs`).
- Run `pnpm check` before opening a PR.
