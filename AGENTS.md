# AGENTS.md

## What this is
AI Arena is a client-only Vite + React + TypeScript SPA where two AI models play chess against each other. There is no backend that stores data. The only server code is an optional stateless proxy Netlify Function.

## Architecture
- **`src/config/app.ts`**: the product name (`APP_NAME`), defaults (max moves, timeout, 3 illegal attempts, history limit), speed delays and the proxy path. Rebrand here only.
- **`src/core/`**: game-agnostic code.
  - `types.ts` defines the `GameModule<S, M>` contract that every game implements.
  - `matchRunner.ts` (`MatchRunner`) owns the loop: request a move, validate it through the module, retry with a correction prompt, forfeit after N failures, apply the per-move timeout (AbortController), pause/resume/retry/resign, speed, and token and cost accounting. Consumers use `subscribe()` to get immutable snapshots.
- **`src/games/<game>/`**: one folder per game. `chess/module.ts` is the rules adapter over chess.js, which is the single source of truth for legality and outcomes. Its state wraps a mutable `Chess` instance plus an immutable `moves` array, and `version` is bumped on every move. `Board.tsx` is a custom board that uses `defaultPieces` from react-chessboard only for the SVG artwork.
- **`src/providers/`**: provider adapters (`ProviderAdapter` in `types.ts`), registered in `registry.ts`. Adding a provider means one file plus one line in the registry.
- **`src/lib/`**: localStorage helpers (`useStore`, namespaced with `STORAGE_PREFIX`), API keys (`keys.ts`), match history, the model-list cache (`models.ts`, in memory) and WebAudio sounds (synthesized, no assets).
- **`src/components/`**: UI. `App.tsx` orchestrates everything: settings, runner lifecycle, replay and view-ply browsing, and keyboard shortcuts.
- **`netlify/functions/proxy.mts`**: forwards to the URL in the `x-arena-target` header. It accepts only https on public hosts and only the `/chat/completions`, `/models` and `/messages` paths. It must never log headers or bodies.

## Conventions and non-obvious decisions
- **Keys never leave the browser** except in requests to the chosen provider, or through the proxy when the user enables it. Never add logging, analytics or storage of credentials.
- **Do not hardcode model names, prices or limits.** Models come from the provider. Show "unknown" when data is missing (`null` in `ModelInfo.pricing`).
- Player settings (model, effort, side) are frozen into the runner when the match starts. The UI locks the panels whenever a match (or replay) is active.
- Effort: `default` omits the parameter. On OpenRouter, `off` sends `reasoning.enabled=false` and low/medium/high send `reasoning.effort`. When a model is known not to support reasoning, the effort is forced to `default` at start.
- Styling is a single hand-written CSS file (`src/styles.css`) using CSS variables. Accents are `--p1` (green, Player 1) and `--p2` (orange, Player 2). Use the `.accent-p1` and `.accent-p2` classes to set `--accent` and `--accent-rgb`. Respect `prefers-reduced-motion`.
- `npm run build` is just `vite build`. Type-check separately with `npm run typecheck`.

## Next steps
New games (Connect Four, Uno, Debate) go in `src/games/<game>/`, implement `GameModule`, and are registered in `src/games/registry.ts`. The UI currently assumes chess, so a game picker and per-game board components would be the next step there. New providers (direct OpenAI, Anthropic, xAI, Gemini) each go in a single file in `src/providers/`.
