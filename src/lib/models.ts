import { useEffect, useState } from 'react'
import { getProvider } from '../providers/registry'
import type { Credentials, ModelInfo } from '../providers/types'

/** In-memory cache of model lists per provider (+ base URL). */
const cache = new Map<string, ModelInfo[]>()
const inflight = new Map<string, Promise<ModelInfo[]>>()

/** Short non-reversible fingerprint so the list reloads when a key is added or changed. */
function fp(s: string | undefined) {
  if (!s) return ''
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

const cacheKey = (providerId: string, c: Credentials) => `${providerId}|${c.baseUrl ?? ''}|${fp(c.apiKey)}|${c.useProxy ? 'p' : ''}`

export function getCachedModel(providerId: string, c: Credentials, modelId: string) {
  return cache.get(cacheKey(providerId, c))?.find((m) => m.id === modelId)
}

export function useModels(providerId: string, credentials: Credentials) {
  const key = cacheKey(providerId, credentials)
  const [state, setState] = useState<{ models: ModelInfo[]; loading: boolean; error: string | null }>(() => ({
    models: cache.get(key) ?? [],
    loading: !cache.has(key),
    error: null,
  }))
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    if (cache.has(key) && nonce === 0) {
      setState({ models: cache.get(key)!, loading: false, error: null })
      return
    }
    const provider = getProvider(providerId)
    if (provider.needsBaseUrl && !credentials.baseUrl) {
      setState({ models: [], loading: false, error: null })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    let p = inflight.get(key)
    if (!p) {
      p = provider.listModels(credentials)
      inflight.set(key, p)
    }
    p.then((models) => {
      cache.set(key, models)
      if (alive) setState({ models, loading: false, error: null })
    })
      .catch((e: Error) => {
        if (alive) setState({ models: [], loading: false, error: e.message || 'Could not load models' })
      })
      .finally(() => inflight.delete(key))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce])

  return { ...state, reload: () => setNonce((n) => n + 1) }
}
