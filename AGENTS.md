# Repository Guidelines

## Project Structure & Module Organization
This repo is an Electron + Next.js app. The main process lives in `electron/` (IPC + window lifecycle), while domain services live in `src/server/services/xhs/` and are compiled to `electron/server/`. The renderer UI lives in `src/pages/`. Operational docs live in `docs/`, and local runtime artifacts are stored in `data/` (keep generated data out of commits).

## Build, Test, and Development Commands
- `npm run dev`: start Next.js, then launch Electron after the renderer is ready.
- `npm run dev:next`: run the renderer only.
- `npm run dev:electron`: run Electron only after `http://localhost:3000` is ready.
- `npm run build:server`: compile server-side TypeScript to `electron/server/`.
- `npm run build`: build the Next.js renderer.
- `npm run start`: serve the built renderer.
- `npm run pack`: create an unpacked Electron build in `dist/`.
- `npm run dist` / `dist:mac` / `dist:win`: produce packaged installers.

## Coding Style & Naming Conventions
- TypeScript/JavaScript uses 2-space indentation, single quotes, and semicolons. Follow patterns in `src/pages/index.tsx` and `src/server/services/xhs/*.ts`.
- Module files are camelCase (for example, `workflowService.ts`), and React component names are PascalCase.
- Keep functions small and prefer explicit IPC calls over implicit globals.

## Testing Guidelines
There is no automated test runner configured in `package.json` yet. For changes, run a manual smoke test with `npm run dev` and exercise the UI. If you add tests, create a `tests/` or `__tests__/` directory and wire a `npm test` script.

## Commit & Pull Request Guidelines
- Commit messages use a ticket prefix: `[XHS-###] Short, imperative summary`.
- PRs should include a concise summary, test steps (commands + results), and screenshots for UI changes. Note target OS for packaging changes.

## Security & Configuration Tips
Review `docs/Config.md` and `docs/Settings.md` before changing defaults. Avoid committing credentials or local data; use environment variables or local configs ignored by Git.
