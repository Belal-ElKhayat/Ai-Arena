import { PROVIDERS, PROVIDER_GROUPS } from '../providers/registry'

/** Provider dropdown grouped into gateway / direct / custom. */
export function ProviderSelect({
  value,
  disabled,
  onChange,
  id,
}: {
  value: string
  disabled?: boolean
  onChange: (id: string) => void
  id?: string
}) {
  return (
    <select id={id} className="field select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {PROVIDER_GROUPS.map((g) => {
        const list = PROVIDERS.filter((p) => (p.group ?? 'direct') === g.id)
        if (!list.length) return null
        return (
          <optgroup key={g.id} label={g.label}>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}
