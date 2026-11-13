import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyUnoMove, createDeck, createUnoState, isStalemate, parseUnoReply, playableIndices, unoTurnPrompt, type UnoCard, type UnoState } from '../src/games/uno/rules.ts'

const card = (id: number, color: UnoCard['color'], kind: UnoCard['kind'], value: number | null = null): UnoCard => ({ id, color, kind, value })

function state(hand: UnoCard[], opponents: UnoCard[][] = [[]], currentColor: UnoState['currentColor'] = 'red'): UnoState {
  return {
    players: [{ name: 'A', hand }, ...opponents.map((other, index) => ({ name: `P${index + 2}`, hand: other }))],
    drawPile: [card(100, 'blue', 'number', 4), card(101, 'yellow', 'number', 2), card(102, 'green', 'number', 7)],
    discardPile: [card(99, currentColor, 'number', 5)],
    currentPlayer: 0,
    direction: 1,
    currentColor,
    actions: [],
    winner: null,
    version: 0,
    randomSeed: 25,
    startingHand: 7,
  }
}

test('simplified deck has 104 cards with correct number and action counts', () => {
  const deck = createDeck()
  assert.equal(deck.length, 104)
  assert.equal(deck.filter((c) => c.kind === 'wild').length, 4)
  assert.equal(deck.filter((c) => c.kind === 'number' && c.value === 0).length, 4)
  assert.equal(deck.filter((c) => c.kind === 'number' && c.value !== 0).length, 72)
  assert.equal(deck.filter((c) => c.kind === 'draw2').length, 8)
  assert.equal(deck.some((c) => c.kind === 'wild' && c.color === null), true)
})

test('creates a two-to-four player deal with seven cards each', () => {
  const game = createUnoState(['A', 'B', 'C', 'D'], 25)
  assert.equal(game.players.length, 4)
  assert.ok(game.players.every((player) => player.hand.length === 7))
  assert.equal(game.discardPile.length, 1)
  assert.equal(game.discardPile[0].kind, 'number')
  assert.equal(game.drawPile.length + game.players.reduce((n, p) => n + p.hand.length, 0) + 1, 104)
  assert.equal(createUnoState(['A', 'B'], 25, 5).players[0].hand.length, 5)
  assert.throws(() => createUnoState(['Solo']), RangeError)
})

test('legal cards match active color, number, or are wild', () => {
  const game = state([
    card(1, 'red', 'number', 1),
    card(2, 'blue', 'number', 5),
    card(3, null, 'wild'),
    card(4, 'green', 'skip'),
  ])
  assert.deepEqual(playableIndices(game), [0, 1, 2])
})

test('matching an action symbol is legal even when its color differs', () => {
  const game = state([card(1, 'blue', 'skip'), card(2, 'blue', 'draw2'), card(3, 'yellow', 'number', 5)], [[card(4, 'green', 'number', 1)]])
  game.discardPile = [card(99, 'red', 'skip')]
  game.currentColor = 'red'
  assert.deepEqual(playableIndices(game), [0])
})

test('turn prompt reveals only the active hand and public opponent counts', () => {
  const game = state([card(1, 'red', 'number', 1)], [[card(2, 'blue', 'number', 2)]])
  const prompt = unoTurnPrompt(game)
  assert.match(prompt, /red 1/)
  assert.match(prompt, /P2: 1/)
  assert.doesNotMatch(prompt, /blue 2/)
})

test('a missed Uno declaration draws two cards automatically', () => {
  const game = state([card(1, 'red', 'number', 1), card(2, 'blue', 'number', 5)])
  const next = applyUnoMove(game, { type: 'play', cardIndex: 0, declaredUno: false, comment: '' })
  assert.equal(next.players[0].hand.length, 3)
  assert.equal(next.actions.at(-1)?.type, 'penalty')
})

test('draw is rejected while a playable card exists', () => {
  const game = state([card(1, 'red', 'number', 1)])
  const parsed = parseUnoReply(game, 'ACTION: DRAW')
  assert.deepEqual(parsed, { ok: false, error: 'you have a playable card; drawing is not legal' })
  assert.equal(applyUnoMove(game, { type: 'draw', comment: '' }), game)
})

test('Wild requires a valid chosen color', () => {
  const game = state([card(1, null, 'wild')])
  assert.deepEqual(parseUnoReply(game, 'ACTION: PLAY\nCARD_INDEX: 0'), {
    ok: false,
    error: 'playing a Wild requires COLOR: red, yellow, green, or blue',
  })
  const parsed = parseUnoReply(game, 'ACTION: PLAY\nCARD_INDEX: 0\nCOLOR: blue')
  assert.equal(parsed.ok, true)
  if (parsed.ok && parsed.move.type === 'play') assert.equal(parsed.move.chosenColor, 'blue')
})

test('Reverse changes direction and acts as a skip in a two-player game', () => {
  const game = state([card(1, 'red', 'reverse'), card(2, 'red', 'number', 7)])
  const next = applyUnoMove(game, { type: 'play', cardIndex: 0, declaredUno: false, comment: '' })
  assert.equal(next.direction, -1)
  assert.equal(next.currentPlayer, 0)
})

test('Draw Two penalizes the next player and skips their turn in a three-player game', () => {
  const game = state([card(1, 'red', 'draw2'), card(2, 'red', 'number', 7)], [[card(3, 'blue', 'number', 2)], [card(4, 'yellow', 'number', 3)]])
  const next = applyUnoMove(game, { type: 'play', cardIndex: 0, declaredUno: false, comment: '' })
  assert.equal(next.players[1].hand.length, 3)
  assert.equal(next.currentPlayer, 2)
})

test('Draw Two in a two-player game penalizes the opponent and returns the turn to the actor', () => {
  const game = state([card(1, 'red', 'draw2'), card(2, 'red', 'number', 7)], [[card(3, 'blue', 'number', 2)]])
  const next = applyUnoMove(game, { type: 'play', cardIndex: 0, declaredUno: true, comment: '' })
  assert.equal(next.players[1].hand.length, 3)
  assert.equal(next.currentPlayer, 0)
})

test('discard reshuffles use saved state so replays draw the same cards', () => {
  const game = state([card(1, 'blue', 'number', 2)], [[card(2, 'yellow', 'number', 3)]], 'red')
  game.discardPile = [card(50, 'green', 'number', 1), card(51, 'red', 'number', 5)]
  game.drawPile = []
  const live = applyUnoMove(game, { type: 'draw', comment: 'No match.' })
  const replay = applyUnoMove(game, { type: 'draw', comment: 'No match.' })
  assert.deepEqual(replay, live)
  assert.equal(replay.drawPile.length, 0)
  assert.equal(replay.players[0].hand.length, 2)
})

test('an empty deck and no playable cards ends as a draw instead of cycling forever', () => {
  const game = state([card(1, 'blue', 'number', 2)], [[card(2, 'yellow', 'number', 3)]], 'red')
  game.discardPile = [card(99, 'red', 'number', 5)]
  game.drawPile = []
  assert.equal(isStalemate(game), true)
  game.players[1].hand = [card(3, 'red', 'number', 1)]
  assert.equal(isStalemate(game), false)
})
