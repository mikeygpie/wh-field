import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { liveRobots } from '../lib/repo'
import { fmtDate, fmtTime, fromLocalInput, segLabel, toLocalInput } from '../lib/domain'
import { editPass } from '../lib/repo'
import type { Pass, PassStatus, Span } from '../lib/types'
import { BigButton, Field, RobotChips, Sheet, StatusPicker, inputCls } from '../ui/atoms'

export default function EditPassSheet({ passId, onClose }: { passId: string; onClose: () => void }) {
  const pass = useLiveQuery(() => db.passes.get(passId), [passId])
  const span = useLiveQuery(() => (pass ? db.spans.get(pass.span_id) : undefined), [pass?.span_id])
  if (!pass || !span) return null
  return <EditForm pass={pass} span={span} onClose={onClose} />
}

function EditForm({ pass, span, onClose }: { pass: Pass; span: Span; onClose: () => void }) {
  const robots = useLiveQuery(() => liveRobots()) ?? []
  const edits = useLiveQuery(() => db.edits.where('entity_id').equals(pass.id).toArray(), [pass.id]) ?? []
  const [robot, setRobot] = useState<number | null>(pass.robot)
  const [status, setStatus] = useState<PassStatus>(pass.status)
  const [pct, setPct] = useState(pass.pct || 50)
  const [reason, setReason] = useState(pass.reason)
  const [start, setStart] = useState(toLocalInput(pass.start))
  const [end, setEnd] = useState(pass.end ? toLocalInput(pass.end) : '')
  const [notes, setNotes] = useState(pass.notes)
  const [why, setWhy] = useState('')
  const startMs = fromLocalInput(start)
  const endMs = end ? fromLocalInput(end) : null
  const timesOk = !Number.isNaN(startMs) && (endMs == null || (!Number.isNaN(endMs) && endMs >= startMs))

  return (
    <Sheet title={`Edit pass · ${segLabel(span, pass.wire_idx, pass.side)}`} onClose={onClose}>
      <div className="text-sm text-stone-600">Layer {pass.layer} · logged {fmtDate(pass.created_at)} {fmtTime(pass.created_at)}{pass.source === 'paper' ? ' · from paper' : ''}</div>
      <Field label="Robot"><RobotChips robots={robots} material={pass.material} value={robot} onChange={setRobot} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start"><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} /></Field>
        <Field label="End (blank if unknown)"><input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} /></Field>
      </div>
      <StatusPicker status={status} setStatus={setStatus} pct={pct} setPct={setPct} reason={reason} setReason={setReason} allowRunning={pass.status === 'running'} />
      <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} /></Field>
      <Field label="Reason for the change (kept in history)">
        <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. wrong robot number on the sheet" className={inputCls} />
      </Field>
      {edits.length > 0 && (
        <div className="text-xs text-stone-500 space-y-1">
          <div className="uppercase tracking-wide">History</div>
          {edits.sort((a, b) => a.created_at - b.created_at).map((e) => (
            <div key={e.id}>
              {fmtDate(e.created_at)} {fmtTime(e.created_at)} · {e.who}: {Object.entries(e.changes).map(([k, v]) => `${k} ${String(v.old ?? 'blank')} to ${String(v.new ?? 'blank')}`).join('; ')} ({e.reason})
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <BigButton tone="ghost" onClick={onClose} className="flex-1">Cancel</BigButton>
        <BigButton tone="ink" disabled={!why.trim() || !robot || !timesOk} className="flex-1" onClick={async () => {
          await editPass(pass, { robot: robot as number, status, pct, reason: status === 'complete' ? '' : reason, start: startMs, end: endMs, notes }, undefined, why.trim())
          onClose()
        }}>
          Save changes
        </BigButton>
      </div>
    </Sheet>
  )
}
