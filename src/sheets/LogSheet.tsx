import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { liveRobots } from '../lib/repo'
import { fmtDate, fmtTime, fromLocalInput, layerPct, layersFor, materialFor, nextLayer, segLabel, siliconeDone, toLocalInput } from '../lib/domain'
import { jobDefaults, savePastPass, startPass } from '../lib/repo'
import type { Job, Pass, PassStatus, Robot, Side, Span } from '../lib/types'
import { BigButton, Field, RobotChips, Sheet, StatusPicker, Tag, Warning, inputCls } from '../ui/atoms'


export default function LogSheet({ job, spanId, w, side, onClose }: { job: Job; spanId: string; w: number; side: Side; onClose: () => void }) {
  const span = useLiveQuery(() => db.spans.get(spanId), [spanId])
  const passes = useLiveQuery(() => db.passes.where('span_id').equals(spanId).toArray(), [spanId])
  const robots = useLiveQuery(() => liveRobots()) ?? []
  if (!span || !passes) return null
  return <LogForm job={job} span={span} passes={passes} robots={robots} w={w} side={side} onClose={onClose} />
}

function LogForm({ job, span, passes, robots, w, side, onClose }: {
  job: Job; span: Span; passes: Pass[]; robots: Robot[]; w: number; side: Side; onClose: () => void
}) {
  const material = materialFor(side)
  const suggested = nextLayer(passes, span, w, side)
  const [robot, setRobot] = useState<number | null>(null)
  const [layer, setLayer] = useState(suggested ?? 1)
  const [past, setPast] = useState(false)
  // Past passes default to start + 60 min (silicone) or + 120 min (PVDF). The
  // end follows the start until the crew edits the end themselves.
  const defaultMin = jobDefaults(job).pass_minutes[material]
  const [start, setStart] = useState(() => toLocalInput(Date.now()))
  const [end, setEnd] = useState(() => toLocalInput(Date.now() + defaultMin * 60000))
  const [endEdited, setEndEdited] = useState(false)
  const [endUnknown, setEndUnknown] = useState(false)
  const onStartChange = (v: string) => {
    setStart(v)
    if (endEdited) return
    const ms = fromLocalInput(v)
    if (!Number.isNaN(ms)) setEnd(toLocalInput(ms + defaultMin * 60000))
  }
  const onEndChange = (v: string) => {
    setEnd(v)
    setEndEdited(true)
  }
  const [status, setStatus] = useState<PassStatus>('complete')
  const [pct, setPct] = useState(50)
  const [reason, setReason] = useState('')

  const existing = passes.filter((p) => p.wire_idx === w && p.side === side).sort((a, b) => a.layer - b.layer || a.start - b.start)
  const runningOnWire = passes.filter((p) => p.wire_idx === w && p.status === 'running').length
  const robotBusy = robot != null && passes.some((p) => p.robot === robot && p.status === 'running')
  const warnings: string[] = []
  if (material === 'pvdf' && !siliconeDone(passes, span, w)) warnings.push(`Silicone isn't complete on both halves of W${w} yet.`)
  if (suggested && layer > suggested) warnings.push(`Layer ${suggested} isn't done. Logging layer ${layer} out of order.`)
  if (!past && runningOnWire >= 2) warnings.push(`Two robots are already running on W${w}.`)
  if (!past && robotBusy) warnings.push(`#${robot} is already running on another segment.`)
  const nLayers = layersFor(span, side)
  const startMs = fromLocalInput(start)
  const endMs = endUnknown ? null : fromLocalInput(end)
  const pastOk = !Number.isNaN(startMs) && (endUnknown || (!Number.isNaN(endMs as number) && (endMs as number) >= startMs))

  return (
    <Sheet title={segLabel(span, w, side)} onClose={onClose}>
      {existing.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-md divide-y divide-stone-100">
          {existing.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="w-14 text-stone-500">layer {p.layer}</span>
              <Tag tone={material === 'silicone' ? 'teal' : 'orange'}>#{p.robot}</Tag>
              <span className="flex-1 text-stone-600">{fmtDate(p.start)} {fmtTime(p.start)}{p.end ? ` to ${fmtTime(p.end)}` : ''}</span>
              <span className={`text-xs font-semibold ${p.status === 'complete' ? 'text-stone-600' : 'text-amber-800'}`}>
                {p.status === 'complete' ? 'done' : p.status === 'running' ? 'running' : `${p.status} ${p.pct}%`}
              </span>
            </div>
          ))}
        </div>
      )}

      <Field label={material === 'silicone' ? 'Robot (silicone robots on the truck)' : 'Robot (PVDF robots on the truck)'}>
        <RobotChips robots={robots} material={material} value={robot} onChange={setRobot} />
      </Field>

      <Field label="Layer">
        <div className="flex gap-2">
          {Array.from({ length: nLayers }, (_, i) => i + 1).map((L) => {
            const pctL = layerPct(passes, span.id, w, side, L)
            return (
              <button type="button" key={L} onClick={() => setLayer(L)} className={`h-11 flex-1 rounded-md border font-semibold ${layer === L ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-300'}`}>
                {L}{pctL >= 100 ? ' ✓' : pctL > 0 ? ` ${pctL}%` : ''}
              </button>
            )
          })}
        </div>
        {suggested ? <div className="text-xs text-stone-500 mt-1">Next up: layer {suggested}</div> : <div className="text-xs text-stone-500 mt-1">All layers on this segment are complete.</div>}
      </Field>

      {warnings.map((msg, i) => <Warning key={i}>{msg}</Warning>)}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} className="h-5 w-5" /> Enter a past pass
      </label>

      {past && (
        <div className="space-y-3 bg-white border border-stone-200 rounded-md p-3">
          <Field label="Start"><input type="datetime-local" aria-label="Start" value={start} onChange={(e) => onStartChange(e.target.value)} className={inputCls} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={endUnknown} onChange={(e) => setEndUnknown(e.target.checked)} className="h-5 w-5" /> End time not recorded</label>
          {!endUnknown && (
            <Field label={`End (defaults to ${defaultMin} min after start)`}>
              <input type="datetime-local" aria-label="End" value={end} onChange={(e) => onEndChange(e.target.value)} className={inputCls} />
            </Field>
          )}
          <StatusPicker status={status} setStatus={setStatus} pct={pct} setPct={setPct} reason={reason} setReason={setReason} />
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <BigButton tone="ghost" onClick={onClose} className="flex-1">Cancel</BigButton>
        {past ? (
          <BigButton tone="ink" disabled={!robot || !pastOk} className="flex-1" onClick={async () => {
            await savePastPass(job, span, { wire_idx: w, side, layer, robot: robot as number, start: startMs, end: endMs, status, pct, reason, operator: '', notes: endUnknown ? 'End time not recorded.' : '', source: 'paper' })
            onClose()
          }}>
            Save pass
          </BigButton>
        ) : (
          <BigButton tone={material === 'silicone' ? 'teal' : 'orange'} disabled={!robot} className="flex-1" onClick={async () => {
            await startPass(job, span, w, side, layer, robot as number, '')
            onClose()
          }}>
            Start pass
          </BigButton>
        )}
      </div>
    </Sheet>
  )
}
