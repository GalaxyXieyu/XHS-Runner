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
- Each feature point:
  - has its own commit(s)
  - includes a short self-review: redundancy? risk to main app?
- Hourly status reports:
  - re-check this doc (requirements + global goal)
  - update progress + next step
  - call out any risk/regression

## Current Known Gaps (Initial Scan)

- `src/features/workspace/components/GenerationSection.tsx` has `TODO: 保存任务逻辑` (scheduled generation task creation/edit not wired).
- Scheduler supports `job_type: daily_generate` but UI pathway not fully connected.

## Planned Work Items (Draft)

- [ ] P0: Wire scheduled generation task save/edit to backend (daily_generate job)
  - [ ] API: create/update job + trigger + execution record
  - [ ] UI: GenerationSection form save -> job create/update
  - [ ] Tests: API first, then Chrome E2E flow
- [ ] P0: Add/extend smoke tests for jobs/executions endpoints relevant to daily_generate
- [ ] P1: Improve observability (execution result/error surfaced; minimal replay hooks)
- [ ] P2: Capture -> auto trigger analysis (guarded by config + rate limiting)

## Status Log

### 2026-02-03

- Start: initial repo scan completed; hourly cron report set up.
- Next: after 宇宇 commits, re-scan diff & decide exact first slice/commit.
