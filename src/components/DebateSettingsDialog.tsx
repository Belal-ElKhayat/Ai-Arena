import { useEffect, useState } from 'react'
import type { Seat } from '../core/types'
import { speechQueue } from '../voice/queue'
import { VOICE_ENGINES } from '../voice/registry'
import type { VoiceInfo, VoiceSettings } from '../voice/types'
import { pickTwoVoices } from '../voice/useVoices'
import { Modal } from './Modal'
import { IconLock, IconMic, IconPlay } from './Icons'

export interface VoicePrefs {
  enabled: boolean
  engineId: string
  /** Wait for the voice to finish before the next AI responds. */
  waitForVoice: boolean
  seats: [VoiceSettings, VoiceSettings]
}

export interface DebateLimits {
  maxTurns: number
  timeoutSec: number
}

function VoiceRow({
  seat,
  name,
  value,
  voices,
  engineId,
  onChange,
}: {
  seat: Seat
  name: string
  value: VoiceSettings
  voices: VoiceInfo[]
  engineId: string
  onChange: (v: Partial<VoiceSettings>) => void
}) {
  return (
    <div className={`voice-row accent-p${seat + 1}`}>
      <div className="seat-tag">
        <span className="seat-dot" /> {name}
      </div>
      <label className="field-label">
        Voice
        <select className="field select" value={value.voiceId} onChange={(e) => onChange({ voiceId: e.target.value })}>
          {!voices.some((v) => v.id === value.voiceId) && <option value={value.voiceId}>System default</option>}
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.lang})
            </option>
          ))}
        </select>
      </label>
      <div className="slider-row">
        <label className="field-label">
          <span>
            Speed <span className="mono muted">{value.rate.toFixed(2)}×</span>
          </span>
          <input type="range" min={0.5} max={2} step={0.05} value={value.rate} onChange={(e) => onChange({ rate: Number(e.target.value) })} />
        </label>
        <label className="field-label">
          <span>
            Pitch <span className="mono muted">{value.pitch.toFixed(2)}</span>
          </span>
          <input type="range" min={0} max={2} step={0.05} value={value.pitch} onChange={(e) => onChange({ pitch: Number(e.target.value) })} />
        </label>
      </div>
      <button
        className="dock-btn"
        onClick={() => {
          speechQueue.clear()
          speechQueue.enqueue({ seat, turnIndex: -1, text: `Hello, I'm ${name}. Let the debate begin.`, engineId, settings: value })
        }}
      >
        <IconPlay size={12} /> Test voice
      </button>
    </div>
  )
}

