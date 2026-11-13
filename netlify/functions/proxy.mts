import type { Config } from '@netlify/functions'

/**
 * Stateless pass-through proxy for providers that block direct browser calls.
 * - Forwards the request to the URL in the `x-arena-target` header.
 * - Stores nothing and logs nothing (never log headers or bodies: they contain API keys).
 * - Only https targets on public hostnames, and only model-list / chat endpoints.
 */

const ALLOWED_PATH = /\/(chat\/completions|models|messages)\/?$/
const FORWARD_HEADERS = [
  'authorization',
  'content-type',
  'accept',
  'x-api-key',
  'anthropic-version',
  'anthropic-dangerous-direct-browser-access',
  'http-referer',
  'x-title',
]

function isPrivateHost(host: string) {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true
  if (/^\[?(::1|fc|fd|fe80)/.test(h)) return true
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (a === 10 || a === 127 || a === 0 || a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
  }
  return false
}

export default async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }
  const target = req.headers.get('x-arena-target')
  let url: URL
  try {
    url = new URL(target ?? '')
  } catch {
    return Response.json({ error: { message: 'Missing or invalid x-arena-target header' } }, { status: 400 })
  }
  if (url.protocol !== 'https:' || isPrivateHost(url.hostname) || !ALLOWED_PATH.test(url.pathname)) {
    return Response.json({ error: { message: 'Target not allowed by proxy' } }, { status: 400 })
  }

  const headers = new Headers()
  for (const h of FORWARD_HEADERS) {
    const v = req.headers.get(h)
    if (v) headers.set(h, v)
  }

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? await req.text() : undefined,
      redirect: 'error',
    })
    const out = new Headers()
    out.set('content-type', upstream.headers.get('content-type') ?? 'application/json')
    out.set('cache-control', 'no-store')
    return new Response(upstream.body, { status: upstream.status, headers: out })
  } catch {
    return Response.json({ error: { message: 'Proxy could not reach the provider' } }, { status: 502 })
  }
}

export const config: Config = {
  path: '/api/proxy',
}
