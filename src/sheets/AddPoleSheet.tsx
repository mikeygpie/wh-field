import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addPole, liveRuns } from '../lib/repo'
import type { Job } from '../lib/types'
import { BigButton, Field, Sheet, inputCls } from '../ui/atoms'

const OTHER = 'other'

export default function AddPoleSheet({ job, presetRunId, onClose }: { job: Job; presetRunId?: string | null; onClose: () => void }) {
  const runs = useLiveQuery(() => liveRuns(job.id), [job.id]) ?? []
  const sortedRuns = runs.slice().sort((a, b) => a.created_at - b.created_at)
  const [street, setStreet] = useState<string | null>(presetRunId === undefined ? null : presetRunId ?? OTHER)
  const [poleId, setPoleId] = useState('')
  const [note, setNote] = useState('')
  const chosen = street ?? sortedRuns[0]?.id ?? OTHER
  return (
    <Sheet title="Add a pole" onClose={onClose}>
      <Field label="Street">
        <select value={chosen} onChange={(e) => setStreet(e.target.value)} className={inputCls}>
          {sortedRuns.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          <option value={OTHER}>Other</option>
        </select>
      </Field>
      <Field label="Pole ID (as posted on the pole)">
        <input value={poleId} onChange={(e) => setPoleId(e.target.value)} placeholder="6852 BV" autoFocus className={`${inputCls} font-mono`} aria-label="Pole ID" />
      </Field>
      {note && <div className="text-sm text-stone-600">{note}</div>}
      <div className="flex gap-2 pt-1">
        <BigButton tone="ghost" onClick={onClose} className="flex-1">Cancel</BigButton>
        <BigButton tone="ink" disabled={!poleId.trim()} className="flex-1" onClick={async () => {
          const { existed } = await addPole(job, poleId, chosen === OTHER ? null : chosen)
          if (existed) { setNote(`${poleId.trim()} is already recorded.`); return }
          onClose()
        }}>
          Save pole
        </BigButton>
      </div>
    </Sheet>
  )
}