export function DebateSettingsDialog({
  open,
  onClose,
  locked,
  limits,
  onLimits,
  voice,
  onVoice,
  voices,
  voicesAvailable,
  voicesLoading,
  names,
}: {
  open: boolean
  onClose: () => void
  locked: boolean
  limits: DebateLimits
  onLimits: (p: Partial<DebateLimits>) => void
  voice: VoicePrefs
  onVoice: (p: Partial<VoicePrefs>) => void
  voices: VoiceInfo[]
  voicesAvailable: boolean
  voicesLoading: boolean
  names: [string, string]
}) {
  const [maxTurns, setMaxTurns] = useState(String(limits.maxTurns))
  const [timeout, setTimeoutSec] = useState(String(limits.timeoutSec))
  useEffect(() => {
    if (open) {
      setMaxTurns(String(limits.maxTurns))
      setTimeoutSec(String(limits.timeoutSec))
    }
  }, [open, limits.maxTurns, limits.timeoutSec])

  const setSeat = (s: Seat, v: Partial<VoiceSettings>) =>
    onVoice({ seats: (s === 0 ? [{ ...voice.seats[0], ...v }, voice.seats[1]] : [voice.seats[0], { ...voice.seats[1], ...v }]) as VoicePrefs['seats'] })
  const noVoices = !voicesAvailable || (!voicesLoading && voices.length === 0)

  return (
    <Modal open={open} onClose={onClose} title="Debate settings" wide>
      <div className="form">
        <section className="set-sec">
          <h3 className="set-h">
            Limits {locked && <IconLock size={13} />}
          </h3>
          {locked && <div className="privacy-note small">Limits are locked while a debate is running.</div>}
          <div className="set-grid">
            <label className="field-label">
              Max total turns <span className="muted">(hard stop, both debaters)</span>
              <input
                className="field"
                type="number"
                min={2}
                max={200}
                value={maxTurns}
                disabled={locked}
                onChange={(e) => setMaxTurns(e.target.value)}
                onBlur={() => onLimits({ maxTurns: Math.max(2, Math.min(200, Math.round(Number(maxTurns)) || 2)) })}
              />
            </label>
            <label className="field-label">
              Per-turn timeout <span className="muted">(seconds)</span>
              <input
                className="field"
                type="number"
                min={10}
                max={900}
                value={timeout}
                disabled={locked}
                onChange={(e) => setTimeoutSec(e.target.value)}
                onBlur={() => onLimits({ timeoutSec: Math.max(10, Math.min(900, Math.round(Number(timeout)) || 10)) })}
              />
            </label>
          </div>
        </section>

        <section className="set-sec">
          <div className="row gap">
            <h3 className="set-h grow">
              <IconMic size={14} /> Voice
            </h3>
            <label className="toggle">
              <input type="checkbox" checked={voice.enabled} onChange={(e) => onVoice({ enabled: e.target.checked })} />
              <span className="toggle-track" />
              {voice.enabled ? 'On' : 'Off'}
            </label>
          </div>
          {noVoices ? (
            <div className="privacy-note small">
              {!voicesAvailable
                ? 'This browser doesn’t offer speech voices, so debates run in text mode. Everything else works normally.'
                : 'No speech voices are installed on this device yet, so debates run in text mode. Try another browser or add voices in your system settings.'}
            </div>
          ) : (
            voice.enabled && (
              <>
                <label className="field-label">
                  Engine
                  <select className="field select" value={voice.engineId} onChange={(e) => onVoice({ engineId: e.target.value })}>
                    {VOICE_ENGINES.map((e) => (
                      <option key={e.id} value={e.id} disabled={e.comingSoon}>
                        {e.label}
                        {e.comingSoon ? ' — coming soon' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="muted small">{VOICE_ENGINES.find((e) => e.id === voice.engineId)?.description}</p>
                <label className="toggle">
                  <input type="checkbox" checked={voice.waitForVoice} onChange={(e) => onVoice({ waitForVoice: e.target.checked })} />
                  <span className="toggle-track" />
                  Wait for the voice to finish before the next AI responds
                </label>
                <div className="voice-grid">
                  {([0, 1] as Seat[]).map((s) => (
                    <VoiceRow key={s} seat={s} name={names[s]} value={voice.seats[s]} voices={voices} engineId={voice.engineId} onChange={(v) => setSeat(s, v)} />
                  ))}
                </div>
                <div className="row gap">
                  <button
                    className="link"
                    onClick={() => {
                      const [a, b] = pickTwoVoices(voices)
                      onVoice({ seats: [{ ...voice.seats[0], voiceId: a }, { ...voice.seats[1], voiceId: b }] })
                    }}
                  >
                    Auto-assign two different voices
                  </button>
                </div>
              </>
            )
          )}
        </section>

        <div className="kbd-list small">
          <div>
            <kbd>Space</kbd> Pause / resume
          </div>
          <div>
            <kbd>M</kbd> Mute voice and sounds
          </div>
          <div>
            <kbd>S</kbd> Skip current speech
          </div>
          <div>
            <kbd>←</kbd> <kbd>→</kbd> Step through a replay
          </div>
        </div>
        <div className="row end">
          <button className="primary-btn small" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}
