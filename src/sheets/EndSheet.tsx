import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNow } from '../App'
import { db } from '../lib/db'
import { fmtTime, minutesBetween, segLabel } from '../lib/domain'
import { endPass } from '../lib/repo'
import type { PassStatus } from '../lib/types'
import { BigButton, Sheet, StatusPicker } from '../ui/atoms'

export default function EndSheet({ passId, onClose }: { passId: string; onClose: () => void }) {
  const pass = useLiveQuery(() => db.passes.get(passId), [passId])
  const span = useLiveQuery(() => (pass ? db.spans.get(pass.span_id) : undefined), [pass?.span_id])
  const now = useNow()
  const [status, setStatus] = useState<PassStatus>('complete')
  const [pct, setPct] = useState(50)
  const [reason, setReason] = useState('')
  if (!pass || !span) return null
  return (
    <Sheet title={`End pass · #${pass.robot}`} onClose={onClose}>
      <div className="text-sm text-stone-600">
        {segLabel(span, pass.wire_idx, pass.side)} · layer {pass.layer} · started {fmtTime(pass.start)} · {minutesBetween(pass.start, now)} min so far
      </div>
      <StatusPicker status={status} setStatus={setStatus} pct={pct} setPct={setPct} reason={reason} setReason={setReason} />
      <div className="flex gap-2 pt-1">
        <BigButton tone="ghost" onClick={onClose} className="flex-1">Keep running</BigButton>
        <BigButton tone="ink" disabled={status !== 'complete' && !reason} className="flex-1" onClick={async () => { await endPass(pass, status, pct, reason); onClose() }}>
          Save
        </BigButton>
      </div>
    </Sheet>
  )
}
