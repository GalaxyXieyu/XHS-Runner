# Migration Notes

## Manual Smoke Checklist
1. `npm install`
2. `npm run dev`
3. Verify theme list loads (or create a new theme).
4. Open Creative tab and generate/apply feedback via Form Assist.
5. Open Operations tab and refresh publish queue.

## Database Rebuild
- Remove the local DB file (userData/xhs-generator.db) to force a clean rebuild.
- Launch the Electron app to re-run migrations.

## XHS Core Configuration
- Build core before running: `npm run build:xhs-core`.
- Use `XHS_MCP_DRIVER=mock` for local dry runs.
