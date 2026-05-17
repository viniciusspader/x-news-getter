# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

`x-news-getter` is a daily AI curation agent. It calls the xAI Grok API — via the OpenAI SDK pointed at `https://api.x.ai/v1` — and uses Grok's native `x_search` tool to search X/Twitter. Every morning at 08:00 UTC, a GitHub Actions workflow runs `agent.js`, which:

1. **Phase 1 (seed experts):** searches posts from a curated list of handles defined in `topics/ai.json`
2. **Phase 2 (global search):** broadens the search using topic keywords
3. Writes a dated JSON file (`curation-{topic}-{date}.json`) to the repo root
4. Sends a Markdown summary to a Telegram channel via Bot API

## Running locally

```bash
npm install
```

Create a `.env` file with:
```
XAI_API_KEY=...
TELEGRAM_BOT_TOKEN=...   # optional — skipped if absent
TELEGRAM_CHAT_ID=...     # optional — skipped if absent
```

```bash
node agent.js
```

No build step. The project is ESM (`"type": "module"` in package.json), so all imports use ES module syntax.

## Architecture

**Single entrypoint:** `agent.js` — no other source files. All logic lives here.

**Config-driven topics:** `topics/*.json` defines what gets curated. The only file currently is `topics/ai.json`. Adding a new topic means creating a new JSON file and either running `agent.js` with a different `configPath`, or extending `agent.js` to loop over all topic files.

Each topic config has:
- `topicName` — used in prompts and output filenames
- `seedHandles` — Phase 1 experts (without `@`)
- `searchKeywords` — Phase 2 broad search terms
- `filteringDirectives` — natural-language instructions injected into the system prompt

**Output schema:** the agent enforces a JSON schema via `text.format.json_schema` in the Grok API call. Output has: `topic`, `seed_expert_discoveries`, `global_discoveries`, `near_misses`, `notes`.

**GitHub Actions:** `.github/workflows/ai-curation.yml` — runs on schedule + `workflow_dispatch`. Requires three repo secrets: `XAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

## Key constraints

- The `x_search` tool is Grok-native and not available on standard OpenAI endpoints — do not change the `baseURL`.
- The model is hardcoded to `"grok-4.3"` — verify model availability in the xAI docs before upgrading.
- Output JSON files are committed to the repo root by the CI run; they are not gitignored.
- `max_output_tokens: 8000` is set conservatively — increase if truncation occurs with larger topic configs.
