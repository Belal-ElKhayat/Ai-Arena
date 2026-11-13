import { APP_CONFIG } from '../../config/app'
import type { SeatStats } from '../../core/types'
import { fmtCost, fmtDuration, fmtTokens } from '../../lib/format'
import type { AudienceVote } from '../../lib/history'
import { CRITERIA, type JudgeVerdict } from './judge'
import { STANCE_LABEL, type DebateSetup, type DebateTurn } from './module'

export interface DebateExport {
  setup: DebateSetup
  models: [string, string]
  turns: DebateTurn[]
  stats: [SeatStats, SeatStats]
  durationMs: number
  date: string
  verdict?: JudgeVerdict | null
  judgeModel?: string
  vote?: AudienceVote
}

const winnerName = (setup: DebateSetup, w: 0 | 1 | null) => (w === null ? 'Tie' : setup.names[w])

function voteText(e: DebateExport) {
  if (e.vote === 0 || e.vote === 1) return e.setup.names[e.vote]
  if (e.vote === 'tie') return 'Tie'
  return null
}

export function debateMarkdown(e: DebateExport) {
  const { setup } = e
  const lines: string[] = [
    `# ${setup.topic.trim()}`,
    '',
    `*${APP_CONFIG.APP_NAME} debate · ${new Date(e.date).toLocaleString()} · ${setup.format === 'structured' ? 'Structured' : 'Free-flow'} · ${e.turns.length} turns · ${fmtDuration(e.durationMs)}*`,
    '',
  ]
  for (const s of [0, 1] as const) {
    lines.push(`- **${setup.names[s]}** (${e.models[s] || 'unknown model'}) — ${STANCE_LABEL[setup.stances[s]]} · ${fmtTokens(e.stats[s].promptTokens + e.stats[s].completionTokens)} tokens · ${fmtCost(e.stats[s].costUsd, e.stats[s].costKnown && e.stats[s].requests > 0)}`)
  }
  lines.push('', '---', '')
  for (const t of e.turns) {
    lines.push(`### ${setup.names[t.seat]} — ${t.label}`, '')
    lines.push(t.skipped ? `*(turn skipped${t.note ? `: ${t.note}` : ''})*` : t.text, '')
  }
  const v = voteText(e)
  if (v || e.verdict) lines.push('---', '')
  if (v) lines.push(`**Audience vote:** ${v}`, '')
  if (e.verdict) {
    lines.push(`## Judge verdict${e.judgeModel ? ` (${e.judgeModel})` : ''}`, '', `**Winner:** ${winnerName(setup, e.verdict.winner)}`, '')
    lines.push(`| | ${setup.names[0]} | ${setup.names[1]} |`, '| --- | --- | --- |')
    for (const c of CRITERIA) lines.push(`| ${c[0].toUpperCase() + c.slice(1)} | ${e.verdict.scores[0][c]} | ${e.verdict.scores[1][c]} |`)
    lines.push('', e.verdict.explanation, '')
  }
  lines.push('', '> AI debates are generated text and may be inaccurate or one-sided. Do not treat them as facts.')
  return lines.join('\n')
}

export function debatePlainText(e: DebateExport) {
  const { setup } = e
  const out: string[] = [`${APP_CONFIG.APP_NAME} — Debate`, `Topic: ${setup.topic.trim()}`, `${setup.names[0]} (${STANCE_LABEL[setup.stances[0]]}) vs ${setup.names[1]} (${STANCE_LABEL[setup.stances[1]]})`, '']
  for (const t of e.turns) out.push(`${setup.names[t.seat]} — ${t.label}:`, t.skipped ? '(turn skipped)' : t.text, '')
  const v = voteText(e)
  if (v) out.push(`Audience vote: ${v}`)
  if (e.verdict) out.push(`Judge: ${winnerName(setup, e.verdict.winner)} — ${e.verdict.explanation}`)
  return out.join('\n').trim()
}
