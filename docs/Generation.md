# Generation Pipeline

## Prompt Templates
Templates live in src/server/services/xhs/promptTemplates.ts and are rendered with {{topic}} variables.

## Queue Behavior
- enqueue: creates generation_tasks rows with status=queued
- pause/resume: controls processing loop
- cancel: marks task canceled and removes it from the queue

## Assets
Generated outputs are stored under the Electron userData assets directory.
Metadata (prompt + generated text) is stored with each asset row.

## Image Generation (Remote Only)
Image generation currently uses **Gemini (via yunwuapi)** and requires remote configuration.

- Settings: `nanobananaEndpoint` (Gemini Base URL, e.g. `https://yunwu.ai`) + `nanobananaApiKey` (Gemini API Key, e.g. `sk-...`)
- Env override: `NANOBANANA_ENDPOINT` / `NANOBANANA_API_KEY`

If the Base URL / API Key is not configured, generation fails with `GEMINI_NOT_CONFIGURED`.
