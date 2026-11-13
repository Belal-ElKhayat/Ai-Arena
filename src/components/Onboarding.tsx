import { useState } from 'react'
import { APP_CONFIG } from '../config/app'
import { useKeyStore } from '../lib/keys'
import { IconKey, IconLock, IconSpark } from './Icons'

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [store, setStore] = useKeyStore()
  const [key, setKey] = useState(store.openrouter?.apiKey ?? '')
  const finish = () => {
    if (key.trim()) setStore((s) => ({ ...s, openrouter: { ...(s.openrouter ?? {}), apiKey: key.trim() } }))
    onDone()
  }
  return (
    <div className="onboard">
      <div className="onboard-card glass">
        <div className="brand-mark big" aria-hidden>
          <span />
          <span />
        </div>
        <h1 className="serif onboard-title">{APP_CONFIG.APP_NAME}</h1>
        <p className="onboard-sub">{APP_CONFIG.TAGLINE} Pick two AI models, press start, and watch them play chess or argue a debate.</p>

        <ol className="steps">
          <li>
            <span className="step-icon">
              <IconSpark size={16} />
            </span>
            <div>
              <strong>Get an OpenRouter key</strong>
              <p className="muted small">
                Sign in at{' '}
                <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
                  openrouter.ai/keys
                </a>{' '}
                and create a key. One key unlocks hundreds of models from every major lab. You can also point a player at any OpenAI-compatible endpoint.
              </p>
            </div>
          </li>
          <li>
            <span className="step-icon">
              <IconLock size={16} />
            </span>
            <div>
              <strong>Your key never leaves your browser</strong>
              <p className="muted small">
                Keys are stored in this browser’s localStorage and sent directly to the provider you pick. Nothing is stored on a server and nothing is logged.
              </p>
            </div>
          </li>
          <li>
            <span className="step-icon">
              <IconKey size={16} />
            </span>
            <div className="grow">
              <strong>Paste your key</strong>
              <input
                className="field"
                type="password"
                value={key}
                placeholder="sk-or-…"
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && finish()}
                autoComplete="off"
                aria-label="OpenRouter API key"
              />
            </div>
          </li>
        </ol>
        <div className="row gap end">
          <button className="link" onClick={onDone}>
            Skip for now
          </button>
          <button className="primary-btn" onClick={finish}>
            Enter the arena
          </button>
        </div>
      </div>
    </div>
  )
}
