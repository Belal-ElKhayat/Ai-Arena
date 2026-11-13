import { Chess } from 'chess.js'

export interface PgnMeta {
  white: string
  black: string
  result: '1-0' | '0-1' | '1/2-1/2' | '*'
  reason?: string
  date?: Date
}

export function buildPgn(sans: string[], meta: PgnMeta, comments?: string[]): string {
  const c = new Chess()
  const d = meta.date ?? new Date()
  const ds = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  c.setHeader('Event', 'AI Arena match')
  c.setHeader('Site', typeof location !== 'undefined' ? location.host : 'AI Arena')
  c.setHeader('Date', ds)
  c.setHeader('White', meta.white)
  c.setHeader('Black', meta.black)
  c.setHeader('Result', meta.result)
  if (meta.reason) c.setHeader('Termination', meta.reason)
  sans.forEach((san, i) => {
    c.move(san)
    const cm = comments?.[i]
    if (cm) c.setComment(cm.replace(/[{}]/g, ''))
  })
  let pgn = c.pgn({ maxWidth: 80 })
  if (!pgn.trim().endsWith(meta.result)) pgn = `${pgn} ${meta.result}`
  return pgn
}

export function fensFromSans(sans: string[]): string[] {
  const c = new Chess()
  const out = [c.fen()]
  for (const s of sans) {
    try {
      c.move(s)
    } catch {
      break
    }
    out.push(c.fen())
  }
  return out
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/x-chess-pgn' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
