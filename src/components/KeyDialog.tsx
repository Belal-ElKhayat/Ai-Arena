import { useEffect, useState } from 'react'
import { getProvider } from '../providers/registry'
import { useKeyStore } from '../lib/keys'
import type { Credentials } from '../providers/types'
import { Modal } from './Modal'
import { IconKey } from './Icons'

export function KeyDialog({ providerId, onClose }: { providerId: string | null; onClose: () => void }) {
  const [store, setStore] = useKeyStore()
  const provider = getProvider(providerId ?? 'openrouter')
  const cur: Credentials = (providerId ? store[providerId] : undefined) ?? {}
  const [apiKey, setApiKey] = useState(cur.apiKey ?? '')
  const [baseUrl, setBaseUrl] = useState(cur.baseUrl ?? '')
  const [useProxy, setUseProxy] = useState(Boolean(cur.useProxy))
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!providerId) return
    const c = store[providerId] ?? {}
    setApiKey(c.apiKey ?? '')
    setBaseUrl(c.baseUrl ?? '')
    setUseProxy(Boolean(c.useProxy))
    setShow(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId])

  const save = () => {
    if (!providerId) return
    setStore((s) => ({ ...s, [providerId]: { apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), useProxy } }))
    onClose()
  }
  const clear = () => {
    if (!providerId) return
    setStore((s) => {
      const n = { ...s }
      delete n[providerId]
      return n
    })
    onClose()
  }

  return (
    <Modal open={Boolean(providerId)} onClose={onClose} title={`${provider.label} credentials`}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <p className="muted small">
          {provider.keyHelp}{' '}
          {provider.keyUrl && (
            <a href={provider.keyUrl} target="_blank" rel="noreferrer">
              Get a key ↗
            </a>
          )}
        </p>
        {provider.needsBaseUrl && (
          <label className="field-label">
            Base URL
            <input className="field" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" inputMode="url" autoComplete="off" spellCheck={false} />
          </label>
        )}
        <label className="field-label">
          API key {provider.needsBaseUrl && <span className="muted">(optional for local servers)</span>}
          <div className="key-input">
            <IconKey size={15} />
            <input
              className="field"
              type={show ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" className="link" onClick={() => setShow((s) => !s)}>
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={useProxy} onChange={(e) => setUseProxy(e.target.checked)} />
          <span className="toggle-track" />
          Route through the stateless proxy
        </label>
        <p className="muted small">
          Only needed for providers that block direct browser requests. The proxy forwards the request and stores or logs nothing.
        </p>
        <div className="privacy-note small">
          🔒 Your key is saved only in this browser (localStorage) and is sent only to {provider.label}
          {useProxy ? ' via this site’s pass-through proxy' : ''}.
        </div>
        <div className="row gap end">
          {(cur.apiKey || cur.baseUrl) && (
            <button type="button" className="dock-btn danger" onClick={clear}>
              Remove
            </button>
          )}
          <button type="submit" className="primary-btn small">
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}
