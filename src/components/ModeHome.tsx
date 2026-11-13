import { useRef, type PointerEvent } from 'react'
import { APP_CONFIG } from '../config/app'
import { MODES, type ModeId } from '../games/registry'
import { fmtCost } from '../lib/format'
import { KIND_LABEL, isDebateRecord, isUnoRecord, recordKind, type HistoryRecord } from '../lib/history'
import { PROVIDERS } from '../providers/registry'
import { IconPentago, IconArrowRight, IconCards, IconChat, IconDiscs, IconHistory, IconKnight, IconLock, IconOverload, IconPlay } from './Icons'

const ICON: Record<ModeId, typeof IconChat> = { chess: IconKnight, debate: IconChat, connect4: IconDiscs, pentago: IconPentago, overload: IconOverload, uno: IconCards }
const FEATURES: Partial<Record<ModeId, string[]>> = {
  chess: ['Rules checked by chess.js', '3D board views', 'PGN export'],
  debate: ['Private coaching', 'Optional AI judge', 'Voices'],
  connect4: ['Tested win detection', 'Random opening', 'Replay'],
  pentago: ['Place + twist', 'Rotation-aware win check', 'Step-by-step replay'],
  overload: ['Hidden information', 'Items', 'Bluffing'],
  uno: ['2–4 AI players', 'Private hands', 'Live table view'],
}

