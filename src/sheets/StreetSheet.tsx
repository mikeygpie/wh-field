import { useState } from 'react'
import { addRun, renameRun } from '../lib/repo'
import type { Job, Run } from '../lib/types'
import { BigButton, Field, Sheet, inputCls } from '../ui/atoms'

/** Add a street, or rename one when `run` is given. */
export default function StreetSheet({ job, run, onClose }: { job: Job; run?: Run; onClose: () => void }) {
  const [name, setName] = useState(run?.name ?? '')
  return (
    <Sheet title={run ? 'Rename street' : 'Add a street'} onClose={onClose}>
      <Field label="Street or line name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Maple Ln" autoFocus className={inputCls} aria-label="Street name" />
      </Field>
      <div className="flex gap-2 pt-1">
        <BigButton tone="ghost" onClick={onClose} className="flex-1">Cancel</BigButton>
        <BigButton tone="ink" disabled={!name.trim()} className="flex-1" onClick={async () => {
          if (run) await renameRun(run, name)
          else await addRun(job.id, name)
          onClose()
        }}>
          {run ? 'Save name' : 'Add street'}
        </BigButton>
      </div>
    </Sheet>
  )
}
