import { errorFromResponse, providerFetch } from './http'
import { chatCompletion, chatCompletionStream, joinUrl } from './openaiCompatible'
import type { ModelInfo, ProviderAdapter, SendMoveRequest } from './types'
import { ProviderError } from './types'

/** Any OpenAI-compatible endpoint: LM Studio, Ollama, Together, Groq, vLLM, ... */
export const customOpenAIAdapter: ProviderAdapter = {
  id: 'custom',
  label: 'Custom OpenAI-compatible',
  keyHelp: 'Enter the base URL that ends before /chat/completions (e.g. https://api.example.com/v1) and its key.',
  needsBaseUrl: true,
  group: 'custom',

  hasCredentials: (c) => Boolean(c.baseUrl?.trim()),

  async listModels(c, signal) {
    if (!c.baseUrl) return []
    const headers: Record<string, string> = {}
    if (c.apiKey) headers.Authorization = `Bearer ${c.apiKey}`
    const res = await providerFetch(joinUrl(c.baseUrl, 'models'), { headers, signal, useProxy: c.useProxy })
    if (!res.ok) throw await errorFromResponse(res)
    const data = await res.json()
    const list: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []
    return list.map<ModelInfo>((m) => ({
      id: String(m.id),
      name: String(m.name ?? m.id),
      contextLength: typeof m.context_length === 'number' ? m.context_length : null,
      pricing: { prompt: null, completion: null },
      supportsReasoning: null,
    }))
  },

  effortSupport: () => null,

  sendMove: (req) => chatCompletion(request(req)),
  streamMove: (req, onDelta) => chatCompletionStream({ ...request(req), onDelta, includeUsage: true }),
}

function request({ model, messages, effort, credentials, signal }: SendMoveRequest) {
  if (!credentials.baseUrl) throw new ProviderError('No base URL configured.', { kind: 'auth' })
  const body: Record<string, unknown> = { model }
  if (effort === 'low' || effort === 'medium' || effort === 'high') body.reasoning_effort = effort
  return {
    url: joinUrl(credentials.baseUrl, 'chat/completions'),
    apiKey: credentials.apiKey,
    body,
    messages,
    signal,
    useProxy: credentials.useProxy,
  }
}
