import type { VoiceEngine } from './types'

/**
 * Placeholders for paid TTS engines that will use the user's own API key.
 * To implement one: fill in listVoices/speak (fetch audio, play it with an
 * <audio> element, resolve on `ended` or when the signal aborts), drop
 * `comingSoon`, and keep the key in the browser like provider keys.
 */
function comingSoon(id: string, label: string, description: string): VoiceEngine {
  return {
    id,
    label,
    description,
    comingSoon: true,
    needsKey: true,
    isAvailable: () => false,
    listVoices: async () => [],
    speak: async () => {},
    stop: () => {},
  }
}

export const openAITtsEngine = comingSoon('openai-tts', 'OpenAI TTS', 'Natural voices using your own OpenAI API key.')
export const elevenLabsEngine = comingSoon('elevenlabs', 'ElevenLabs', 'Expressive voices using your own ElevenLabs API key.')
