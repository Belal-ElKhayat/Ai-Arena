export const UNO_COLORS = ['red', 'yellow', 'green', 'blue'] as const
export type UnoColor = (typeof UNO_COLORS)[number]
export type UnoKind = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild'

export interface UnoCard {
  id: number
  color: UnoColor | null
  kind: UnoKind
  value: number | null
}

export interface UnoPlayer {
  name: string
  hand: UnoCard[]
}

export interface UnoAction {
  player: number
  type: 'play' | 'draw' | 'penalty'
  card?: UnoCard
  cardIndex?: number
  chosenColor?: UnoColor
  declaredUno?: boolean
  comment: string
}

export interface UnoState {
  players: UnoPlayer[]
  drawPile: UnoCard[]
  discardPile: UnoCard[]
  currentPlayer: number
  direction: 1 | -1
  currentColor: UnoColor
  actions: UnoAction[]
  winner: number | null
  version: number
  randomSeed: number
  startingHand: 5 | 7 | 9
}

export type UnoMove =
  | { type: 'draw'; comment: string }
  | { type: 'play'; cardIndex: number; chosenColor?: UnoColor; declaredUno: boolean; comment: string }

const nextId = (() => {
  let id = 0
  return () => id++
})()

export function createDeck(): UnoCard[] {
  const cards: UnoCard[] = []
  for (const color of UNO_COLORS) {
    cards.push({ id: nextId(), color, kind: 'number', value: 0 })
    for (let value = 1; value <= 9; value++) {
      for (let copy = 0; copy < 2; copy++) cards.push({ id: nextId(), color, kind: 'number', value })
    }
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      for (let copy = 0; copy < 2; copy++) cards.push({ id: nextId(), color, kind, value: null })
    }
  }
  for (let copy = 0; copy < 4; copy++) cards.push({ id: nextId(), color: null, kind: 'wild', value: null })
  return cards
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function nextRandom(seed: number): { value: number; seed: number } {
  const nextSeed = (seed + 0x6d2b79f5) >>> 0
  let value = nextSeed
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return { value: ((value ^ (value >>> 14)) >>> 0) / 4294967296, seed: nextSeed }
}

