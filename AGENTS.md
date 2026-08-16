# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Product decisions

- The MVP uses a two-state companion: an expanded control panel and a compact floating widget.
- The compact widget can be dragged to any edge or corner, then remembers its position; the expanded panel uses the same anchor.
- Default UI language is Simplified Chinese with a visible `中文 / English` switch in settings.
- The default placement is the bottom-right corner, while users can move it freely.
- The shipped integration uses two local paths: Codex Hooks for sessions already running in another Codex client, and a Tauri Rust bridge that launches `codex app-server` for the packaged desktop app.
- Browser development uses `bridge/server.mjs` and SSE at `127.0.0.1:43123`; Tauri uses `codex-event` and `codex-status` events.
- The project root is also a Codex plugin root with `.codex-plugin/plugin.json` and `hooks/hooks.json`; hook commands must remain asynchronous and never block Codex when the notifier is offline.
