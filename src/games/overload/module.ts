import type { GameModule, Outcome, Seat } from '../../core/types'
import { APP_CONFIG } from '../../config/app'
import type { ChessStyle } from '../chess/styles'
import { actionLabel, applyOverloadAction, createOverloadState, eventForSeat, itemName, legalActions, type OverloadAction, type OverloadOptions, type OverloadState } from './rules'

export const OVERLOAD_SIDES = ['player1', 'player2'] as const
const seatOf = (side: string): Seat => (side === 'player2' ? 1 : 0)
const sideOf = (seat: Seat) => OVERLOAD_SIDES[seat]

function legalList(state: OverloadState) {
  return legalActions(state).map((action, i) => `${i + 1}. ${actionLabel(action)}`).join('\n')
}

export function createOverloadModule(
  options: OverloadOptions,
  stylePrompts?: { styles: [ChessStyle, ChessStyle]; affects: 'moves' | 'comments' },
): GameModule<OverloadState, OverloadAction> {
  return {
    id: 'overload',
    title: APP_CONFIG.overload.name,
    sides: OVERLOAD_SIDES,
    exhaustedPolicy: 'forfeit',
    createState: () => createOverloadState(options),
    currentSide: (state) => sideOf(state.turn),
    plyCount: (state) => state.actions.length,
    systemPrompt: (side) => {
      const seat = seatOf(side)
      return [
        `You are Player ${seat + 1} in Overload, a non-violent hidden-information risk game played with power cells and a surge cannon.`,
        stylePrompts && stylePrompts.affects === 'moves' ? `PLAYING STYLE (${stylePrompts.styles[seat].name}): let this shape which listed action you prefer and the tone of your comment:\n<style>\n${stylePrompts.styles[seat].prompt}\n</style>` : '',
        stylePrompts && stylePrompts.affects === 'comments' ? `PERSONALITY (${stylePrompts.styles[seat].name}): this affects your COMMENT only. Choose your action purely on game strength, as if you had no personality:\n<style>\n${stylePrompts.styles[seat].prompt}\n</style>` : '',
        'The engine is the sole source of truth. Follow its numbered legal actions; choose exactly one action per request.',
        'A turn may request several item actions in sequence, followed by one mandatory fire action. Items do not end your turn.',
        'A charged round fired at the opponent removes one cell, or two if your Overcharge is active. A dud does nothing.',
        'Firing at yourself with a dud grants another turn. A charged self-fire costs you one cell and ends your turn.',
        'You may only use information present in your prompt. Never claim that a private Scanner result is a public game fact; bluffing in your COMMENT is allowed.',
        'Reply in exactly two lines:',
        'ACTION: <one listed action number>',
        'COMMENT: <one sentence>',
      ].join('\n')
    },
    turnPrompt: (state, side) => {
      const seat = seatOf(side)
      const own = state.items[seat]
      const other = state.items[1 - seat]
      const reveals = state.events
        .filter((event) => event.type === 'item' && event.item === 'scanner' && event.revealedTo === seat)
        .map((event) => `Round ${event.round}: ${event.result}`)
      const log = state.events.map((event) => {
        const view = eventForSeat(event, seat)
        const result = 'result' in view && view.result ? ` → ${view.result}` : ''
        const reveal = 'privateScannerReveal' in view && view.privateScannerReveal ? ` (your private scan: ${view.privateScannerReveal})` : ''
        const counts = event.counts ? ` ${event.counts.charged} charged / ${event.counts.dud} dud` : ''
        const comment = event.item === 'scanner' && event.actor !== seat ? '' : event.comment
        return `R${event.round} P${event.actor + 1}: ${event.type}${event.item ? ` ${itemName(event.item)}` : ''}${event.target ? ` at ${event.target}` : ''}${result}${reveal}${counts}${event.damage ? `, ${event.damage} cell damage` : ''}${event.note ? ` (${event.note})` : ''}${comment ? ` — "${comment}"` : ''}`
      })
      return [
        `Match round ${state.round} of ${state.rounds}. You are Player ${seat + 1}; it is your turn.`,
        `Cells: you ${state.cells[seat]}/${state.maxCells}; opponent ${state.cells[1 - seat]}/${state.maxCells}.`,
        `Your held items: ${own.length ? own.map(itemName).join(', ') : 'none'}.`,
        `Opponent held items: ${other.length ? other.map(itemName).join(', ') : 'none'}.`,
        `At the start of this cannon load: ${state.loadCounts.charged} charged and ${state.loadCounts.dud} dud rounds. Order is hidden.`,
        `Your active Overcharge: ${state.overcharged[seat] ? 'yes' : 'no'}. Opponent is locked for their next turn: ${state.locked[1 - seat] ? 'yes' : 'no'}.`,
        `Your Scanner results: ${reveals.length ? reveals.join('; ') : 'none'}.`,
        'Public history (fired/ejected rounds are revealed):',
        log.length ? log.join('\n') : '(no actions yet)',
        'Legal actions:',
        legalList(state),
        '',
        'Reply with exactly:',
        'ACTION: <number>',
        'COMMENT: <one sentence>',
      ].join('\n')
    },
    correctionPrompt: (state, error, attempt) => [
      `The previous reply was rejected: ${error}. Attempt ${attempt} failed.`,
      'Choose one action from this current legal list:',
      legalList(state),
      '',
      'Reply in exactly two lines:',
      'ACTION: <one listed action number>',
      'COMMENT: <one sentence>',
    ].join('\n'),
    parseReply: (state, text) => {
      const clean = (text ?? '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim()
      const actionLine = clean.match(/^ACTION\s*:\s*(\d+)\s*$/im)
      const comment = clean.match(/^COMMENT\s*:\s*(.+)$/im)?.[1]?.trim().replace(/\s+/g, ' ').slice(0, 220) ?? ''
      if (!actionLine || !comment) return { ok: false, error: 'reply must contain ACTION: <number> and COMMENT: <one sentence>' }
      const index = Number(actionLine[1]) - 1
      const actions = legalActions(state)
      if (!Number.isInteger(index) || index < 0 || index >= actions.length) {
        return { ok: false, error: `action number must be from 1 to ${actions.length}` }
      }
      return { ok: true, move: actions[index], comment }
    },
    applyMove: (state, action, comment) => applyOverloadAction(state, action, comment),
    forfeitInvalid: (state, _side, reason) => applyOverloadAction(state, { type: 'forfeit', reason }, ''),
    outcome: (state): Outcome =>
      state.matchOver
        ? { over: true, winnerSide: state.matchWinner === 'draw' || state.matchWinner === null ? null : sideOf(state.matchWinner), reason: state.matchWinner === 'draw' ? 'Match drawn' : `${state.roundResults.filter((r) => r.winner === state.matchWinner).length} of ${state.rounds} rounds won` }
        : { over: false },
    limitOutcome: (state) => ({
      over: true,
      winnerSide: state.matchWinner === 'draw' || state.matchWinner === null ? null : sideOf(state.matchWinner),
      reason: `Action limit reached after ${state.events.length} events`,
    }),
  }
}
