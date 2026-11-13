// Run with: npm test   (Node's built-in test runner, no extra dependencies)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drop, emptyGrid, evaluate, findWin, gridFromColumns, idx, landingRow, legalColumns } from '../src/games/connect4/rules.ts'

// Columns are 0-based here. First player = disc 1.
test('empty board is ongoing with all columns legal', () => {
  const g = emptyGrid()
  assert.equal(evaluate(g).status, 'ongoing')
  assert.deepEqual(legalColumns(g), [0, 1, 2, 3, 4, 5, 6])
})

test('discs stack from the bottom', () => {
  const g = gridFromColumns([3, 3])
  assert.equal(g[idx(5, 3)], 1)
  assert.equal(g[idx(4, 3)], 2)
  assert.equal(landingRow(g, 3), 3)
})

test('full column is illegal', () => {
  const g = gridFromColumns([0, 0, 0, 0, 0, 0])
  assert.equal(landingRow(g, 0), -1)
  assert.equal(drop(g, 0, 1), null)
  assert.ok(!legalColumns(g).includes(0))
})

test('horizontal win', () => {
  // 1 plays 0,1,2,3 on the bottom row; 2 plays on top of them.
  const g = gridFromColumns([0, 0, 1, 1, 2, 2, 3])
  const w = findWin(g)
  assert.ok(w)
  assert.equal(w.disc, 1)
  assert.equal(w.direction, 'horizontal')
  assert.deepEqual(w.cells.sort((a, b) => a - b), [idx(5, 0), idx(5, 1), idx(5, 2), idx(5, 3)])
})

test('vertical win for the second player', () => {
  const g = gridFromColumns([0, 6, 1, 6, 0, 6, 1, 6])
  const w = findWin(g)
  assert.ok(w)
  assert.equal(w.disc, 2)
  assert.equal(w.direction, 'vertical')
})

test('diagonal win (rising to the right)', () => {
  const g = gridFromColumns([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3])
  const w = findWin(g)
  assert.ok(w)
  assert.equal(w.disc, 1)
  assert.equal(w.direction, 'diagonal')
  assert.ok(w.cells.includes(idx(5, 0)) && w.cells.includes(idx(2, 3)))
})

test('diagonal win (falling to the right)', () => {
  const g = gridFromColumns([6, 5, 5, 4, 4, 3, 4, 3, 3, 0, 3])
  const w = findWin(g)
  assert.ok(w)
  assert.equal(w.direction, 'diagonal')
})

test('three in a row is not a win', () => {
  assert.equal(findWin(gridFromColumns([0, 0, 1, 1, 2, 2])), null)
})

test('full board with no four in a row is a draw', () => {
  // Classic drawn layout: pairs across, alternating colours down.
  const rows = ['1122112', '2211221', '1122112', '2211221', '1122112', '2211221']
  const g = rows.flatMap((r) => [...r].map((ch) => Number(ch) as 1 | 2))
  assert.equal(findWin(g), null, 'test grid must not contain a line')
  assert.equal(evaluate(g).status, 'draw')
})
