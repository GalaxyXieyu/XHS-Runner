# xhs-generator – AI Dev TODO / Working Agreement

> Owner: 宇宇
> Maintainer (AI): 痛仔
> Repo: `/Volumes/DATABASE/code/mcp/xhs-generator`
> Created: 2026-02-03

## Global Goal

- Keep the app usable while iterating.
- Ship improvements in small, reviewable commits (1 feature point per commit).
- Always validate with **API tests first**, then **Chrome UI/E2E**.

## Non-Negotiable Requirements

- Testing must include:
  - API tests (priority)
  - UI tests / E2E in Chrome (after API)
  - UX sanity check in Chrome: run `npm run dev:next`, open `http://localhost:3000`, and verify entry points + no redundant/confusing flows for the feature being shipped
- Each feature point:
  - has its own commit(s)
  - includes a short self-review: redundancy? risk to main app?
- Docs policy:
  - Do NOT spam docs.
  - Keep docs categorized and minimal (avoid too many small/overlapping pages).
  - Prefer updating an existing doc over creating a new one.
- Code size policy:
  - Avoid giant files; prefer splitting modules/components.
  - Review focus: keep individual files roughly <= 800 lines (unless strong justification).
- Hourly status reports:
  - re-check this doc (requirements + global goal + docs policy)
  - update progress + next step
  - call out any risk/regression

## Current Known Gaps (Initial Scan)

- `src/features/workspace/components/GenerationSection.tsx` has `TODO: 保存任务逻辑` (scheduled generation task creation/edit not wired).
- Scheduler supports `job_type: daily_generate` but UI pathway not fully connected.

## Planned Work Items (Draft)

- [ ] P0: Daily generate pipeline (ideas -> agent -> drafts)
  - [x] Backend: daily_generate creates ideas + runs agent + updates generation_tasks
  - [x] UI: Generation scheduled view shows "today ideas" + actions (open in agent / rerun)
  - [~] Tests: API first, then Chrome E2E flow
- [~] P0: Make smoke/API regression for daily_generate reliable
  - [x] Add jobs DTO validation in service layer + include in smoke suite
  - [x] Add API E2E: create job -> trigger -> fetch executions -> cleanup (`scripts/e2e/jobsE2E.js`)
  - [ ] Add Chrome E2E: scheduled job create -> trigger -> see executions -> rerun -> agent runs
- [ ] P1: Improve observability (execution result/error surfaced; minimal replay hooks)
- [ ] P1: Split large files to keep <=800 lines (AgentCreator / GenerationSection)
- [ ] P2: Publishing analytics (3rd tab) planning + business logic
  - [ ] Define metrics model + snapshots cadence
  - [ ] Define UI sections & filters
  - [ ] Define data ingestion/update pipeline

## Status Log

### 2026-02-03

- Start: initial repo scan completed; hourly cron report set up.
- Next: after 宇宇 commits, re-scan diff & decide exact first slice/commit.
