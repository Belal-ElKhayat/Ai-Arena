import type { Seat } from '../../core/types'

export type RoundKind = 'charged' | 'dud'
export type ItemId = 'scanner' | 'eject' | 'repair' | 'overcharge' | 'lockdown'
export type ItemFrequency = 'low' | 'normal' | 'high'
export type StartingCells = 'random' | 2 | 3 | 4
export type OverloadAction =
  | { type: 'item'; item: ItemId }
  | { type: 'fire'; target: 'opponent' | 'self' }
  | { type: 'forfeit'; reason: string }

export interface OverloadEvent {
  round: number
  actor: Seat
  type: 'load' | 'item' | 'fired' | 'ejected' | 'lockdown-skip' | 'forfeit'
  item?: ItemId
  result?: RoundKind
  target?: 'opponent' | 'self'
  damage?: number
  revealedTo?: Seat
  counts?: { charged: number; dud: number }
  comment: string
  note?: string
}

export interface OverloadRoundResult {
  round: number
  winner: Seat
  reason: string
  selfFires: [number, number]
  itemsUsed: [number, number]
}

export interface OverloadOptions {
  seed: number
  rounds: 1 | 3 | 5
  startingCells: StartingCells
  itemFrequency: ItemFrequency
  firstSeat: Seat
}

export interface OverloadState extends OverloadOptions {
  rngState: number
  round: number
  turn: Seat
  cells: [number, number]
  maxCells: number
  items: [ItemId[], ItemId[]]
  overcharged: [boolean, boolean]
  locked: [boolean, boolean]
  lockedLastTurn: [boolean, boolean]
  chamber: RoundKind[]
  loadCounts: { charged: number; dud: number }
  events: OverloadEvent[]
  actions: Array<{ action: OverloadAction; comment: string }>
  roundResults: OverloadRoundResult[]
  selfFires: [number, number]
  itemsUsed: [number, number]
  matchWinner: Seat | null | 'draw'
  matchOver: boolean
}

const ITEM_IDS: ItemId[] = ['scanner', 'eject', 'repair', 'overcharge', 'lockdown']
const ITEM_NAMES: Record<ItemId, string> = {
  scanner: 'Scanner',
  eject: 'Eject',
  repair: 'Repair Kit',
  overcharge: 'Overcharge',
  lockdown: 'Lockdown',
}

export const itemName = (id: ItemId) => ITEM_NAMES[id]

export function eventForSeat(event: OverloadEvent, seat: Seat) {
  const { result, ...publicEvent } = event
  if (event.type === 'fired' || event.type === 'ejected') return event
  if (event.type === 'item' && event.item === 'scanner' && event.revealedTo === seat) {
    return { ...publicEvent, privateScannerReveal: result }
  }
  return publicEvent
}

function randomInt(state: { rngState: number }, maxExclusive: number): number {
  state.rngState = (state.rngState + 0x6d2b79f5) | 0
  let t = state.rngState
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return Math.floor(value * maxExclusive)
}

function loadCannon(state: OverloadState) {
  const length = 2 + randomInt(state, 7)
  const charged = 1 + randomInt(state, length - 1)
  const chamber: RoundKind[] = [...Array<RoundKind>(charged).fill('charged'), ...Array<RoundKind>(length - charged).fill('dud')]
  for (let i = chamber.length - 1; i > 0; i--) {
    const j = randomInt(state, i + 1)
    ;[chamber[i], chamber[j]] = [chamber[j], chamber[i]]
  }
  state.chamber = chamber
  state.loadCounts = { charged, dud: length - charged }
  state.events.push({
    round: state.round,
    actor: state.turn,
    type: 'load',
    counts: { ...state.loadCounts },
    comment: '',
    note: 'New cannon load',
  })

  const maxDeal = state.itemFrequency === 'low' ? 1 : state.itemFrequency === 'normal' ? 2 : 3
  const minDeal = state.itemFrequency === 'high' ? 2 : 1
  for (const seat of [0, 1] as const) {
    const amount = minDeal + randomInt(state, maxDeal - minDeal + 1)
    for (let i = 0; i < amount && state.items[seat].length < 4; i++) {
      state.items[seat].push(ITEM_IDS[randomInt(state, ITEM_IDS.length)])
    }
  }
}

