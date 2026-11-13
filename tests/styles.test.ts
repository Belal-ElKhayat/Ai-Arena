import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const data = JSON.parse(readFileSync(new URL('../src/games/chess/styles.json', import.meta.url), 'utf8'))

test('styles.json has 10 unique built-in styles under 600 characters', () => {
  assert.equal(data.styles.length, 10)
  const ids = new Set(data.styles.map((s: { id: string }) => s.id))
  assert.equal(ids.size, 10)
  for (const s of data.styles) {
    assert.ok(s.prompt.length <= 600, `${s.id} prompt is ${s.prompt.length} chars`)
    assert.ok(s.name && s.description && /^#[0-9a-f]{6}$/i.test(s.accent), `${s.id} is incomplete`)
    assert.ok(!/MOVE:|COMMENT:\s*</.test(s.prompt), `${s.id} must not redefine the reply format`)
  }
})
