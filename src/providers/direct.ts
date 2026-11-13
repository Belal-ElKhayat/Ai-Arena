import { NON_CHAT, REASONING_EFFORT, openAICompatibleProvider } from './openaiCompatFactory'

/**
 * Direct providers with OpenAI-compatible APIs. Each is one small config.
 * Model lists are always fetched live; nothing here names a model.
 * If a provider blocks browser requests (CORS), enable the proxy in its key dialog.
 */

export const openAIAdapter = openAICompatibleProvider({
  id: 'openai',
  label: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  keyUrl: 'https://platform.openai.com/api-keys',
  keyHelp: 'Create a key in the OpenAI platform dashboard. Effort maps to reasoning_effort on reasoning models.',
  effortMap: REASONING_EFFORT,
  streamUsage: true,
})

export const xaiAdapter = openAICompatibleProvider({
  id: 'xai',
  label: 'xAI',
  baseUrl: 'https://api.x.ai/v1',
  keyUrl: 'https://console.x.ai',
  keyHelp: 'Create a key in the xAI console. Effort maps to reasoning_effort where the model supports it.',
  effortMap: REASONING_EFFORT,
  streamUsage: true,
})

export const groqAdapter = openAICompatibleProvider({
  id: 'groq',
  label: 'Groq',
  baseUrl: 'https://api.groq.com/openai/v1',
  keyUrl: 'https://console.groq.com/keys',
  keyHelp: 'Create a key in the Groq console. Effort maps to reasoning_effort on reasoning models.',
  effortMap: REASONING_EFFORT,
  streamUsage: true,
})

export const geminiAdapter = openAICompatibleProvider({
  id: 'gemini',
  label: 'Google Gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  keyUrl: 'https://aistudio.google.com/apikey',
  keyHelp: 'Create a key in Google AI Studio. Uses the OpenAI-compatible Gemini endpoint; Off sends reasoning_effort "none".',
  effortMap: { ...REASONING_EFFORT, off: { reasoning_effort: 'none' } },
  streamUsage: true,
  mapId: (id) => id.replace(/^models\//, ''),
})

export const mistralAdapter = openAICompatibleProvider({
  id: 'mistral',
  label: 'Mistral',
  baseUrl: 'https://api.mistral.ai/v1',
  keyUrl: 'https://console.mistral.ai/api-keys',
  keyHelp: 'Create a key in the Mistral console. Effort is not sent for Mistral models.',
  // Mistral returns usage in the final chunk without stream_options.
  streamUsage: false,
  isChatModel: (id, raw) => !NON_CHAT.test(id) && raw?.capabilities?.completion_chat !== false,
})

export const deepseekAdapter = openAICompatibleProvider({
  id: 'deepseek',
  label: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  keyUrl: 'https://platform.deepseek.com/api_keys',
  keyHelp: 'Create a key on the DeepSeek platform. Reasoning is chosen by model, so Effort is not sent.',
  streamUsage: true,
})

export const togetherAdapter = openAICompatibleProvider({
  id: 'together',
  label: 'Together AI',
  baseUrl: 'https://api.together.xyz/v1',
  keyUrl: 'https://api.together.ai/settings/api-keys',
  keyHelp: 'Create a key in your Together AI settings. Effort maps to reasoning_effort where supported.',
  effortMap: REASONING_EFFORT,
  streamUsage: false,
  isChatModel: (id, raw) => (raw?.type ? raw.type === 'chat' : !NON_CHAT.test(id)),
  // Together reports prices in USD per 1M tokens.
  pricing: (raw) => {
    const per = (v: unknown) => (typeof v === 'number' && v >= 0 ? v / 1_000_000 : null)
    return { prompt: per(raw?.pricing?.input), completion: per(raw?.pricing?.output) }
  },
})
