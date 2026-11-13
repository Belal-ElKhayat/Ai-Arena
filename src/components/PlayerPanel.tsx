import type { CSSProperties, ReactNode } from 'react'
import type { PlayerConfig, Seat, SeatStats } from '../core/types'
import type { PieceThemeId } from '../games/chess/themes'
import { MiniPiece } from '../games/chess/Board'
import { fmtCost, fmtDuration, fmtTokens } from '../lib/format'
import { useModels } from '../lib/models'
import { getProvider } from '../providers/registry'
import type { Credentials, Effort } from '../providers/types'
import { ModelPicker } from './ModelPicker'
import { ProviderSelect } from './ProviderSelect'
import { IconLock, IconAlert } from './Icons'

export const EFFORTS: Array<{ id: Effort; label: string }> = [
  { id: 'default', label: 'Default' },
  { id: 'off', label: 'Off' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
]

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }
const ORDER = ['q', 'r', 'b', 'n', 'p']

export function PlayerPanel(props: {
  seat: Seat
  player: PlayerConfig
  onChange: (patch: Partial<PlayerConfig>) => void
  locked: boolean
  color: 'w' | 'b'
  credentials: Credentials
  onSetKey: () => void
  stats: SeatStats
  thinking: boolean
  attempt: number
  isTurn: boolean
  captured: string[]
  materialDiff: number
  pieceTheme: PieceThemeId
  comment: string
  errorMessage?: string | null
  winner?: boolean | null
  /** Replaces the White/Black chip (used by other games). */
  sideChip?: { label: string; title: string; className: string }
  /** Hide the chess captured-pieces row. */
  hideCaptured?: boolean
  /** Extra controls rendered under the model fields (e.g. chess style picker). */
  extra?: ReactNode
  /** Accent override for the panel (style accent). */
  accentStyle?: CSSProperties
}) {
  const { seat, player, onChange, locked, color, credentials, stats, thinking, attempt, isTurn, captured } = props
  const accent = seat === 0 ? 'p1' : 'p2'
  const provider = getProvider(player.providerId)
  const { models, loading, error, reload } = useModels(player.providerId, credentials)
  const model = models.find((m) => m.id === player.modelId)
  const support = provider.effortSupport(model)
  const effortDisabled = locked || support === false
  const hasKey = provider.hasCredentials(credentials)
  const sorted = [...captured].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
  const tokens = stats.promptTokens + stats.completionTokens

  return (
    <section
      className={`panel glass accent-${accent} ${thinking ? 'thinking' : ''} ${isTurn ? 'turn' : ''} ${props.winner ? 'winner' : ''}`}
      aria-label={`Player ${seat + 1}`}
      style={props.accentStyle}
    >
      <div className="panel-ring" aria-hidden />
      <header className="panel-head">
        <span className="seat-tag">
          <span className="seat-dot" />
          Player {seat + 1}
        </span>
        {props.sideChip ? (
          <span className={`color-chip ${props.sideChip.className}`} title={props.sideChip.title}>
            <span className="chip-swatch" />
            {props.sideChip.label}
          </span>
        ) : (
          <span className={`color-chip ${color}`} title={color === 'w' ? 'Plays White' : 'Plays Black'}>
            <span className="chip-swatch" />
            {color === 'w' ? 'White' : 'Black'}
          </span>
        )}
        {locked && (
          <span className="lock" title="Settings are locked during the match">
            <IconLock size={14} />
          </span>
        )}
      </header>

      <input
        className="name-input"
        value={player.name}
        onChange={(e) => onChange({ name: e.target.value.slice(0, 32) })}
        disabled={locked}
        aria-label={`Player ${seat + 1} name`}
        spellCheck={false}
      />
      <div className="model-line mono" title={player.modelId}>
        {model?.name ?? (player.modelId || 'No model selected')}
      </div>

      <div className="key-line">
        <span className={`dot ${hasKey ? 'ok' : ''}`} />
        <span>{hasKey ? (provider.needsBaseUrl ? 'Endpoint configured' : 'API key found') : provider.needsBaseUrl ? 'No endpoint' : 'No API key'}</span>
        <button className="link" onClick={props.onSetKey}>
          {hasKey ? 'Manage' : 'Set key'}
        </button>
      </div>

      <div className="panel-fields">
        <label className="field-label">
          Provider
          <ProviderSelect value={player.providerId} disabled={locked} onChange={(id) => onChange({ providerId: id, modelId: '' })} />
        </label>
        <div className="field-label">
          Model
          <ModelPicker
            value={player.modelId}
            models={models}
            loading={loading}
            error={error}
            disabled={locked}
            onChange={(id) => onChange({ modelId: id })}
            onReload={reload}
            accent={accent}
          />
        </div>
        <label
          className="field-label"
          title={
            support === false
              ? "This model doesn't support a reasoning / thinking setting"
              : support === null
                ? 'Support unknown for this model — the setting is sent and may be ignored'
                : 'Maps to the provider’s reasoning effort setting'
          }
        >
          Effort
          <select
            className="field select"
            value={support === false ? 'na' : player.effort}
            disabled={effortDisabled}
            onChange={(e) => onChange({ effort: e.target.value as Effort })}
          >
            {support === false && <option value="na">N/A</option>}
            {EFFORTS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {props.extra}

      <div className="stats">
        {!props.hideCaptured && (
        <div className="stat captured">
          <span className="stat-label">Captured</span>
          <span className="captured-row">
            {sorted.length ? (
              sorted.map((t, i) => <MiniPiece key={i} type={t} color={color === 'w' ? 'b' : 'w'} theme={props.pieceTheme} />)
            ) : (
              <span className="muted">—</span>
            )}
            {props.materialDiff > 0 && <span className="diff">+{props.materialDiff}</span>}
          </span>
        </div>
        )}
        <div className="stat">
          <span className="stat-label">Time</span>
          <span className="stat-val mono">{fmtDuration(stats.timeMs)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Tokens</span>
          <span className="stat-val mono" title={`${stats.promptTokens} in · ${stats.completionTokens} out`}>
            {fmtTokens(tokens)}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Cost</span>
          <span className="stat-val mono">{stats.requests ? fmtCost(stats.costUsd, stats.costKnown) : '—'}</span>
        </div>
      </div>

      <div className={`bubble ${thinking ? 'is-thinking' : ''} ${props.errorMessage ? 'is-error' : ''}`} aria-live="polite">
        {props.errorMessage ? (
          <span className="bubble-err">
            <IconAlert size={14} /> {props.errorMessage}
          </span>
        ) : thinking ? (
          <span className="thinking-dots">
            Thinking{attempt > 1 ? ` · attempt ${attempt}` : ''}
            <i />
            <i />
            <i />
          </span>
        ) : props.comment ? (
          <span>“{props.comment}”</span>
        ) : (
          <span className="muted">Waiting for the first move…</span>
        )}
        {stats.illegalReplies > 0 && !thinking && <span className="illegal-count">{stats.illegalReplies} invalid repl{stats.illegalReplies === 1 ? 'y' : 'ies'}</span>}
      </div>
    </section>
  )
}

export function materialFromCaptures(captured: string[]) {
  return captured.reduce((s, t) => s + (VALUE[t] ?? 0), 0)
}