function initializeRound(state: OverloadState, round: number) {
  state.round = round
  const cells = state.startingCells === 'random' ? 2 + randomInt(state, 3) : state.startingCells
  state.maxCells = cells
  state.cells = [cells, cells]
  state.items = [[], []]
  state.overcharged = [false, false]
  state.locked = [false, false]
  state.lockedLastTurn = [false, false]
  state.selfFires = [0, 0]
  state.itemsUsed = [0, 0]
  state.turn = (round % 2 === 1 ? state.firstSeat : (1 - state.firstSeat)) as Seat
  loadCannon(state)
}

export function createOverloadState(options: OverloadOptions): OverloadState {
  const seed = options.seed >>> 0
  const state: OverloadState = {
    ...options,
    seed,
    rngState: seed,
    round: 0,
    turn: options.firstSeat,
    cells: [0, 0],
    maxCells: 0,
    items: [[], []],
    overcharged: [false, false],
    locked: [false, false],
    lockedLastTurn: [false, false],
    chamber: [],
    loadCounts: { charged: 0, dud: 0 },
    events: [],
    actions: [],
    roundResults: [],
    selfFires: [0, 0],
    itemsUsed: [0, 0],
    matchWinner: null,
    matchOver: false,
  }
  initializeRound(state, 1)
  return state
}

export function legalActions(state: OverloadState): OverloadAction[] {
  if (state.matchOver) return []
  const seat = state.turn
  const actions: OverloadAction[] = []
  const held = state.items[seat]
  const has = (id: ItemId) => held.includes(id)
  if (state.chamber.length) {
    if (has('scanner')) actions.push({ type: 'item', item: 'scanner' })
    if (has('eject')) actions.push({ type: 'item', item: 'eject' })
  }
  if (has('repair') && state.cells[seat] < state.maxCells) actions.push({ type: 'item', item: 'repair' })
  if (has('overcharge') && !state.overcharged[seat]) actions.push({ type: 'item', item: 'overcharge' })
  if (has('lockdown') && !state.locked[1 - seat] && !state.lockedLastTurn[1 - seat]) actions.push({ type: 'item', item: 'lockdown' })
  actions.push({ type: 'fire', target: 'opponent' }, { type: 'fire', target: 'self' })
  return actions
}

function finishRound(state: OverloadState, winner: Seat, reason: string) {
  state.roundResults.push({
    round: state.round,
    winner,
    reason,
    selfFires: [...state.selfFires],
    itemsUsed: [...state.itemsUsed],
  })
  const needed = Math.floor(state.rounds / 2) + 1
  const wins: [number, number] = [0, 0]
  for (const result of state.roundResults) wins[result.winner]++
  if (wins[winner] >= needed) {
    state.matchWinner = winner
    state.matchOver = true
  } else if (state.roundResults.length >= state.rounds) {
    state.matchWinner = wins[0] === wins[1] ? 'draw' : wins[0] > wins[1] ? 0 : 1
    state.matchOver = true
  } else {
    initializeRound(state, state.round + 1)
  }
}

function advanceAfterTurn(state: OverloadState, actor: Seat) {
  const opponent = (1 - actor) as Seat
  if (state.locked[opponent]) {
    state.locked[opponent] = false
    state.lockedLastTurn[opponent] = true
    state.events.push({
      round: state.round,
      actor: opponent,
      type: 'lockdown-skip',
      comment: '',
      note: 'Turn skipped by Lockdown',
    })
    state.turn = actor
  } else {
    state.lockedLastTurn[actor] = false
    state.turn = opponent
  }
  if (!state.chamber.length && !state.matchOver && state.round === state.roundResults.length + 1) loadCannon(state)
}

