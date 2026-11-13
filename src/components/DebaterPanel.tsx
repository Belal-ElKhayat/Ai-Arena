import { useRef } from 'react'
import type { Seat, SeatStats } from '../core/types'
import { STYLE_PRESETS, type PresetId } from '../games/debate/content'
import { STANCE_LABEL, type DebaterConfig, type Stance } from '../games/debate/module'
import { fmtCost, fmtDuration, fmtTokens } from '../lib/format'
import type { Credentials } from '../providers/types'
import { IconLock, IconMic } from './Icons'
import { KeyStatus, ModelFields, useModelName } from './ModelFields'

export type DebaterStatus = 'idle' | 'waiting' | 'turn' | 'thinking' | 'speaking' | 'error'

const STANCES: Stance[] = ['for', 'against', 'free']
const MAX_INSTR = 1200

export function Waveform({ active }: { active: boolean }) {
  return (
    <span className={`wave ${active ? 'on' : ''}`} aria-hidden>
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

const STATUS_TEXT: Record<DebaterStatus, string> = {
  idle: 'Ready',
  waiting: 'Listening',
  turn: 'Up next',
  thinking: 'Composing…',
  speaking: 'Speaking',
  error: 'Needs attention',
}

export function DebaterPanel(props: {
  seat: Seat
  debater: DebaterConfig
  onChange: (patch: Partial<DebaterConfig>) => void
  locked: boolean
  credentials: Credentials
  onSetKey: () => void
  stats: SeatStats
  status: DebaterStatus
  turnsSpoken: number
  words: number
  winner?: boolean
  voiceLabel?: string | null
}) {
  const { seat, debater, onChange, locked, stats, status } = props
  const accent = seat === 0 ? 'p1' : 'p2'
  const modelName = useModelName(debater, props.credentials)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const tokens = stats.promptTokens + stats.completionTokens
  const live = status === 'speaking' || status === 'thinking'

  const pickPreset = (id: PresetId) => {
    if (locked) return
    const p = STYLE_PRESETS.find((x) => x.id === id)!
    if (id === 'custom') {
      onChange({ preset: 'custom' })
      setTimeout(() => textRef.current?.focus(), 0)
    } else onChange({ preset: id, instructions: p.text })
  }

  return (
    <section
      className={`panel dpanel glass accent-${accent} st-${status} ${locked ? 'is-locked' : ''} ${props.winner ? 'winner' : ''}`}
      aria-label={`Debater ${seat + 1}`}
    >
      <div className="panel-ring" aria-hidden />
      <header className="panel-head">
        <span className="seat-tag">
          <span className="seat-dot" />
          Debater {seat + 1}
        </span>
        <span className={`dstatus ${live ? 'live' : ''}`} aria-live="polite">
          {status === 'speaking' ? <Waveform active /> : <span className="dstatus-dot" />}
          {STATUS_TEXT[status]}
        </span>
        {locked && (
          <span className="lock" title="Settings are locked during the debate">
            <IconLock size={14} />
          </span>
        )}
      </header>

      <input
        className="name-input"
        value={debater.name}
        onChange={(e) => onChange({ name: e.target.value.slice(0, 32) })}
        disabled={locked}
        aria-label={`Debater ${seat + 1} display name`}
        spellCheck={false}
      />
      <div className="model-line mono" title={debater.modelId}>
        {modelName || 'No model selected'}
      </div>
      <KeyStatus providerId={debater.providerId} credentials={props.credentials} onSetKey={props.onSetKey} />

      <div className="dp-config">
        <ModelFields
          player={debater}
          onChange={onChange}
          locked={locked}
          credentials={props.credentials}
          accent={accent}
          idPrefix={`d${seat}`}
        />

        <div className="field-label">
          Stance
          <div className="seg stance-seg" role="radiogroup" aria-label={`Debater ${seat + 1} stance`}>
            {STANCES.map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={debater.stance === s}
                className={debater.stance === s ? 'on' : ''}
                disabled={locked}
                onClick={() => onChange({ stance: s })}
              >
                {STANCE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="instr">
          <div className="instr-head">
            <span className="field-label-text">Private instructions</span>
            <span className="private-tag" title={`Only ${debater.name || `Debater ${seat + 1}`} sees this. The opponent and the judge never do.`}>
              <IconLock size={11} /> private
            </span>
          </div>
          <div className="presets" role="group" aria-label="Style presets">
            {STYLE_PRESETS.map((p) => (
              <button
                key={p.id}
                className={`preset ${debater.preset === p.id ? 'on' : ''}`}
                disabled={locked}
                onClick={() => pickPreset(p.id)}
                aria-pressed={debater.preset === p.id}
              >
                {p.label}
              </button>
            ))}
          </div>
          <textarea
            ref={textRef}
            className="field instr-box"
            value={debater.instructions}
            disabled={locked}
            maxLength={MAX_INSTR}
            rows={3}
            placeholder="How should this AI argue? e.g. “Use only data and statistics.”"
            aria-label={`Private instructions for Debater ${seat + 1}`}
            onChange={(e) => {
              const text = e.target.value
              const match = STYLE_PRESETS.find((p) => p.text && p.text === text)
              onChange({ instructions: text, preset: match ? match.id : 'custom' })
            }}
          />
          <div className="instr-foot small muted">
            <span>Only this debater sees it.</span>
            <span className="mono">
              {debater.instructions.length}/{MAX_INSTR}
            </span>
          </div>
        </div>
      </div>

      {locked && (
        <div className="dp-summary small">
          <span className="stance-chip">{STANCE_LABEL[debater.stance]}</span>
          <span className="muted ellipsis" title={debater.instructions}>
            {STYLE_PRESETS.find((p) => p.id === debater.preset && p.id !== 'custom')?.label ?? (debater.instructions ? 'Custom style' : 'Natural style')}
          </span>
          {props.voiceLabel && (
            <span className="muted ellipsis voice-chip" title={props.voiceLabel}>
              <IconMic size={12} /> {props.voiceLabel}
            </span>
          )}
        </div>
      )}

      <div className="stats dstats">
        <div className="stat">
          <span className="stat-label">Turns</span>
          <span className="stat-val mono">{props.turnsSpoken}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Words</span>
          <span className="stat-val mono">{props.words}</span>
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
        <div className="stat">
          <span className="stat-label">Time</span>
          <span className="stat-val mono">{fmtDuration(stats.timeMs)}</span>
        </div>
      </div>
    </section>
  )
}
