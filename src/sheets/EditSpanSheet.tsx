import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, normPole } from '../lib/db'
import { deleteSpan, livePoles, liveRuns, moveSpanToRun, updateSpan } from '../lib/repo'
import type { Job, LayerPlan, LengthSource, PresetKey, Run, Span, WireType } from '../lib/types'
import { UNIT_LABEL, lenInput, toFt, useUnit } from '../lib/units'
import { SpanConfigFields } from '../ui/SpanFields'
import { BigButton, ErrorNote, Field, Sheet, Warning, inputCls } from '../ui/atoms'
import { PolePicker } from '../ui/PolePicker'

const OTHER = 'other'

export default function EditSpanSheet({ spanId, onClose }: { spanId: string; onClose: () => void }) {
  const span = useLiveQuery(() => db.spans.get(spanId), [spanId])
  const job = useLiveQuery(() => (span ? db.jobs.get(span.job_id) : undefined), [span?.job_id])
  const runs = useLiveQuery(() => (span ? liveRuns(span.job_id) : []), [span?.job_id])
  if (!span || !runs || !job) return null
  return <EditForm job={job} span={span} runs={runs} onClose={onClose} />
}

function EditForm({ job, span, runs, onClose }: { job: Job; span: Span; runs: Run[]; onClose: () => void }) {
  const passCount = useLiveQuery(() => db.passes.where('span_id').equals(span.id).count(), [span.id]) ?? 0
  const poles = useLiveQuery(() => livePoles(job.id), [job.id]) ?? []
  const [poleA, setPoleA] = useState(span.pole_a)
  const [poleB, setPoleB] = useState(span.pole_b)
  const unit = useUnit()
  const [f, setF] = useState({
    length: lenInput(span.length_ft, unit), length_source: span.length_source ?? 'range-finder',
    landmark: span.landmark, notes: span.notes,
  })
  const [preset, setPreset] = useState<PresetKey>(span.preset)
  const [layers, setLayers] = useState<LayerPlan>(span.layer_plan)
  const [wireType, setWireType] = useState<WireType>(span.wire_type)
  const [street, setStreet] = useState(span.run_id ?? OTHER)
  const [why, setWhy] = useState('')
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const targetRun = runs.find((r) => r.id === street) ?? null
  const streetChanged = street !== (span.run_id ?? OTHER)
  const a = poleA.trim()
  const b = poleB.trim()
  const lengthNum = f.length === '' ? null : Math.round(toFt(Number(f.length), unit) * 10) / 10
  const [confirmDelete, setConfirmDelete] = useState(false)
  const findPole = (id: string) => (id ? poles.find((p) => normPole(p.pole_id) === normPole(id)) : undefined)
  const pa = findPole(a)
  const pb = findPole(b)
  const streetName = (id: string | null | undefined) => runs.find((r) => r.id === id)?.name ?? 'Other'
  const crossStreet = pa?.run_id && pb?.run_id && pa.run_id !== pb.run_id
  const implied = pa?.run_id ?? pb?.run_id ?? null
  const streetMismatch = !crossStreet && implied && (targetRun?.id ?? null) !== implied

  return (
    <Sheet title="Edit span details" onClose={onClose}>
      <Field label="Street">
        <select value={street} onChange={(e) => setStreet(e.target.value)} className={inputCls}>
          {runs.slice().sort((x, y) => x.created_at - y.created_at).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          <option value={OTHER}>Other</option>
        </select>
        {streetChanged && targetRun && <div className="text-xs text-stone-500 mt-1">Moves this span to {targetRun.name}. Its poles are added to that street if they aren't on it yet.</div>}
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Pole A (left)"><PolePicker jobId={job.id} value={poleA} onChange={setPoleA} preferRunId={targetRun?.id ?? null} /></Field>
        <Field label="Pole B (right)"><PolePicker jobId={job.id} value={poleB} onChange={setPoleB} preferRunId={targetRun?.id ?? null} /></Field>
      </div>
      {crossStreet && <ErrorNote>{a} is on {streetName(pa!.run_id)} and {b} is on {streetName(pb!.run_id)}. A span can't cross streets. Move one of the poles first.</ErrorNote>}
      {streetMismatch && <ErrorNote>{pa?.run_id ? a : b} is on {streetName(implied)}. Choose that street, or move the pole first.</ErrorNote>}
      <div className="grid grid-cols-2 gap-2">
        <Field label={`Length (${UNIT_LABEL[unit]})`}><input type="number" inputMode="decimal" value={f.length} onChange={set('length')} className={inputCls} aria-label="Length" /></Field>
        <Field label="Measured with">
          <select value={f.length_source} onChange={set('length_source')} className={inputCls}>
            <option value="range-finder">Range-finder</option><option value="google-maps">Google Maps</option><option value="other">Other</option>
          </select>
        </Field>
      </div>
      <Field label="Mid-span landmark"><input value={f.landmark} onChange={set('landmark')} className={inputCls} /></Field>
      <SpanConfigFields preset={preset} setPreset={setPreset} layers={layers} setLayers={setLayers} wireType={wireType} setWireType={setWireType} />
      {preset !== span.preset && passCount > 0 && <Warning>Changing the wire configuration keeps the {passCount} logged passes but may leave some on wires that no longer exist.</Warning>}
      <Field label="Notes"><input value={f.notes} onChange={set('notes')} className={inputCls} /></Field>
      <Field label="Reason for the change (kept in history)"><input value={why} onChange={(e) => setWhy(e.target.value)} className={inputCls} /></Field>
      <div className="flex gap-2 pt-1">
        <BigButton tone="ghost" onClick={onClose} className="flex-1">Cancel</BigButton>
        <BigButton tone="ink" disabled={!why.trim() || !a || !b || !!crossStreet || !!streetMismatch} className="flex-1" onClick={async () => {
          const updated = await updateSpan(span, {
            pole_a: a, pole_b: b, length_ft: lengthNum, length_source: lengthNum == null ? null : (f.length_source as LengthSource),
            landmark: f.landmark, preset, layer_plan: layers, wire_type: wireType, notes: f.notes,
          }, undefined, why.trim())
          if (streetChanged) await moveSpanToRun(updated, targetRun)
          onClose()
        }}>
          Save changes
        </BigButton>
      </div>
      <div className="pt-2 border-t border-stone-200">
        {!confirmDelete ? (
          <BigButton tone="danger" className="w-full" onClick={() => setConfirmDelete(true)}>Delete this span</BigButton>
        ) : (
          <div className="space-y-2">
            <Warning>Delete {span.pole_a} to {span.pole_b}? Its {passCount} logged pass{passCount === 1 ? '' : 'es'} stay in the history and exports. Both poles show as "No span yet" again.</Warning>
            <div className="flex gap-2">
              <BigButton tone="ghost" className="flex-1" onClick={() => setConfirmDelete(false)}>Keep it</BigButton>
              <BigButton tone="danger" className="flex-1" onClick={async () => { await deleteSpan(span, undefined, why.trim() || 'Span deleted'); onClose() }}>Delete span</BigButton>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}
