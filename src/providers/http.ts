import { APP_CONFIG } from '../config/app'
import { ProviderError } from './types'

/**
 * fetch wrapper used by every adapter. When `useProxy` is set, the request goes
 * through the stateless Netlify Function at /api/proxy, which forwards it to
 * `target` and returns the response untouched. Keys are never logged.
 */
export async function providerFetch(
  target: string,
  init: RequestInit & { useProxy?: boolean },
): Promise<Response> {
  const { useProxy, ...rest } = init
  let url = target
  let headers = new Headers(rest.headers)
  if (useProxy) {
    url = APP_CONFIG.proxyPath
    headers.set('x-arena-target', target)
  }
  try {
    return await fetch(url, { ...rest, headers })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new ProviderError(
      useProxy
        ? 'Network error reaching the proxy.'
        : 'Network error. The provider may block browser requests (CORS) — try enabling the proxy in the key settings.',
      { kind: 'network', retryable: true },
    )
  }
}

export async function errorFromResponse(res: Response): Promise<ProviderError> {
  let detail = ''
  try {
    const body = await res.json()
    detail = body?.error?.message || body?.message || body?.error || ''
    if (typeof detail !== 'string') detail = JSON.stringify(detail)
  } catch {
    try {
      detail = (await res.text()).slice(0, 200)
    } catch {
      /* ignore */
    }
  }
  const s = res.status
  if (s === 401 || s === 403)
    return new ProviderError(`Authentication failed (${s}). Check your API key. ${detail}`.trim(), {
      status: s,
      kind: 'auth',
      retryable: true,
    })
  if (s === 429)
    return new ProviderError(`Rate limited by the provider (429). Wait a moment and retry. ${detail}`.trim(), {
      status: s,
      kind: 'rate_limit',
    })
  if (s === 402)
    return new ProviderError(`Insufficient credits (402). ${detail}`.trim(), { status: s, kind: 'auth' })
  if (s >= 500)
    return new ProviderError(`Provider error (${s}). ${detail}`.trim(), { status: s, kind: 'server' })
  return new ProviderError(`Request failed (${s}). ${detail}`.trim(), { status: s, kind: 'bad_request' })
}
