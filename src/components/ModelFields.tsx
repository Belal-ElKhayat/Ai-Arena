import { useModels } from '../lib/models'
import { getProvider } from '../providers/registry'
import type { Credentials, Effort, ModelInfo } from '../providers/types'
import type { PlayerConfig } from '../core/types'
import { ModelPicker } from './ModelPicker'
import { EFFORTS } from './PlayerPanel'
import { ProviderSelect } from './ProviderSelect'

/** "API key found / No API key" line with a link to the key dialog. */
export function KeyStatus({ providerId, credentials, onSetKey }: { providerId: string; credentials: Credentials; onSetKey: () => void }) {
  const provider = getProvider(providerId)
  const hasKey = provider.hasCredentials(credentials)
  return (
    <div className="key-line">
      <span className={`dot ${hasKey ? 'ok' : ''}`} />
      <span>{hasKey ? (provider.needsBaseUrl ? 'Endpoint configured' : 'API key found') : provider.needsBaseUrl ? 'No endpoint' : 'No API key'}</span>
      <button className="link" onClick={onSetKey}>
        {hasKey ? 'Manage' : 'Set key'}
      </button>
    </div>
  )
}

/** Provider, searchable model list and Effort — shared by debaters and the judge. */
export function ModelFields({
  player,
  onChange,
  locked,
  credentials,
  accent,
  idPrefix,
}: {
  player: PlayerConfig
  onChange: (patch: Partial<PlayerConfig>) => void
  locked: boolean
  credentials: Credentials
  accent: 'p1' | 'p2' | 'judge'
  idPrefix: string
}) {
  const provider = getProvider(player.providerId)
  const { models, loading, error, reload } = useModels(player.providerId, credentials)
  const model: ModelInfo | undefined = models.find((m) => m.id === player.modelId)
  const support = provider.effortSupport(model)
  return (
    <div className="panel-fields">
      <label className="field-label" htmlFor={`${idPrefix}-provider`}>
        Provider
        <ProviderSelect id={`${idPrefix}-provider`} value={player.providerId} disabled={locked} onChange={(id) => onChange({ providerId: id, modelId: '' })} />
      </label>
      <div className="field-label">
        Model
        <ModelPicker
          value={player.modelId}
          models={models}
          loading={loading}
          error={error}
          disabled={locked}
          onChange={(id) => onChange({ modelId: id })}
          onReload={reload}
          accent={accent}
        />
      </div>
      <label
        className="field-label"
        title={
          support === false
            ? "This model doesn't support a reasoning / thinking setting"
            : support === null
              ? 'Support unknown for this model — the setting is sent and may be ignored'
              : 'Maps to the provider’s reasoning effort setting'
        }
      >
        Effort
        <select
          className="field select"
          value={support === false ? 'na' : player.effort}
          disabled={locked || support === false}
          onChange={(e) => onChange({ effort: e.target.value as Effort })}
        >
          {support === false && <option value="na">N/A</option>}
          {EFFORTS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

/** Model display name from the cached list, falling back to the ID. */
export function useModelName(player: PlayerConfig, credentials: Credentials) {
  const { models } = useModels(player.providerId, credentials)
  return models.find((m) => m.id === player.modelId)?.name ?? player.modelId
}
