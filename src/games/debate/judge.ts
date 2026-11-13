import type { PlayerConfig, Seat, SeatStats } from '../../core/types'
import { getProvider } from '../../providers/registry'
import type { ChatMessage, Credentials, ModelInfo } from '../../providers/types'
import { ProviderError } from '../../providers/types'
import { STANCE_LABEL, type DebateSetup, type DebateTurn } from './module'

export const CRITERIA = ['logic', 'evidence', 'rhetoric', 'rebuttal'] as const
export type Criterion = (typeof CRITERIA)[number]
export type Scores = Record<Criterion, number>

export interface JudgeVerdict {
  /** null = tie */
  winner: Seat | null
  scores: [Scores, Scores]
  explanation: string
}

/** The judge sees only the public transcript — never the private instructions. */
function judgeMessages(setup: DebateSetup, turns: DebateTurn[]): ChatMessage[] {
  const [a, b] = setup.names
  const transcript = turns
    .map((t) => `[${t.seat === 0 ? 'A' : 'B'} · ${setup.names[t.seat]} — ${t.label}]\n${t.skipped ? '(turn skipped)' : t.text}`)
    .join('\n\n')
  return [
    {
      role: 'system',
      content:
        'You are an impartial, experienced debate judge. Judge only the quality of argument in the transcript, not your own opinion on the topic. Be fair to both sides and resist favouring whoever spoke last.',
    },
    {
      role: 'user',
      content: [
        `Topic: "${setup.topic.trim()}"`,
        `Debater A: ${a} (position: ${STANCE_LABEL[setup.stances[0]]})`,
        `Debater B: ${b} (position: ${STANCE_LABEL[setup.stances[1]]})`,
        '',
        'Full transcript:',
        transcript || '(empty)',
        '',
        'Score each debater from 0 to 10 on: logic, evidence, rhetoric, rebuttal. Then pick a winner ("A", "B" or "tie") and explain in 2–4 sentences.',
        'Reply with ONLY this JSON object, no other text:',
        '{"winner":"A","scores":{"A":{"logic":0,"evidence":0,"rhetoric":0,"rebuttal":0},"B":{"logic":0,"evidence":0,"rhetoric":0,"rebuttal":0}},"explanation":"..."}',
      ].join('\n'),
    },
  ]
}

const clamp = (n: unknown) => {
  const v = Number(n)
  return Number.isFinite(v) ? Math.max(0, Math.min(10, Math.round(v * 10) / 10)) : 0
}

export function parseVerdict(text: string): JudgeVerdict | null {
  const cleaned = text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let data: any
  try {
    data = JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
  const w = String(data?.winner ?? '').trim().toUpperCase()
  const winner: Seat | null = w === 'A' ? 0 : w === 'B' ? 1 : null
  const sc = (k: 'A' | 'B'): Scores => {
    const s = data?.scores?.[k] ?? data?.scores?.[k.toLowerCase()] ?? {}
    return { logic: clamp(s.logic), evidence: clamp(s.evidence), rhetoric: clamp(s.rhetoric), rebuttal: clamp(s.rebuttal) }
  }
  const explanation = String(data?.explanation ?? '').trim()
  if (!explanation && !data?.scores) return null
  return { winner, scores: [sc('A'), sc('B')], explanation }
}

export const emptyJudgeStats = (): SeatStats => ({
  promptTokens: 0,
  completionTokens: 0,
  costUsd: 0,
  costKnown: true,
  timeMs: 0,
  requests: 0,
  illegalReplies: 0,
  lastComment: '',
})

/** Ask the judge model for a verdict. Retries once if the JSON can't be parsed. */
export async function runJudge(opts: {
  judge: PlayerConfig
  setup: DebateSetup
  turns: DebateTurn[]
  credentials: Credentials
  modelInfo?: ModelInfo
  timeoutMs: number
  signal?: AbortSignal
  onStats?: (s: SeatStats) => void
}): Promise<{ verdict: JudgeVerdict; stats: SeatStats }> {
  const provider = getProvider(opts.judge.providerId)
  const messages = judgeMessages(opts.setup, opts.turns)
  const stats = emptyJudgeStats()
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctrl = new AbortController()
    const onAbort = () => ctrl.abort()
    opts.signal?.addEventListener('abort', onAbort)
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      ctrl.abort()
    }, opts.timeoutMs)
    const t0 = performance.now()
    try {
      const res = await provider.sendMove({
        model: opts.judge.modelId,
        messages,
        effort: opts.judge.effort,
        credentials: opts.credentials,
        signal: ctrl.signal,
        modelInfo: opts.modelInfo,
      })
      const p = res.usage.promptTokens
      const c = res.usage.completionTokens
      let cost = res.usage.costUsd
      const pr = opts.modelInfo?.pricing
      if (cost === null && pr && pr.prompt !== null && pr.completion !== null) cost = p * pr.prompt + c * pr.completion
      stats.promptTokens += p
      stats.completionTokens += c
      stats.requests += 1
      stats.timeMs += performance.now() - t0
      stats.costKnown = stats.costKnown && cost !== null
      stats.costUsd = cost === null ? stats.costUsd : (stats.costUsd ?? 0) + cost
      opts.onStats?.({ ...stats })
      const verdict = parseVerdict(res.text)
      if (verdict) return { verdict, stats }
      stats.illegalReplies += 1
      messages.push({ role: 'assistant', content: res.text || '(empty reply)' })
      messages.push({ role: 'user', content: 'That was not valid JSON. Reply again with ONLY the JSON object in the exact format requested.' })
    } catch (err) {
      if (timedOut) throw new ProviderError(`The judge didn’t reply within ${Math.round(opts.timeoutMs / 1000)}s.`, { kind: 'timeout' })
      throw err
    } finally {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
    }
  }
  throw new ProviderError('The judge did not return a readable verdict.', { kind: 'bad_request' })
}
