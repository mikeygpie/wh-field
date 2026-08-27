import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { normPole } from '../lib/db'
import { livePoles, liveRuns } from '../lib/repo'
import type { Run } from '../lib/types'
import { inputCls } from './atoms'

const NEW = '__new__'

/**
 * Pick a recorded pole, or type a new ID. The chosen street's poles come
 * first, other streets follow, then poles not on a recorded street.
 */
export function PolePicker({ jobId, value, onChange, preferRunId, exclude = [], placeholder }: {
  jobId: string
  value: string
  onChange: (pole: string) => void
  preferRunId?: string | null
  exclude?: string[]
  placeholder?: string
}) {
  const runs = useLiveQuery(() => liveRuns(jobId), [jobId]) ?? []
  const poles = useLiveQuery(() => livePoles(jobId), [jobId]) ?? []
  const [typing, setTyping] = useState(false)
  const ordered: (Run | null)[] = [...runs.filter((r) => r.id === preferRunId), ...runs.filter((r) => r.id !== preferRunId).sort((a, b) => a.created_at - b.created_at), null]
  const excluded = new Set(exclude.map(normPole))
  const byRun = (run_id: string | null) => poles.filter((p) => (p.run_id ?? null) === run_id && !excluded.has(normPole(p.pole_id))).sort((a, b) => a.pole_id.localeCompare(b.pole_id))
  const matched = value.trim() ? poles.find((p) => normPole(p.pole_id) === normPole(value))?.pole_id : undefined
  const custom = typing || (value.trim() !== '' && matched === undefined)
  const selectValue = custom ? NEW : matched ?? ''

  return (
    <div className="space-y-2">
      <select
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === NEW) {
            setTyping(true)
            if (matched !== undefined) onChange('')
          } else {
            setTyping(false)
            onChange(e.target.value)
          }
        }}
        className={inputCls}
      >
        <option value="">{poles.length ? 'Choose a pole' : 'No poles recorded yet'}</option>
        {ordered.map((r) => {
          const opts = byRun(r?.id ?? null)
          return opts.length ? (
            <optgroup key={r?.id ?? 'none'} label={r ? r.name : 'Other'}>
              {opts.map((p) => <option key={p.id} value={p.pole_id}>{p.pole_id}</option>)}
            </optgroup>
          ) : null
        })}
        <option value={NEW}>Type a new pole ID</option>
      </select>
      {custom && (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? '6852 BV'} autoFocus className={`${inputCls} font-mono`} aria-label="New pole ID" />
      )}
    </div>
  )
}