/** Applies one selected legal action. The chamber order remains engine-only state. */
export function applyOverloadAction(state: OverloadState, action: OverloadAction, comment = ''): OverloadState {
  if (state.matchOver) return state
  const next: OverloadState = {
    ...state,
    cells: [...state.cells],
    items: [state.items[0].slice(), state.items[1].slice()],
    overcharged: [...state.overcharged],
    locked: [...state.locked],
    lockedLastTurn: [...state.lockedLastTurn],
    chamber: state.chamber.slice(),
    loadCounts: { ...state.loadCounts },
    events: state.events.slice(),
    actions: state.actions.slice(),
    roundResults: state.roundResults.slice(),
    selfFires: [...state.selfFires],
    itemsUsed: [...state.itemsUsed],
  }
  const actor = next.turn
  if (action.type === 'forfeit') {
    next.actions.push({ action, comment })
    next.events.push({ round: next.round, actor, type: 'forfeit', comment, note: action.reason })
    finishRound(next, (1 - actor) as Seat, `${actor === 0 ? 'Player 1' : 'Player 2'} forfeited: ${action.reason}`)
    return next
  }
  if (!legalActions(next).some((candidate) => JSON.stringify(candidate) === JSON.stringify(action))) return next
  next.actions.push({ action, comment })

  if (action.type === 'item') {
    next.items[actor].splice(next.items[actor].indexOf(action.item), 1)
    next.itemsUsed[actor]++
    next.events.push({ round: next.round, actor, type: 'item', item: action.item, comment: action.item === 'scanner' ? '' : comment })
    if (action.item === 'scanner') {
      next.events[next.events.length - 1].revealedTo = actor
      next.events[next.events.length - 1].result = next.chamber[0]
    } else if (action.item === 'eject') {
      const result = next.chamber.shift()!
      next.events[next.events.length - 1].type = 'ejected'
      next.events[next.events.length - 1].result = result
      if (!next.chamber.length) loadCannon(next)
    } else if (action.item === 'repair') {
      next.cells[actor] = Math.min(next.maxCells, next.cells[actor] + 1)
    } else if (action.item === 'overcharge') {
      next.overcharged[actor] = true
    } else if (action.item === 'lockdown') {
      next.locked[(1 - actor) as Seat] = true
    }
    return next
  }

  const result = next.chamber.shift()!
  const target = action.target === 'self' ? actor : ((1 - actor) as Seat)
  const damage = result === 'charged' ? action.target === 'self' ? 1 : next.overcharged[actor] ? 2 : 1 : 0
  next.events.push({ round: next.round, actor, type: 'fired', result, target: action.target, damage, comment })
  if (action.target === 'self') next.selfFires[actor]++
  if (result === 'charged') next.overcharged[actor] = false
  next.cells[target] = Math.max(0, next.cells[target] - damage)
  if (next.cells[target] === 0) {
    finishRound(next, action.target === 'self' ? opponentOf(actor) : actor, `${target === 0 ? 'Player 1' : 'Player 2'} ran out of power cells`)
    return next
  }
  if (action.target === 'self' && result === 'dud') {
    if (!next.chamber.length) loadCannon(next)
    return next
  }
  advanceAfterTurn(next, actor)
  return next
}

const opponentOf = (seat: Seat): Seat => (1 - seat) as Seat

export function replayOverloadActions(options: OverloadOptions, actions: Array<{ action: OverloadAction; comment: string }>) {
  return actions.reduce((state, entry) => applyOverloadAction(state, entry.action, entry.comment), createOverloadState(options))
}

export const actionLabel = (action: OverloadAction) =>
  action.type === 'item' ? `Use ${itemName(action.item)}` : action.type === 'fire' ? `Fire at ${action.target}` : 'Forfeit round'