function shuffleWithSeed<T>(items: T[], initialSeed: number): { items: T[]; seed: number } {
  const result = [...items]
  let seed = initialSeed >>> 0
  for (let i = result.length - 1; i > 0; i--) {
    const next = nextRandom(seed)
    seed = next.seed
    const j = Math.floor(next.value * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return { items: result, seed }
}

function newSeed(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const seed = new Uint32Array(1)
    crypto.getRandomValues(seed)
    return seed[0] || 1
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
}

export function createUnoState(names: string[], seed = newSeed(), startingHand: 5 | 7 | 9 = 7): UnoState {
  if (names.length < 2 || names.length > 4) throw new RangeError('Uno supports 2 to 4 players')
  const shuffled = shuffleWithSeed(createDeck(), seed)
  const deck = shuffled.items
  const players = names.map((name) => ({ name, hand: deck.splice(0, startingHand) }))
  const firstIndex = deck.findIndex((card) => card.kind === 'number')
  const [firstCard] = deck.splice(firstIndex, 1)
  return {
    players,
    drawPile: deck,
    discardPile: [firstCard],
    currentPlayer: 0,
    direction: 1,
    currentColor: firstCard.color!,
    actions: [],
    winner: null,
    version: 0,
    randomSeed: shuffled.seed,
    startingHand,
  }
}

export function playableIndices(state: UnoState, player = state.currentPlayer): number[] {
  const hand = state.players[player]?.hand ?? []
  const top = state.discardPile[state.discardPile.length - 1]
  return hand.flatMap((card, index) =>
    card.kind === 'wild'
      || card.color === state.currentColor
      || (card.kind === 'number' && top.kind === 'number' && card.value === top.value)
      || (card.kind !== 'number' && card.kind === top.kind)
      ? [index]
      : [],
  )
}

export function isStalemate(state: UnoState): boolean {
  return state.winner === null
    && state.drawPile.length === 0
    && state.discardPile.length <= 1
    && state.players.every((_, index) => playableIndices(state, index).length === 0)
}

function drawCards(state: UnoState, count: number): { pile: UnoCard[]; cards: UnoCard[]; discard: UnoCard[]; randomSeed: number } {
  let pile = [...state.drawPile]
  let discard = [...state.discardPile]
  let randomSeed = state.randomSeed
  const cards: UnoCard[] = []
  while (cards.length < count) {
    if (!pile.length) {
      if (discard.length <= 1) break
      const top = discard[discard.length - 1]
      const shuffled = shuffleWithSeed(discard.slice(0, -1), randomSeed)
      pile = shuffled.items
      randomSeed = shuffled.seed
      discard = [top]
    }
    const card = pile.pop()
    if (card) cards.push(card)
  }
  return { pile, cards, discard, randomSeed }
}

function advanceFrom(index: number, direction: 1 | -1, playerCount: number, amount = 1): number {
  return (index + direction * amount + playerCount * 2) % playerCount
}

function advance(state: UnoState, amount = 1): number {
  return advanceFrom(state.currentPlayer, state.direction, state.players.length, amount)
}

export function applyUnoMove(state: UnoState, move: UnoMove): UnoState {
  if (state.winner !== null) return state
  const playerIndex = state.currentPlayer
  const player = state.players[playerIndex]
  const actions = [...state.actions]

  if (move.type === 'draw') {
    if (playableIndices(state).length) return state
    const drawn = drawCards(state, 1)
    const players = state.players.map((entry, index) =>
      index === playerIndex ? { ...entry, hand: [...entry.hand, ...drawn.cards] } : entry,
    )
    actions.push({ player: playerIndex, type: 'draw', comment: move.comment })
    return {
      ...state,
      players,
      drawPile: drawn.pile,
      discardPile: drawn.discard,
      randomSeed: drawn.randomSeed,
      currentPlayer: advance(state),
      actions,
      version: state.version + 1,
    }
  }

  const card = player.hand[move.cardIndex]
  if (!card || !playableIndices(state).includes(move.cardIndex)) return state
  if (card.kind === 'wild' && !move.chosenColor) return state
  if (card.kind !== 'wild' && move.chosenColor) return state

  let players = state.players.map((entry, index) =>
    index === playerIndex
      ? { ...entry, hand: entry.hand.filter((_, cardIndex) => cardIndex !== move.cardIndex) }
      : entry,
  )
  const discardPile = [...state.discardPile, card]
  let direction = state.direction
  let currentColor = card.kind === 'wild' ? move.chosenColor! : card.color!
  let nextPlayer = advanceFrom(playerIndex, direction, players.length)
  let drawPile = [...state.drawPile]
  let randomSeed = state.randomSeed
  let winner: number | null = players[playerIndex].hand.length === 0 ? playerIndex : null

  actions.push({
    player: playerIndex,
    type: 'play',
    card,
    cardIndex: move.cardIndex,
    chosenColor: card.kind === 'wild' ? move.chosenColor : undefined,
    declaredUno: move.declaredUno,
    comment: move.comment,
  })

  if (winner === null && players[playerIndex].hand.length === 1 && !move.declaredUno) {
    const penalty = drawCards({ ...state, drawPile, discardPile, randomSeed }, 2)
    drawPile = penalty.pile
    randomSeed = penalty.randomSeed
    players = players.map((entry, index) =>
      index === playerIndex ? { ...entry, hand: [...entry.hand, ...penalty.cards] } : entry,
    )
    actions.push({ player: playerIndex, type: 'penalty', comment: 'Forgot to call Uno: drew two cards.' })
  }

  if (winner === null) {
    if (card.kind === 'reverse') {
      direction = direction === 1 ? -1 : 1
      nextPlayer = players.length === 2 ? playerIndex : advanceFrom(playerIndex, direction, players.length)
    } else if (card.kind === 'skip') {
      nextPlayer = players.length === 2 ? playerIndex : advanceFrom(playerIndex, direction, players.length, 2)
    } else if (card.kind === 'draw2') {
      const penalizedPlayer = advanceFrom(playerIndex, direction, players.length)
      const penalty = drawCards({ ...state, drawPile, discardPile, randomSeed, currentPlayer: penalizedPlayer }, 2)
      drawPile = penalty.pile
      randomSeed = penalty.randomSeed
      players = players.map((entry, index) =>
        index === penalizedPlayer ? { ...entry, hand: [...entry.hand, ...penalty.cards] } : entry,
      )
      actions.push({ player: penalizedPlayer, type: 'penalty', comment: 'Draw Two: drew two cards and lost the turn.' })
      nextPlayer = players.length === 2 ? playerIndex : advanceFrom(playerIndex, direction, players.length, 2)
    }
  }

  return {
    ...state,
    players,
    drawPile,
    discardPile,
    randomSeed,
    currentPlayer: nextPlayer,
    direction,
    currentColor,
    actions,
    winner,
    version: state.version + 1,
  }
}

export function parseUnoReply(state: UnoState, text: string): { ok: true; move: UnoMove } | { ok: false; error: string } {
  const clean = (text ?? '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim()
  if (!clean) return { ok: false, error: 'the reply was empty' }
  const comment = (clean.match(/COMMENT\s*[:=-]\s*([^\n]+)/i)?.[1] ?? '').trim().slice(0, 220)
  const action = clean.match(/ACTION\s*[:=-]\s*(PLAY|DRAW)\b/i)?.[1]?.toUpperCase()
  if (action === 'DRAW') {
    if (playableIndices(state).length) return { ok: false, error: 'you have a playable card; drawing is not legal' }
    return { ok: true, move: { type: 'draw', comment } }
  }
  if (action !== 'PLAY') return { ok: false, error: 'expected ACTION: PLAY or ACTION: DRAW' }

  const indexText = clean.match(/CARD(?:_INDEX| INDEX)?\s*[:=-]\s*(\d+)/i)?.[1]
  if (!indexText) return { ok: false, error: 'a PLAY action needs CARD_INDEX: <index>' }
  const cardIndex = Number(indexText)
  if (!playableIndices(state).includes(cardIndex)) return { ok: false, error: `card index ${cardIndex} is not playable` }
  const card = state.players[state.currentPlayer].hand[cardIndex]
  const colorText = clean.match(/(?:CHOSEN_)?COLOR\s*[:=-]\s*(red|yellow|green|blue)\b/i)?.[1]?.toLowerCase() as UnoColor | undefined
  if (card.kind === 'wild' && !colorText) return { ok: false, error: 'playing a Wild requires COLOR: red, yellow, green, or blue' }
  if (card.kind !== 'wild' && colorText) return { ok: false, error: 'only a Wild card can choose a color' }
  const unoText = clean.match(/UNO\s*[:=-]\s*(YES|NO|TRUE|FALSE)\b/i)?.[1]?.toLowerCase()
  const declaredUno = unoText === 'yes' || unoText === 'true'
  if (state.players[state.currentPlayer].hand.length === 2 && !unoText) return { ok: false, error: 'include UNO: YES or UNO: NO when your play leaves one card' }
  return { ok: true, move: { type: 'play', cardIndex, chosenColor: colorText, declaredUno, comment } }
}

export function unoSystemPrompt(player: number, names: string[]): string {
  return [
    `You are ${names[player]}, playing simplified Uno against ${names.filter((_, index) => index !== player).join(', ')}.`,
    'You may only use the hand and public information provided for your turn. Never claim to know opponents’ cards.',
    'Play strategically, but follow the legal-action list exactly. A Wild must choose a color.',
    'When a play leaves you with one card, declare UNO: YES to avoid an automatic two-card penalty. Missing the declaration makes you draw two immediately.',
    'Reply exactly in this format:',
    'ACTION: PLAY or DRAW',
    'CARD_INDEX: <zero-based hand index> (PLAY only)',
    'COLOR: red|yellow|green|blue (Wild only)',
    'UNO: YES or NO (include when your hand currently has two cards)',
    'COMMENT: <one short sentence>',
  ].join('\n')
}

export function unoTurnPrompt(state: UnoState): string {
  const player = state.currentPlayer
  const hand = state.players[player].hand
  const playable = playableIndices(state)
  const top = state.discardPile[state.discardPile.length - 1]
  const cardText = (card: UnoCard) => card.kind === 'wild' ? 'Wild' : card.kind === 'number' ? `${card.color} ${card.value}` : `${card.color} ${card.kind === 'draw2' ? 'Draw Two' : card.kind}`
  const legal = playable.length
    ? playable.map((index) => `${index}: ${cardText(hand[index])}${hand[index].kind === 'wild' ? ' (choose a color)' : ''}`).join('\n')
    : 'DRAW: draw one card (no playable cards in hand).'
  return [
    `You are ${state.players[player].name}. It is your turn (${state.actions.length + 1}).`,
    `Your hand (${hand.length} cards):`,
    ...hand.map((card, index) => `${index}: ${cardText(card)}`),
    `Opponent card counts: ${state.players.map((entry, index) => index === player ? null : `${entry.name}: ${entry.hand.length}`).filter(Boolean).join(' | ')}`,
    `Discard pile (oldest to newest): ${state.discardPile.map(cardText).join(' → ')}`,
    `Top discard: ${cardText(top)}. Active color: ${state.currentColor}. Direction: ${state.direction === 1 ? 'clockwise' : 'counter-clockwise'}.`,
    `Legal actions:\n${legal}`,
    'Declare UNO: YES if your selected play will leave you with one card; otherwise use UNO: NO.',
    'Reply using the exact format from your instructions.',
  ].join('\n')
}
