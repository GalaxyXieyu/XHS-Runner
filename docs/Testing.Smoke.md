# Smoke Testing SOP

This project uses lightweight smoke tests as a fast regression gate.

## Goals

- Run quickly (seconds, not minutes)
- No network dependencies required
- Catch obvious breakages (API route handlers load, core workflow rules, scheduler cron parsing)

## Run

- `npm test`

It runs:
- `npm run build:server` (TypeScript compile for server-side code used by Electron)
- `node scripts/smoke/smokeTest.js`

## Design Rules

- Prefer **unit-like smoke tests** (directly execute handlers/modules) over spinning up Next.
- Keep tests deterministic; avoid time-sensitive assertions (other than "in the future").
- If an API route must be smoke-tested, keep its module format compatible with Node runtime used by tests.

## Module Format Note

The smoke runner is executed by Node using CommonJS `require()`.

- API route modules used by smoke tests should be loadable via `require()`.
- If a route is authored in a way that Node cannot load directly (e.g. ESM-only), either:
  - provide a small interop wrapper, or
  - move core logic into a shared server module that both Next API route and tests can import.

## Adding a New Smoke Test

1) Add a new `runTest('name', async () => { ... })` block in `scripts/smoke/smokeTest.js`.
2) Keep the assertion minimal: status code, shape, or a simple invariant.
3) Ensure it runs on CI/local without extra services.
