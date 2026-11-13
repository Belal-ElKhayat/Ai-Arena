# AI Arena

Watch AI models compete in **Chess**, **Connect Four**, **Pentago**, **Uno**, **Overload**, or a spoken **Debate**. Pick a model for each seat, press start, and the models take turns. Each one comments on its moves, and the app tracks tokens, cost and thinking time.

The product name lives in `src/config/app.ts` (`APP_NAME`). Change it there and it updates everywhere.

## Highlights

- Glass UI with green and orange glows, a frosted board frame, and 2D, tilted 3D and flipped board views. There are 5 board themes and 3 piece themes.
- chess.js is the only source of truth for the rules: legality, check, mate, stalemate, repetition, the 50-move rule and insufficient material.
- On each turn the model gets the FEN, the SAN history and every legal move. It must reply in a strict `MOVE:` / `COMMENT:` format. If the reply is invalid, the model is told why and gets another try. After 3 invalid replies it forfeits.
- API errors, rate limits and timeouts pause the match with a clear message and a **Retry** button.
- You set a maximum number of moves and a per-move timeout. Before the match starts, a pre-flight screen shows the worst-case cost when pricing is available.
- Model lists come live from OpenRouter's public `/models` endpoint. Nothing is hardcoded, and any value the provider doesn't supply shows as "unknown".
- Match history is kept in localStorage, with replay, PGN export and shareable result text.
- Uno supports two to four AI players, configurable 5/7/9-card starting hands, private model hands, a full-information/fair spectator toggle, and a custom animated table. It uses a simplified 104-card deck: numbers, Skip, Reverse, Draw Two and Wild. There is no stacking or Wild Draw Four; forgetting to call Uno automatically draws two cards.
- Includes sound effects (with a mute toggle), keyboard shortcuts, reduced-motion support and a layout that stacks on mobile.

## Privacy

API keys are stored **only** in your browser's localStorage. They are sent **only** to the provider you pick for each player, and nothing is logged. There is no backend that stores data.

For providers that block direct browser requests, you can turn on the optional proxy for each provider in the key dialog. The proxy is `netlify/functions/proxy.mts`. It is stateless and only forwards the request to the provider. It doesn't store or log anything, and it only accepts public https chat and model-list endpoints.

## Tech

Vite, React 19, TypeScript, chess.js, and react-chessboard (only its piece artwork is used; the board is custom). The optional proxy is a Netlify Function.

## Run locally

```bash
npm install
npm run dev          # Vite dev server, direct provider calls
# or, to also run the proxy function locally:
netlify dev
```

`npm run typecheck` runs TypeScript on its own. `npm run build` produces `dist/`.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Pause / resume (or play/pause a replay) |
| ← / → | Step through moves (Pentago: placements and twists) |
| V | Cycle board view |
| M | Mute |

## Project structure

```
src/
  config/app.ts          Product name, defaults, speeds (one place to rebrand)
  core/
    types.ts             GameModule contract + match/runner types
    matchRunner.ts       Shared, game-agnostic match loop
    cost.ts              Pre-match cost estimate
  games/
    registry.ts          List of game modules
    chess/               Chess module: prompts, parsing, PGN, board, themes
    uno/                 Uno deck/rules, legal actions and private turn prompts
  modes/
    UnoMode.tsx          Multiplayer table, setup, match loop and replay
  providers/
    types.ts             ProviderAdapter interface
    registry.ts          List of adapters
    openrouter.ts        OpenRouter (default)
    customOpenAI.ts      Any OpenAI-compatible endpoint (base URL + key)
    openaiCompatible.ts  Shared /chat/completions helper
    http.ts              fetch wrapper, error mapping, proxy routing
  lib/                   localStorage, keys, history, sound, model list cache
  components/            Glass UI components
netlify/functions/proxy.mts   Optional stateless pass-through proxy
```

## Adding a provider adapter

Adding a provider takes one new file plus one line in the registry:

1. Create `src/providers/<name>.ts` that exports a `ProviderAdapter` (see `src/providers/types.ts`):
   - `listModels(credentials)` returns `ModelInfo[]` (use `null` for unknown pricing or context).
   - `sendMove({ model, messages, effort, credentials, signal })` returns `{ text, usage }`.
   - `effortSupport(model)` returns `true`, `false` or `null` (unknown). Map `Effort` to the provider's reasoning or thinking setting.
   - `hasCredentials(credentials)` and `needsBaseUrl`.
2. Add it to the `PROVIDERS` array in `src/providers/registry.ts`.

OpenAI, xAI and most other providers can reuse `chatCompletion()` from `openaiCompatible.ts`. Anthropic and Gemini need their own request shape. Call `providerFetch()` from `http.ts` so the proxy toggle and error handling work for free. If the new host needs extra headers through the proxy (for example `x-api-key` or `anthropic-version`), they are already on the proxy's allowlist.

## Tests

```bash
npm test             # Node's built-in test runner, no extra dependencies
```

`tests/` checks the Connect Four and Pentago win detection, Uno rules and private prompts, and the chess style data.

## Chess playing styles

Each chess player has a **Style** (Balanced by default, plus Aggressive, Defensive, Positional, Tactical Sniper, Trash Talker, Gotham Chaos, Gambit King, Endgame Grinder, Blitz Panic, and a private **Custom** style of up to 600 characters). The style text is added to that player's system prompt, between the role and the strict `MOVE:` / `COMMENT:` format, so the format is always the last instruction. The model still receives the FEN, the SAN history and every legal move, and chess.js still validates every reply.

- **Style affects** (on the pre-match screen): *Move choice and comments* or *Comments only* (a pure strength test with personality in the comments).
- The style pair is saved with each match. History → **Style record** shows wins, losses and draws per style, computed from saved matches only.

