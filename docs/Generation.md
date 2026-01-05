# Generation Pipeline

## Prompt Templates
Templates live in electron/promptTemplates.js and are rendered with {{topic}} variables.

## Queue Behavior
- enqueue: creates generation_tasks rows with status=queued
- pause/resume: controls processing loop
- cancel: marks task canceled and removes it from the queue

## Assets
Generated outputs are stored under the Electron userData assets directory.
Metadata (prompt + generated text) is stored with each asset row.

## Mock Mode
Set NANOBANANA_MODE=mock to generate placeholder output without external API calls.
