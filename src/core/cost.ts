import type { ModelInfo, Effort } from '../providers/types'

/**
 * Rough UPPER-BOUND estimate for one seat if the game runs to the move limit.
 * Prompt size is measured from the real first prompt; per-move output is a
 * heuristic (labelled as such in the UI). Returns null cost when pricing is unknown.
 */
const OUTPUT_GUESS: Record<Effort, number> = { off: 60, default: 600, low: 800, medium: 2500, high: 6000 }

export function estimateSeatCost(opts: {
  model: ModelInfo | undefined
  effort: Effort
  firstPromptChars: number
  maxPlies: number
}) {
  const turns = Math.ceil(opts.maxPlies / 2)
  const basePrompt = Math.ceil(opts.firstPromptChars / 4)
  // History grows ~3 tokens per ply; average over the game.
  const avgPrompt = basePrompt + Math.ceil((opts.maxPlies * 3) / 2)
  const reasoning = opts.model?.supportsReasoning === false ? 60 : OUTPUT_GUESS[opts.effort]
  const promptTokens = avgPrompt * turns
  const completionTokens = reasoning * turns
  const p = opts.model?.pricing
  const usd = p && p.prompt !== null && p.completion !== null ? promptTokens * p.prompt + completionTokens * p.completion : null
  return { promptTokens, completionTokens, usd }
}

/**
 * Upper-bound estimate for one debater (or the judge) over a whole debate.
 * Each turn re-sends the growing transcript, so prompt size grows linearly.
 */
export function estimateDebateCost(opts: {
  model: ModelInfo | undefined
  effort: Effort
  systemChars: number
  wordsPerTurn: number
  totalTurns: number
  /** 'debater' = this seat's turns; 'judge' = one read of the full transcript. */
  role: 'debater' | 'judge'
}) {
  const turnTokens = Math.ceil(opts.wordsPerTurn * 1.4)
  const base = Math.ceil(opts.systemChars / 4) + 120
  const reasoning = opts.model?.supportsReasoning === false ? 0 : OUTPUT_GUESS[opts.effort] - (opts.effort === 'off' ? 60 : 0)
  let promptTokens = 0
  let completionTokens = 0
  if (opts.role === 'judge') {
    promptTokens = base + opts.totalTurns * turnTokens
    completionTokens = 350 + reasoning
  } else {
    const mine = Math.ceil(opts.totalTurns / 2)
    for (let i = 0; i < mine; i++) promptTokens += base + i * 2 * turnTokens
    completionTokens = mine * (Math.ceil(turnTokens * SOFT) + reasoning)
  }
  const p = opts.model?.pricing
  const usd = p && p.prompt !== null && p.completion !== null ? promptTokens * p.prompt + completionTokens * p.completion : null
  return { promptTokens, completionTokens, usd }
}

const SOFT = 1.3
