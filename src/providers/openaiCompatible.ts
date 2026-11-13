import { errorFromResponse, providerFetch } from './http'
import type { ChatMessage, DeltaHandler, SendMoveResponse, TokenUsage } from './types'
import { ProviderError } from './types'

interface ChatOpts {
  url: string
  apiKey?: string
  body: Record<string, unknown>
  messages: ChatMessage[]
  signal: AbortSignal
  useProxy?: boolean
  extraHeaders?: Record<string, string>
}

function headersFor(opts: ChatOpts) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.extraHeaders ?? {}),
  }
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`
  return headers
}

function usageFrom(u: any): TokenUsage {
  u = u ?? {}
  return {
    promptTokens: Number(u.prompt_tokens ?? u.input_tokens ?? 0) || 0,
    completionTokens: Number(u.completion_tokens ?? u.output_tokens ?? 0) || 0,
    costUsd: typeof u.cost === 'number' ? u.cost : null,
  }
}

const REFUSAL_FINISH = new Set(['content_filter', 'refusal', 'safety'])

/** Shared helper for any `/chat/completions`-shaped API. */
export async function chatCompletion(opts: ChatOpts): Promise<SendMoveResponse> {
  const res = await providerFetch(opts.url, {
    method: 'POST',
    headers: headersFor(opts),
    body: JSON.stringify({ ...opts.body, messages: opts.messages }),
    signal: opts.signal,
    useProxy: opts.useProxy,
  })
  if (!res.ok) throw await errorFromResponse(res)
  let data: any
  try {
    data = await res.json()
  } catch {
    throw new ProviderError('Provider returned an unreadable response.', { kind: 'server' })
  }
  if (data?.error) {
    const msg = typeof data.error === 'string' ? data.error : data.error.message || 'Unknown provider error'
    throw new ProviderError(`Provider error: ${msg}`, { kind: 'server' })
  }
  const choice = data?.choices?.[0]
  let text: string = choice?.message?.content ?? choice?.text ?? ''
  if (Array.isArray(text)) {
    text = (text as Array<{ text?: string }>).map((p) => p.text ?? '').join('')
  }
  const finish = typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined
  return {
    text: String(text ?? ''),
    usage: usageFrom(data?.usage),
    finishReason: finish,
    refused: Boolean(choice?.message?.refusal) || (finish ? REFUSAL_FINISH.has(finish) : false),
  }
}

/**
 * Reads a Server-Sent Events body and calls onData with each parsed JSON `data:` payload.
 * Comment lines (": keep-alive") and `[DONE]` are ignored.
 */
export async function readSSE(res: Response, onData: (json: any) => void) {
  if (!res.body) throw new ProviderError('Streaming is not supported by this browser.', { kind: 'server' })
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  const flushLine = (line: string) => {
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    let json: any
    try {
      json = JSON.parse(payload)
    } catch {
      return
    }
    onData(json)
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '')
      buf = buf.slice(nl + 1)
      flushLine(line)
    }
  }
  buf += dec.decode()
  if (buf.trim()) flushLine(buf.trim())
}

/** Streaming variant of chatCompletion. */
export async function chatCompletionStream(
  opts: ChatOpts & { onDelta: DeltaHandler; includeUsage?: boolean },
): Promise<SendMoveResponse> {
  const body: Record<string, unknown> = { ...opts.body, messages: opts.messages, stream: true }
  if (opts.includeUsage) body.stream_options = { include_usage: true }
  const res = await providerFetch(opts.url, {
    method: 'POST',
    headers: { ...headersFor(opts), Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal: opts.signal,
    useProxy: opts.useProxy,
  })
  if (!res.ok) throw await errorFromResponse(res)
  // Some servers ignore `stream: true` and answer with plain JSON.
  if (!(res.headers.get('content-type') ?? '').includes('event-stream')) {
    const data = await res.json().catch(() => null)
    const text = String(data?.choices?.[0]?.message?.content ?? '')
    if (text) opts.onDelta(text)
    return { text, usage: usageFrom(data?.usage), finishReason: data?.choices?.[0]?.finish_reason }
  }
  let text = ''
  let usage: TokenUsage = { promptTokens: 0, completionTokens: 0, costUsd: null }
  let finish: string | undefined
  let refused = false
  let streamError: string | null = null
  await readSSE(res, (json) => {
    if (json?.error) {
      streamError = typeof json.error === 'string' ? json.error : json.error.message || 'Stream error'
      return
    }
    const choice = json?.choices?.[0]
    const delta = choice?.delta
    const piece = typeof delta?.content === 'string' ? delta.content : ''
    if (piece) {
      text += piece
      opts.onDelta(piece)
    }
    if (delta?.refusal) refused = true
    if (choice?.finish_reason) finish = choice.finish_reason
    const u = json?.usage ?? json?.x_groq?.usage
    if (u) usage = usageFrom(u)
  })
  if (streamError && !text) throw new ProviderError(`Provider error: ${streamError}`, { kind: 'server' })
  if (finish && REFUSAL_FINISH.has(finish)) refused = true
  return { text, usage, finishReason: finish, refused }
}

export function joinUrl(base: string, path: string) {
  return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '')
}
