import { readStore } from './storage'

let ctx: AudioContext | null = null
function ac() {
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    ctx = new C()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
  const a = ac()
  if (!a) return
  const t = a.currentTime + delay
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.6), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(a.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function knock(gain: number, cutoff: number) {
  const a = ac()
  if (!a) return
  const len = Math.floor(a.sampleRate * 0.06)
  const buf = a.createBuffer(1, len, a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
  const src = a.createBufferSource()
  src.buffer = buf
  const f = a.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = cutoff
  const g = a.createGain()
  g.gain.value = gain
  src.connect(f).connect(g).connect(a.destination)
  src.start()
}

export type SoundKind = 'move' | 'capture' | 'check' | 'end' | 'start'

export function playSound(kind: SoundKind) {
  if (readStore('muted', false)) return
  try {
    switch (kind) {
      case 'move':
        knock(0.5, 2400)
        tone(420, 0.06, 'sine', 0.05)
        break
      case 'capture':
        knock(0.8, 1400)
        tone(220, 0.12, 'triangle', 0.08)
        break
      case 'check':
        knock(0.5, 2400)
        tone(880, 0.12, 'sine', 0.06, 0.02)
        tone(1320, 0.16, 'sine', 0.045, 0.1)
        break
      case 'start':
        tone(523, 0.18, 'sine', 0.05)
        tone(784, 0.24, 'sine', 0.05, 0.09)
        break
      case 'end':
        tone(392, 0.5, 'sine', 0.05)
        tone(523, 0.5, 'sine', 0.05, 0.08)
        tone(659, 0.7, 'sine', 0.05, 0.16)
        break
    }
  } catch {
    /* audio unavailable */
  }
}
