// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cellName, emptyGrid, evaluate, findFives, idx, parseCell, playTurn, rotate, rotatedCell, type Grid } from '../src/games/pentago/rules.ts'

const put = (cells: Array<[number, number]>, v: 1 | 2, g: Grid = emptyGrid()) => {
  for (const [r, c] of cells) g[idx(r, c)] = v
  return g
}

test('clockwise rotation moves the top-left corner to the top-right corner', () => {
  const g = put([[0, 0]], 1)
  const r = rotate(g, 0, 'cw')
  assert.equal(r[idx(0, 2)], 1)
  assert.equal(r[idx(0, 0)], 0)
  assert.equal(rotatedCell(idx(0, 0), 0, 'cw'), idx(0, 2))
})

test('counter-clockwise rotation on the bottom-right quadrant', () => {
  const g = put([[3, 3]], 2)
  const r = rotate(g, 3, 'ccw')
  assert.equal(r[idx(5, 3)], 2)
  assert.equal(rotatedCell(idx(3, 3), 3, 'ccw'), idx(5, 3))
})

test('four quarter turns and cw then ccw are both identity; other quadrants untouched', () => {
  const g = emptyGrid()
  for (let i = 0; i < 36; i++) g[i] = ((i * 7) % 3) as 0 | 1 | 2
  assert.deepEqual(rotate(rotate(rotate(rotate(g, 1, 'cw'), 1, 'cw'), 1, 'cw'), 1, 'cw'), g)
  assert.deepEqual(rotate(rotate(g, 2, 'cw'), 2, 'ccw'), g)
  const r = rotate(g, 0, 'cw')
  for (let i = 0; i < 36; i++) if (Math.floor(i / 6) >= 3 || i % 6 >= 3) assert.equal(r[i], g[i])
})

test('horizontal five across the quadrant border', () => {
  const f = findFives(put([[1, 1], [1, 2], [1, 3], [1, 4], [1, 5]], 1))
  assert.deepEqual(f[1], [idx(1, 1), idx(1, 2), idx(1, 3), idx(1, 4), idx(1, 5)])
  assert.equal(f[2], undefined)
})

test('vertical five and a row of six both count', () => {
  assert.ok(findFives(put([[0, 4], [1, 4], [2, 4], [3, 4], [4, 4]], 2))[2])
  assert.equal(findFives(put([[5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5]], 1))[1]?.length, 6)
})

test('diagonals: long diagonal and both short off-diagonals', () => {
  assert.ok(findFives(put([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]], 1))[1])
  assert.ok(findFives(put([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]], 1))[1])
  assert.ok(findFives(put([[1, 4], [2, 3], [3, 2], [4, 1], [5, 0]], 2))[2])
})

test('four in a row is not a win; a broken line is not a win', () => {
  assert.equal(evaluate(put([[2, 0], [2, 1], [2, 2], [2, 3]], 1)).status, 'ongoing')
  assert.equal(evaluate(put([[2, 0], [2, 1], [2, 3], [2, 4], [2, 5]], 1)).status, 'ongoing')
})

test('five made by the placement wins immediately and the twist is skipped', () => {
  const g = put([[0, 0], [0, 1], [0, 2], [0, 3]], 1)
  const t = playTurn(g, idx(0, 4), 0, 'cw', 1)!
  assert.equal(t.rotated, false)
  assert.equal(t.result.status, 'win')
  assert.equal(t.grid[idx(0, 0)], 1, 'quadrant 1 was not rotated')
})

test('a rotation can create the win (line completed by the twist)', () => {
  // Row 0: X at (0,0), (0,3), (0,4), (0,5) and X at (1,0). Clockwise twist of quadrant 1 maps
  // (2,0)->(0,0), (1,0)->(0,1), (0,0)->(0,2), so placing X at (2,0) then twisting completes row 0.
  const g = put([[0, 0], [1, 0], [0, 3], [0, 4], [0, 5]], 1)
  const t = playTurn(g, idx(2, 0), 0, 'cw', 1)!
  assert.equal(findFives(t.placed)[1], undefined, 'no five before the twist')
  assert.equal(t.rotated, true)
  assert.equal(t.result.status, 'win')
  if (t.result.status === 'win') {
    assert.equal(t.result.when, 'rotation')
    assert.equal(t.result.marble, 1)
  }
})

test('a rotation that completes only the opponent’s five makes the opponent win', () => {
  // O has a row of five except (0,0); O’s marble sits at (2,0), which a CW twist of q0 moves to (0,0).
  const g = put([[0, 1], [0, 2], [0, 3], [0, 4], [2, 0]], 2)
  g[idx(0, 1)] = 0
  g[idx(0, 2)] = 0
  put([[1, 0]], 2, g) // (1,0) -> (0,1) after CW
  put([[0, 0]], 2, g) // (0,0) -> (0,2) after CW
  // X places somewhere harmless outside q0, then twists q0 clockwise.
  const t = playTurn(g, idx(5, 5), 0, 'cw', 1)!
  assert.equal(t.result.status, 'win')
  if (t.result.status === 'win') assert.equal(t.result.marble, 2)
})

test('five for both colours after a twist is a draw', () => {
  const g = put([[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]], 1)
  put([[4, 0], [4, 1], [4, 2], [4, 3], [4, 4]], 2, g)
  const r = evaluate(g)
  assert.equal(r.status, 'draw')
  if (r.status === 'draw') assert.equal(r.reason, 'both')
})

test('a full board with no five is a draw', () => {
  const rows = ['112211', '221122', '112211', '221122', '112211', '221122']
  const g = rows.flatMap((r) => [...r].map((ch) => Number(ch) as 1 | 2))
  assert.deepEqual(findFives(g), {}, 'test grid must contain no five')
  const r = evaluate(g)
  assert.equal(r.status, 'draw')
})

test('placing on an occupied cell is rejected', () => {
  assert.equal(playTurn(put([[3, 3]], 1), idx(3, 3), 0, 'cw', 2), null)
})

test('cell names round-trip', () => {
  for (let i = 0; i < 36; i++) assert.equal(parseCell(cellName(i)), i)
  assert.equal(parseCell('c-4'), idx(2, 3))
  assert.equal(parseCell('G1'), null)
})
