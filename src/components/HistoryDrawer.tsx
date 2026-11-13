import { useMemo, useState } from 'react'
import { getStyle } from '../games/chess/styles'
import { getOverloadStyle } from '../games/overload/styles'
import { KIND_LABEL, isC4Record, isChessRecord, isDebateRecord, isOverloadRecord, isPentagoRecord, isUnoRecord, recordKind, type HistoryRecord } from '../lib/history'
import { fmtCost, fmtTokens } from '../lib/format'
import { Modal } from './Modal'
import { IconPlay } from './Icons'
import { StyleIcon } from './StylePicker'

interface StyleRow {
  id: string
  styleId: string
  gameId: 'chess' | 'overload'
  name: string
  games: number
  wins: number
  losses: number
  draws: number
}

/** Wins / losses / draws per saved Chess or Overload style. */
export function styleRecord(history: HistoryRecord[]): StyleRow[] {
  const rows = new Map<string, StyleRow>()
  for (const r of history) {
    if ((!isChessRecord(r) && !isOverloadRecord(r)) || !r.styles) continue
    for (const s of [0, 1] as const) {
      const ref = r.styles[s]
      const gameId = isOverloadRecord(r) ? 'overload' : 'chess'
      const key = `${gameId}:${ref.id}`
      const row = rows.get(key) ?? { id: key, styleId: ref.id, gameId, name: gameId === 'overload' ? `${ref.name} · Overload` : ref.name, games: 0, wins: 0, losses: 0, draws: 0 }
      row.games++
      if (r.result.winnerSeat === null) row.draws++
      else if (r.result.winnerSeat === s) row.wins++
      else row.losses++
      rows.set(key, row)
    }
  }
  return [...rows.values()].sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games)
}


function StyleTable({ history }: { history: HistoryRecord[] }) {
  const rows = useMemo(() => styleRecord(history), [history])
  if (!rows.length)
    return (
      <div className="empty-state">
        <p>No styled matches yet.</p>
        <p className="muted small">Finish Chess or Overload matches to see saved style results here.</p>
      </div>
    )
  return (
    <div className="style-table-wrap">
      <table className="style-table">
        <thead>
          <tr>
            <th>Style</th>
            <th>Games</th>
            <th>W</th>
            <th>L</th>
            <th>D</th>
            <th>Win %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <span className="st-name">
                  <StyleIcon style={r.gameId === 'overload' ? getOverloadStyle(r.styleId) : getStyle(r.styleId)} size={13} /> {r.name}
                </span>
              </td>
              <td className="mono">{r.games}</td>
              <td className="mono t-p1">{r.wins}</td>
              <td className="mono t-p2">{r.losses}</td>
              <td className="mono muted">{r.draws}</td>
              <td>
                <span className="winbar" title={`${Math.round((r.wins / r.games) * 100)}% wins`}>
                  <i style={{ width: `${(r.wins / r.games) * 100}%` }} />
                  <b className="mono">{Math.round((r.wins / r.games) * 100)}%</b>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Each saved Chess or Overload match counts once for each player’s style. Mirror matches add one win and one loss.</p>
    </div>
  )
}

export function HistoryDialog({
  open,
  onClose,
  history,
  onReplay,
  onClear,
  initialTab = 'matches',
}: {
  open: boolean
  onClose: () => void
  history: HistoryRecord[]
  onReplay: (r: HistoryRecord) => void
  onClear: () => void
  initialTab?: 'matches' | 'styles'
}) {
  const [tab, setTab] = useState<'matches' | 'styles'>(initialTab)
  return (
    <Modal open={open} onClose={onClose} title="Match history" wide>
      <div className="seg history-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'matches'} className={tab === 'matches' ? 'on' : ''} onClick={() => setTab('matches')}>
          Matches
        </button>
        <button role="tab" aria-selected={tab === 'styles'} className={tab === 'styles' ? 'on' : ''} onClick={() => setTab('styles')}>
          Style record
        </button>
      </div>
      {tab === 'styles' ? (
        <StyleTable history={history} />
      ) : !history.length ? (
        <div className="empty-state">
          <div className="empty-board" aria-hidden />
          <p>No matches yet.</p>
          <p className="muted small">Finished games and debates are saved in this browser so you can replay them.</p>
        </div>
      ) : (
        <>
          <ul className="history-list">
            {history.map((r) => {
              const kind = recordKind(r)
              const w = isDebateRecord(r) ? r.judge?.verdict?.winner ?? null : r.result.winnerSeat
              const cost = r.stats.reduce((total, stat) => total + (stat.costUsd ?? 0), 0)
              const known = r.stats.every((s) => s.costKnown)
              const tokens = fmtTokens(r.stats.reduce((total, stat) => total + stat.promptTokens + stat.completionTokens, 0))
              const names = isDebateRecord(r) ? r.setup.names : r.players.map((player) => player.name)
              const count = isDebateRecord(r) ? `${r.turns.length} turns` : isC4Record(r) ? `${r.cols.length} moves` : isPentagoRecord(r) ? `${r.moves.length} turns` : isOverloadRecord(r) || isUnoRecord(r) ? `${r.actions.length} actions` : `${Math.ceil(r.sans.length / 2)} moves`
              return (
                <li key={r.id} className="history-item">
                  <div className="h-players">
                    <span className={`h-kind ${kind}`}>{KIND_LABEL[kind]}</span>
                    {names.map((name, s) => (
                      <span key={s} className={`h-player accent-p${(s % 2) + 1} ${w === s ? 'won' : ''}`}>
                        <span className="seat-dot" />
                        <span className="ellipsis">{name}</span>
                        {isChessRecord(r) && <span className="muted small">{s === r.whiteSeat ? '♔' : '♚'}</span>}
                        {(isC4Record(r) || isPentagoRecord(r)) && <span className="muted small">{s === r.firstSeat ? '1st' : '2nd'}</span>}
                        {isChessRecord(r) && r.styles && <span className="h-style small">{r.styles[s].name}</span>}
                        {isOverloadRecord(r) && <span className="h-style small">{r.styles[s].name}</span>}
                      </span>
                    ))}
                  </div>
                  <div className="h-meta small muted">
                    <span>{new Date(r.date).toLocaleString()}</span>
                    <span className="ellipsis" title={isDebateRecord(r) ? r.setup.topic : r.result.reason}>
                      {isDebateRecord(r) ? `“${r.setup.topic}”` : r.result.reason}
                    </span>
                    <span className="mono">
                      {count} · {tokens} tok · {fmtCost(cost, known)}
                    </span>
                  </div>
                  <button className="dock-btn" onClick={() => onReplay(r)}>
                    <IconPlay size={13} /> Replay
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="row end">
            <button className="link danger" onClick={onClear}>
              Clear history
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