Styles shape move *preference*, not the rules. Strong models still play well in any style, so expect flavour more than blunders.

### How to add a new style

All style data lives in `src/games/chess/styles.json`. Add an object with:

- `id`: unique, lowercase
- `name`
- `icon`: one of `scale sword shield compass target chat mask crown hourglass bolt pen`, or add an SVG in `src/components/Icons.tsx` and map it in `StylePicker.tsx`
- `accent`: hex colour, keep it in the green/orange family
- `description`: one line
- `prompt`: max 600 characters; describe preferences and comment tone, and never redefine the reply format

`npm test` checks the length and fields.

## Connect Four

A 7×6 board. Each turn the model gets the board as a lettered grid, the move history as column numbers and the legal columns, and must reply with `COLUMN: <1-7>` and `COMMENT:`. An invalid reply is sent back with the reason and the legal columns; after 3 failures that side forfeits. The win and draw logic lives in `src/games/connect4/rules.ts`, a small pure module. *Random opening* plays the first 2 moves at random.

## Pentago

A 6×6 board made of four 3×3 quadrants: Q1 top-left, Q2 top-right, Q3 bottom-left, Q4 bottom-right. Cells are named by row A–F and column 1–6 (e.g. `C4`). Every turn has two mandatory steps: place a marble on an empty cell, then rotate one quadrant 90° clockwise or counter-clockwise.

The model replies with:

```
PLACE: C4
ROTATE: Q2 CW
COMMENT: one sentence
```

Rules follow standard Pentago and live in `src/games/pentago/rules.ts`, a pure module tested in `tests/pentago.test.ts`:

- Five in a row (horizontal, vertical or diagonal, across quadrant borders; six also counts) **after the placement** wins at once, and the twist is skipped.
- Otherwise the twist is applied. If it creates five for only one colour, that colour wins, even if it is the opponent's.
- Five for both colours at once is a **draw**. A full board (36 turns) with no five is a **draw**.

Invalid replies (an occupied or unknown cell, a missing rotation, an unknown quadrant or direction) are sent back with the specific error and the valid options. After 3 failures that side forfeits. In the UI each turn shows as two steps, the placement and then the animated twist, and replays step through them one at a time with ← / →. *Random opening* makes the first 2 turns random placements and twists.

## Overload mode

**OVERLOAD** is a seeded, hidden-information risk game for two AI models. A match is best of 1, 3 or 5 rounds. At the start of each round both players receive the same 2–4 power cells (random or configured), then each cannon load contains 2–8 rounds: a random mix of charged rounds and duds. Both models learn the load counts, never the order. Players also receive items at the start of each load (up to four held).

On each turn a model may use any number of its legal items and must then fire once. Firing at the opponent costs them one cell on a charged round (two with Overcharge), while a dud does nothing. Firing at yourself on a dud grants another turn; a charged self-fire costs one cell and ends the turn. Every fired or ejected round is public. A Scanner privately reveals the current round to its user; an Eject removes and reveals that round publicly. Repair Kit restores one cell up to the round maximum, Overcharge boosts the next charged shot at the opponent, and Lockdown skips the opponent’s next turn without allowing a chain. A player reaching zero cells loses that round; most round wins take the match.

The rules and seeded random generator live in `src/games/overload/rules.ts`; model prompts are built in `src/games/overload/module.ts` from the model's allowed view, never the true chamber order. The spectator overlay can show that order to a human viewer, and is frozen at match start. Styles are in `src/games/overload/styles.json`. For the first matchup, try **Calculator vs Gambler**.

### Adding an Overload item

Add its id to `ItemId` and display name to `ITEM_NAMES` in `src/games/overload/rules.ts`. Then implement its legal-use condition in `legalActions`, and its one-time effect in `applyOverloadAction`. If it changes the model’s allowed information, update the seat-filtered prompt in `src/games/overload/module.ts` without exposing chamber order or another player's Scanner result. Add a focused deterministic test in `tests/overload.test.ts` and describe the item here.

### Manual Overload checks

- Start Calculator vs Gambler with the spectator toggle on, then off; confirm both model prompts only contain counts and allowed history, never chamber order.
- Use Scanner and confirm only its user receives the result; use Eject and confirm the removed round appears publicly in the history strip.
- Check Repair Kit at full and reduced cells, Overcharge damage/reset, and a Lockdown skip followed by an unavailable chain.
- Complete a best-of-1, save it, reopen it from History, and step through actions with ← / →; test spectator chamber display and Copy result.
- Try an invalid model reply and a timeout; confirm the shared retry/error and invalid-reply forfeit handling remains visible.

## Debate mode

Two models argue a topic. Each has a stance (For / Against / Free choice) and private instructions that only that model sees. Turns follow a Structured format (opening, rebuttals, closing) or Free-flow, with a soft word cap. An optional AI judge reads the transcript (never the private instructions) and scores logic, evidence, rhetoric and rebuttal, and an optional audience vote happens before the verdict is revealed. Replies stream token by token where the provider supports it. Refusals and errors show Retry / Skip turn.

Voice uses a pluggable engine (`src/voice/`). To add a TTS engine, implement `VoiceEngine` (`listVoices`, `speak` resolving when playback ends or the signal aborts, `stop`) in one file and register it in `src/voice/registry.ts`. The paid engines are currently "coming soon" stubs in `src/voice/stubs.ts`.

## Adding a game

Each game is a module in `src/games/<game>/` implementing `GameModule` (`src/core/types.ts`): initial state, whose turn it is, prompts, reply parsing and validation, applying a move, and the outcome. Register it in `src/games/registry.ts` and add a mode component in `src/modes/`. The shared `MatchRunner` handles turn-taking, retries, forfeits, timeouts, pause, speed, streaming, and token and cost accounting. **Uno** is next.
