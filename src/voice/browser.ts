import type { SpeakOptions, VoiceEngine, VoiceInfo } from './types'

/**
 * Free engine built on the browser's Web Speech API (speechSynthesis).
 * Text is spoken sentence-group by sentence-group: long single utterances are
 * cut off by some browsers, and short chunks make "skip" respond instantly.
 */

const synth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const s = synth()
  if (!s) return Promise.resolve([])
  const now = s.getVoices()
  if (now.length) return Promise.resolve(now)
  if (!voicesPromise) {
    voicesPromise = new Promise((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        s.removeEventListener?.('voiceschanged', finish)
        resolve(s.getVoices())
        // Allow another attempt later if nothing loaded yet.
        if (!s.getVoices().length) voicesPromise = null
      }
      s.addEventListener?.('voiceschanged', finish)
      setTimeout(finish, 2500)
    })
  }
  return voicesPromise
}

/** Split text into chunks of whole sentences, each under ~220 characters. */
export function chunkText(text: string, max = 220): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g) ?? [text]
  const out: string[] = []
  let cur = ''
  for (const raw of sentences) {
    const s = raw.trim()
    if (!s) continue
    if (s.length > max) {
      if (cur) out.push(cur), (cur = '')
      // Very long sentence: split on commas / spaces.
      let rest = s
      while (rest.length > max) {
        let cut = rest.lastIndexOf(', ', max)
        if (cut < max * 0.4) cut = rest.lastIndexOf(' ', max)
        if (cut <= 0) cut = max
        out.push(rest.slice(0, cut + 1).trim())
        rest = rest.slice(cut + 1)
      }
      cur = rest.trim()
    } else if ((cur + ' ' + s).trim().length > max) {
      out.push(cur)
      cur = s
    } else cur = (cur + ' ' + s).trim()
  }
  if (cur) out.push(cur)
  return out
}

function speakChunk(s: SpeechSynthesis, text: string, voice: SpeechSynthesisVoice | undefined, opts: SpeakOptions) {
  return new Promise<void>((resolve) => {
    if (opts.signal.aborted) return resolve()
    const u = new SpeechSynthesisUtterance(text)
    if (voice) {
      u.voice = voice
      u.lang = voice.lang
    }
    u.rate = Math.max(0.5, Math.min(2, opts.rate || 1))
    u.pitch = Math.max(0, Math.min(2, opts.pitch ?? 1))
    let settled = false
    // Safety net: some engines never fire `end`. Generous estimate of speaking time.
    const guard = setTimeout(done, Math.max(6000, (text.length / Math.max(0.5, u.rate)) * 110))
    function done() {
      if (settled) return
      settled = true
      clearTimeout(guard)
      opts.signal.removeEventListener('abort', onAbort)
      resolve()
    }
    function onAbort() {
      s.cancel()
      done()
    }
    u.onend = done
    u.onerror = done
    opts.signal.addEventListener('abort', onAbort)
    s.speak(u)
    // Chrome can get stuck in a paused state after a cancel.
    if (s.paused) s.resume()
  })
}

export const browserVoiceEngine: VoiceEngine = {
  id: 'browser',
  label: 'Browser voices (free)',
  description: 'Uses the speech voices built into your browser and operating system. Free and works offline for local voices.',

  isAvailable: () => Boolean(synth()) && typeof SpeechSynthesisUtterance !== 'undefined',

  async listVoices(): Promise<VoiceInfo[]> {
    const list = await loadVoices()
    return list.map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang, local: v.localService }))
  },

  async speak(text, opts) {
    const s = synth()
    if (!s || !text.trim()) return
    const voices = await loadVoices()
    const voice = voices.find((v) => v.voiceURI === opts.voiceId)
    for (const chunk of chunkText(text)) {
      if (opts.signal.aborted) break
      await speakChunk(s, chunk, voice, opts)
    }
  },

  stop() {
    synth()?.cancel()
  },
}
