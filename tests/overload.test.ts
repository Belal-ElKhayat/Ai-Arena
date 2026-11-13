import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyOverloadAction, createOverloadState, eventForSeat, legalActions, type OverloadState } from '../src/games/overload/rules.ts'

const options = {
  seed: 246813579,
  rounds: 1 as const,
  startingCells: 3 as const,
  itemFrequency: 'normal' as const,
  firstSeat: 0 as const,
}

function stateWith(chamber: Array<'charged' | 'dud'>, patch: Partial<OverloadState> = {}) {
  const state = createOverloadState(options)
  state.chamber = chamber
  state.loadCounts = {
    charged: chamber.filter((round) => round === 'charged').length,
    dud: chamber.filter((round) => round === 'dud').length,
  }
  state.events = []
  state.actions = []
  return Object.assign(state, patch)
}

test('self-fire on a dud grants another turn', () => {
  const state = stateWith(['dud', 'charged'])
  const next = applyOverloadAction(state, { type: 'fire', target: 'self' }, 'A calculated try.')
  assert.equal(next.turn, 0)
  assert.deepEqual(next.cells, [3, 3])
  assert.equal(next.selfFires[0], 1)
  assert.equal(next.events.at(-1)?.result, 'dud')
})

test('self-fire on a charged round costs a cell and ends the turn', () => {
  const state = stateWith(['charged', 'dud'])
  const next = applyOverloadAction(state, { type: 'fire', target: 'self' }, 'Taking the chance.')
  assert.equal(next.turn, 1)
  assert.deepEqual(next.cells, [2, 3])
})

test('Overcharge doubles the next charged opponent hit and resets', () => {
  const state = stateWith(['charged', 'dud'], {
    overcharged: [true, false],
  })
  const next = applyOverloadAction(state, { type: 'fire', target: 'opponent' }, 'Boosted shot.')
  assert.deepEqual(next.cells, [3, 1])
  assert.equal(next.overcharged[0], false)
})

test('Lockdown skips one opponent turn and cannot chain', () => {
  let state = stateWith(['dud', 'charged', 'dud'], {
    items: [['lockdown', 'lockdown'], []],
  })
  state = applyOverloadAction(state, { type: 'item', item: 'lockdown' })
  assert.equal(state.locked[1], true)
  assert.equal(legalActions(state).some((action) => action.type === 'item' && action.item === 'lockdown'), false)
  state = applyOverloadAction(state, { type: 'fire', target: 'opponent' })
  assert.equal(state.turn, 0)
  assert.equal(state.locked[1], false)
  assert.equal(state.events.some((event) => event.type === 'lockdown-skip'), true)
})

test('Repair Kit respects the starting cell cap', () => {
  let state = stateWith(['dud', 'charged'], { items: [['repair', 'repair'], []] })
  assert.equal(legalActions(state).some((action) => action.type === 'item' && action.item === 'repair'), false)
  state.cells[0] = 2
  state = applyOverloadAction(state, { type: 'item', item: 'repair' })
  assert.equal(state.cells[0], 3)
})

test('ejecting the last round reloads the cannon and deals new items', () => {
  let state = stateWith(['dud'], { items: [['eject'], []] })
  state = applyOverloadAction(state, { type: 'item', item: 'eject' })
  assert.ok(state.chamber.length >= 2 && state.chamber.length <= 8)
  assert.deepEqual(state.loadCounts, {
    charged: state.chamber.filter((round) => round === 'charged').length,
    dud: state.chamber.filter((round) => round === 'dud').length,
  })
  assert.equal(state.events.at(-1)?.type, 'load')
  assert.ok(state.items[0].length > 0 || state.items[1].length > 0)
})

test('the same seed reproduces the same complete match', () => {
  const play = () => {
    let state = createOverloadState({ ...options, startingCells: 'random' })
    for (let i = 0; i < 600 && !state.matchOver; i++) {
      const actions = legalActions(state)
      const fireOpponent = actions.find((action) => action.type === 'fire' && action.target === 'opponent')
      state = applyOverloadAction(state, fireOpponent ?? actions[0])
    }
    return {
      actions: state.actions,
      events: state.events,
      roundResults: state.roundResults,
      winner: state.matchWinner,
      chamber: state.chamber,
      rngState: state.rngState,
    }
  }
  assert.deepEqual(play(), play())
})

test('Scanner results are private to the scanning player', () => {
  const scanner = {
    round: 1,
    actor: 0 as const,
    type: 'item' as const,
    item: 'scanner' as const,
    result: 'charged' as const,
    revealedTo: 0 as const,
    comment: '',
  }
  const ownView = eventForSeat(scanner, 0)
  const opponentView = eventForSeat(scanner, 1)
  assert.equal('privateScannerReveal' in ownView && ownView.privateScannerReveal, 'charged')
  assert.equal('result' in opponentView, false)
  assert.equal('privateScannerReveal' in opponentView, false)
})

test('Overload styles include the requested six styles with bounded prompts', () => {
  const data = JSON.parse(readFileSync(new URL('../src/games/overload/styles.json', import.meta.url), 'utf8'))
  assert.deepEqual(data.styles.map((style: { name: string }) => style.name), [
    'Cautious', 'Gambler', 'Bluffer', 'Calculator', 'Trash Talker', 'Gotham Chaos',
  ])
  for (const style of data.styles) {
    assert.ok(style.prompt.length <= 600, `${style.id} prompt is too long`)
    assert.ok(style.name && style.description && /^#[0-9a-f]{6}$/i.test(style.accent))
  }
})