/** Spotlight that follows the pointer across a card. */
function trackPointer(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
  e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`)
}

function ChessPreview() {
  const squares = Array.from({ length: 16 })
  const pieces: Record<number, [string, 'w' | 'b']> = { 1: ['♞', 'b'], 6: ['♛', 'b'], 9: ['♝', 'w'], 14: ['♜', 'w'] }
  return (
    <div className="pv-chess" aria-hidden>
      {squares.map((_, i) => (
        <span key={i} className={`pv-sq ${(Math.floor(i / 4) + i) % 2 ? 'd' : 'l'} ${i === 9 || i === 5 ? 'hl' : ''}`}>
          {pieces[i] && <span className={`pv-pc ${pieces[i][1]}`}>{pieces[i][0]}</span>}
        </span>
      ))}
    </div>
  )
}

function DebatePreview() {
  return (
    <div className="pv-debate" aria-hidden>
      <span className="pv-b l">
        <i style={{ width: '82%' }} />
        <i style={{ width: '58%' }} />
      </span>
      <span className="pv-b r">
        <i style={{ width: '74%' }} />
        <i style={{ width: '46%' }} />
      </span>
      <span className="pv-b l typing">
        <em />
        <em />
        <em />
      </span>
    </div>
  )
}

function PentagoPreview() {
  const marbles: Record<number, 'g' | 'o'> = { 4: 'g', 7: 'o', 10: 'g', 13: 'g', 15: 'o', 20: 'o', 22: 'g', 27: 'o', 33: 'g' }
  return (
    <div className="pv-pentago" aria-hidden>
      {[0, 1, 2, 3].map((q) => (
        <span key={q} className={`pv-pq q${q}`}>
          {Array.from({ length: 9 }, (_, i) => {
            const cell = (Math.floor(q / 2) * 3 + Math.floor(i / 3)) * 6 + (q % 2) * 3 + (i % 3)
            return <i key={i} className={marbles[cell] ?? ''} />
          })}
        </span>
      ))}
    </div>
  )
}

function OverloadPreview() {
  return (
    <div className="pv-overload" aria-hidden>
      <span className="pv-cell p1" />
      <span className="pv-cannon"><i /><i /><i /></span>
      <span className="pv-cell p2" />
      <span className="pv-round charged" />
      <span className="pv-round dud" />
    </div>
  )
}

function SoonPreview({ id }: { id: ModeId }) {
  if (id === 'connect4')
    return (
      <div className="pv-c4" aria-hidden>
        {Array.from({ length: 21 }).map((_, i) => (
          <span key={i} className={[3, 9, 10, 16, 17].includes(i) ? 'g' : [4, 11, 15, 18].includes(i) ? 'o' : ''} />
        ))}
      </div>
    )
  return (
    <div className="pv-uno" aria-hidden>
      <span className="c1" />
      <span className="c2" />
      <span className="c3" />
    </div>
  )
}

/** Home screen: hero + mode cards + recent matches. */
export function ModeHome({
  lastMode,
  onPick,
  history,
  onReplay,
}: {
  lastMode: ModeId | null
  onPick: (m: ModeId) => void
  history: HistoryRecord[]
  onReplay: (r: HistoryRecord) => void
}) {
  const live = MODES.filter((m) => m.available)
  const soon = MODES.filter((m) => !m.available)
  const recent = history.slice(0, 3)
  const heroRef = useRef<HTMLDivElement>(null)
  const direct = PROVIDERS.filter((p) => p.group === 'direct').length

  return (
    <main className="home">
      <header className="home-bar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <span />
            <span />
          </div>
          <span className="brand-name">{APP_CONFIG.APP_NAME}</span>
        </div>
        <span className="home-privacy small">
          <IconLock size={13} /> Keys stay in your browser
        </span>
      </header>

      <section className="hero" ref={heroRef}>
        <div className="hero-emblem" aria-hidden>
          <span className="orb g" />
          <span className="orb o" />
          <span className="spark" />
        </div>
        <span className="hero-eyebrow">
          <span className="live-dot" /> AI vs AI · live
        </span>
        <h1 className="hero-title serif">
          Two models enter.
          <br />
          <em>One walks out.</em>
        </h1>
        <p className="hero-sub">{APP_CONFIG.TAGLINE} Pick an arena, choose two models from {PROVIDERS.length} providers, and watch them battle in real time.</p>
      </section>

      <section className="mode-grid" aria-label="Game modes">
        {live.map((m, i) => {
          const Icon = ICON[m.id]
          return (
            <button
              key={m.id}
              className={`mode-card glass mode-${m.id} ${lastMode === m.id ? 'last' : ''}`}
              style={{ animationDelay: `${0.08 * i + 0.1}s` }}
              onPointerMove={trackPointer}
              onClick={() => onPick(m.id)}
              aria-label={`Open ${m.title}`}
            >
              <span className="mode-spot" aria-hidden />
              <span className="mode-preview">{m.id === 'chess' ? <ChessPreview /> : m.id === 'debate' ? <DebatePreview /> : m.id === 'pentago' ? <PentagoPreview /> : m.id === 'overload' ? <OverloadPreview /> : m.id === 'connect4' ? <SoonPreview id={m.id} /> : <SoonPreview id={m.id} />}</span>
              <span className="mode-body">
                <span className="mode-head">
                  <span className="mode-icon">
                    <Icon size={18} />
                  </span>
                  <span className="mode-title">{m.title}</span>
                  {lastMode === m.id && <span className="mode-tag on">Last played</span>}
                </span>
                <span className="mode-blurb">{m.blurb}</span>
                <span className="mode-feats">
                  {(FEATURES[m.id] ?? []).map((f) => (
                    <span key={f} className="mode-feat">
                      {f}
                    </span>
                  ))}
                </span>
                <span className="mode-cta">
                  Enter arena <IconArrowRight size={15} />
                </span>
              </span>
            </button>
          )
        })}
      </section>

      <section className="soon-row" aria-label="Coming soon">
        {soon.map((m) => {
          const Icon = ICON[m.id]
          return (
            <div key={m.id} className="soon-card glass" aria-disabled="true">
              <SoonPreview id={m.id} />
              <div className="grow">
                <div className="soon-title">
                  <Icon size={15} /> {m.title}
                </div>
                <div className="small muted">{m.blurb}</div>
              </div>
              <span className="mode-tag">Coming soon</span>
            </div>
          )
        })}
      </section>

      {recent.length > 0 && (
        <section className="recent glass" aria-label="Recent matches">
          <div className="recent-head">
            <IconHistory size={15} /> Recent
          </div>
          <ul>
            {recent.map((r) => {
              const debate = isDebateRecord(r)
              const names = debate ? r.setup.names : r.players.map((player) => player.name)
              const cost = r.stats.reduce((s, x) => s + (x.costUsd ?? 0), 0)
              return (
                <li key={r.id}>
                  <button className="recent-item" onClick={() => onReplay(r)}>
                    <span className={`h-kind ${recordKind(r)}`}>{KIND_LABEL[recordKind(r)]}</span>
                    <span className="recent-names ellipsis">
                      {names.slice(0, isUnoRecord(r) ? 4 : 2).map((name, index) => (
                        <span key={`${name}-${index}`}><b className={index % 2 ? 't-p2' : 't-p1'}>{name}</b>{index < Math.min(names.length, isUnoRecord(r) ? 4 : 2) - 1 ? <span className="muted"> · </span> : null}</span>
                      ))}
                    </span>
                    <span className="recent-sub ellipsis muted small">{debate ? `“${r.setup.topic}”` : r.result.reason}</span>
                    <span className="mono small muted">{fmtCost(cost, r.stats.every((s) => s.costKnown))}</span>
                    <IconPlay size={12} />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <footer className="home-foot small muted">
        <span>OpenRouter · {direct} direct providers · any OpenAI-compatible endpoint</span>
        <span>No account, no server storage. Everything runs in your browser.</span>
      </footer>
    </main>
  )
}
