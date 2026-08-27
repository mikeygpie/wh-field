import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { normPole, samePair } from '../lib/db'
import { addSpan, jobDefaults, livePoles, liveRuns, liveSpans } from '../lib/repo'
import { UNIT_LABEL, toFt, useUnit } from '../lib/units'
import { SpanConfigFields } from '../ui/SpanFields'
import type { Job, LayerPlan, LengthSource, PresetKey, WireType } from '../lib/types'
import { BigButton, ErrorNote, Field, Note, Sheet, inputCls } from '../ui/atoms'
import { PolePicker } from '../ui/PolePicker'

const OTHER = 'other'

export default function AddSpanSheet({ job, presetRunId, presetPoleA, onClose, onOpen }: {
  job: Job
  presetRunId?: string | null // undefined = first street; null = Other
  presetPoleA?: string
  onClose: () => void
  onOpen: (id: string) => void
}) {
  const spans = useLiveQuery(() => liveSpans(job.id), [job.id]) ?? []
  const runs = useLiveQuery(() => liveRuns(job.id), [job.id]) ?? []
  const poles = useLiveQuery(() => livePoles(job.id), [job.id]) ?? []
  const sortedRuns = runs.slice().sort((a, b) => a.created_at - b.created_at)
  const [street, setStreet] = useState<string | null>(presetRunId === undefined ? null : presetRunId ?? OTHER)
  const [poleA, setPoleA] = useState(presetPoleA ?? '')
  const [poleB, setPoleB] = useState('')
  const defaults = jobDefaults(job)
  const unit = useUnit()
  const [f, setF] = useState({ length: '', length_source: 'range-finder' as LengthSource, landmark: '' })
  const [preset, setPreset] = useState<PresetKey>(job.wire_preset)
  const [layers, setLayers] = useState<LayerPlan>(defaults.layer_plan)
  const [wireType, setWireType] = useState<WireType>(defaults.wire_type)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const a = poleA.trim()
  const b = poleB.trim()
  const ready = a !== '' && b !== '' && a.toUpperCase().replace(/\s+/g, '') !== b.toUpperCase().replace(/\s+/g, '')
  const dup = ready ? spans.find((s) => samePair(s.pole_a, s.pole_b, a, b)) : undefined
  const chosen = street ?? sortedRuns[0]?.id ?? OTHER
  const chosenRun = runs.find((r) => r.id === chosen)

  // Recorded poles carry a street. Both poles must agree, and the span follows them.
  const findPole = (id: string) => (id ? poles.find((p) => normPole(p.pole_id) === normPole(id)) : undefined)
  const pa = findPole(a)
  const pb = findPole(b)
  const streetName = (id: string | null | undefined) => runs.find((r) => r.id === id)?.name ?? 'Other'
  const crossStreet = pa?.run_id && pb?.run_id && pa.run_id !== pb.run_id
  const implied = pa?.run_id ?? pb?.run_id ?? null
  useEffect(() => {
    if (!crossStreet && implied && chosen !== implied) setStreet(implied)
  }, [crossStreet, implied, chosen])

  return (
    <Sheet title="Add a span" onClose={onClose}>
      <Field label="Street">
        <select value={chosen} onChange={(e) => setStreet(e.target.value)} className={inputCls}>
          {sortedRuns.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          <option value={OTHER}>Other</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Pole A (left)"><PolePicker jobId={job.id} value={poleA} onChange={setPoleA} preferRunId={chosenRun?.id ?? null} /></Field>
        <Field label="Pole B (right)"><PolePicker jobId={job.id} value={poleB} onChange={setPoleB} preferRunId={chosenRun?.id ?? null} exclude={[a]} placeholder="6853 BV" /></Field>
      </div>
      {dup && <Note>This span is already in the job. Saving opens it.</Note>}
      {crossStreet && <ErrorNote>{a} is on {streetName(pa!.run_id)} and {b} is on {streetName(pb!.run_id)}. A span can't cross streets. Move one of the poles first.</ErrorNote>}
      {!crossStreet && implied && chosen === implied && (pa?.run_id ? pb && !pb.run_id : true) && (pa?.run_id || pb?.run_id) && (
        <div className="text-xs text-stone-500">Street follows the recorded pole{pa?.run_id && pb?.run_id ? 's' : ''}: {streetName(implied)}.</div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label={`Length (${UNIT_LABEL[unit]})`}><input type="number" inputMode="decimal" value={f.length} onChange={set('length')} className={inputCls} aria-label="Length" /></Field>
        <Field label="Measured with">
          <select value={f.length_source} onChange={set('length_source')} className={inputCls}>
            <option value="range-finder">Range-finder</option>
            <option value="google-maps">Google Maps</option>
            <option value="other">Other</option>
          </select>
        </Field>
      </div>
      <Field label="Mid-span landmark"><input value={f.landmark} onChange={set('landmark')} placeholder="Driveway R edge" className={inputCls} /></Field>
      <SpanConfigFields preset={preset} setPreset={setPreset} layers={layers} setLayers={setLayers} wireType={wireType} setWireType={setWireType} />
      <div className="flex gap-2 pt-1">
        <BigButton tone="ghost" onClick={onClose} className="flex-1">Cancel</BigButton>
        <BigButton tone="ink" disabled={!ready || !!crossStreet} className="flex-1" onClick={async () => {
          if (dup) { onOpen(dup.id); return }
          const { span } = await addSpan(job, {
            pole_a: a, pole_b: b, length_ft: f.length === '' ? null : Math.round(toFt(Number(f.length), unit) * 10) / 10, length_source: f.length === '' ? null : f.length_source,
            landmark: f.landmark, preset, layer_plan: layers, wire_type: wireType, run_id: chosen === OTHER ? null : chosen,
          })
          onOpen(span.id)
        }}>
          {dup ? 'Open span' : 'Save span'}
        </BigButton>
      </div>
    </Sheet>
  )
}
