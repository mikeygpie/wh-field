import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useNow } from '../App'
import { db } from '../lib/db'
import { fmtDate, fmtTime, isRunning, layerPct, minutesBetween, segLabel, spanStatus, statusText, wireTypeText } from '../lib/domain'
import { fmtLen, useUnit } from '../lib/units'
import { reverseSpan } from '../lib/repo'
import type { Job, Pass, Side, Span } from '../lib/types'
import { Pip, StatusChip, Tag } from '../ui/atoms'

export default function SpanScreen({ job, spanId, onBack, onLog, onOpenPass, onEdit }: {
  job: Job
  spanId: string
  onBack: () => void
  onLog: (w: number, side: Side) => void
  onOpenPass: (p: Pass) => void
  onEdit: () => void
}) {
  void job
  const span = useLiveQuery(() => db.spans.get(spanId), [spanId])
  const run = useLiveQuery(() => (span?.run_id ? db.runs.get(span.run_id).then((r) => (r && !r.deleted_at ? r : undefined)) : undefined), [span?.run_id])
  const passes = useLiveQuery(() => db.passes.where('span_id').equals(spanId).toArray(), [spanId]) ?? []
  const now = useNow()
  const unit = useUnit()
  const [menu, setMenu] = useState(false)
  if (!span) return <div className="p-4 text-stone-500">Span not found.</div>
  const st = spanStatus(passes, span)
  const wires = [...span.wires].sort((a, b) => (span.road === 'top' ? a.idx - b.idx : b.idx - a.idx))
  const list = passes.slice().sort((a, b) => b.start - a.start)
  const sil = Array.from({ length: span.layer_plan.silicone }, (_, i) => i + 1)
  const pv = Array.from({ length: span.layer_plan.pvdf }, (_, i) => i + 1)

  return (
    <div>
      <div className="px-2 h-12 flex items-center gap-1 bg-white border-b border-stone-200 relative">
        <button type="button" onClick={onBack} aria-label="Back" className="h-10 w-10 flex items-center justify-center"><ChevronLeft /></button>
        <div className="flex-1 text-sm font-semibold truncate">{run ? run.name : 'Other'}</div>
        <StatusChip status={st} />
        <button type="button" onClick={() => setMenu((m) => !m)} aria-label="More" className="h-10 w-10 flex items-center justify-center"><MoreHorizontal /></button>
        {menu && (
          <div className="absolute right-2 top-12 bg-white border border-stone-200 rounded-md shadow-md z-10 w-56 text-sm">
            <button type="button" className="w-full text-left px-3 py-3 border-b border-stone-100" onClick={() => { setMenu(false); onEdit() }}>Edit span details</button>
            <button type="button" className="w-full text-left px-3 py-3" onClick={() => { setMenu(false); void reverseSpan(span) }}>Swap Pole A and B</button>
          </div>
        )}
      </div>

      <div className="px-4 pt-4">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-stone-500">Pole A</div>
            <Tag className="text-base">{span.pole_a}</Tag>
          </div>
          <div className="text-center text-sm text-stone-600 pb-1">
            {span.length_ft != null ? fmtLen(span.length_ft, unit) : 'length not set'}
            {span.landmark ? (<><br /><span className="text-stone-500">mid-span: {span.landmark}</span></>) : null}
            <br /><span className="text-xs text-stone-500">{wireTypeText(span)} · {span.layer_plan.silicone} sil + {span.layer_plan.pvdf} PVDF</span>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-stone-500">Pole B</div>
            <Tag className="text-base">{span.pole_b}</Tag>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-stone-300 bg-white p-3">
          {span.road === 'top' && <Road />}
          {wires.map((wire) => {
            if (!wire.wrap) {
              return (
                <div key={wire.idx} className="my-2 h-10 rounded-md bg-stone-100 border border-dashed border-stone-300 flex items-center justify-center text-xs text-stone-500">
                  W{wire.idx} · {wire.role} · not wrapped
                </div>
              )
            }
            const w = wire.idx
            const half = (side: 'A' | 'B') => {
              const running = sil.some((L) => isRunning(passes, span.id, w, side, L))
              return (
                <button type="button" onClick={() => onLog(w, side)} aria-label={segLabel(span, w, side)}
                  className={`flex-1 h-12 rounded-md border flex flex-col items-center justify-center gap-1 active:bg-teal-50 ${running ? 'border-teal-600 bg-teal-50' : 'border-stone-300 bg-white'}`}>
                  <span className="flex gap-1">{sil.map((L) => <Pip key={L} tone="teal" pct={layerPct(passes, span.id, w, side, L)} running={isRunning(passes, span.id, w, side, L)} />)}</span>
                  <span className="text-xs text-stone-500">{side === 'A' ? 'L' : 'R'}{w}</span>
                </button>
              )
            }
            const pvRunning = pv.some((L) => isRunning(passes, span.id, w, 'full', L))
            return (
              <div key={w} className="my-2">
                <div className="flex items-center gap-2">
                  <span className="w-7 text-xs font-semibold text-stone-500">W{w}</span>
                  {half('A')}
                  <span className="w-px h-8 bg-stone-400" />
                  {half('B')}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-7" />
                  <button type="button" onClick={() => onLog(w, 'full')} aria-label={segLabel(span, w, 'full')}
                    className={`flex-1 h-9 rounded-md border flex items-center justify-center gap-2 active:bg-orange-50 ${pvRunning ? 'border-orange-600 bg-orange-50' : 'border-stone-300 bg-stone-50'}`}>
                    <span className="text-xs text-stone-500">PVDF</span>
                    <span className="flex gap-1">{pv.map((L) => <Pip key={L} tone="orange" pct={layerPct(passes, span.id, w, 'full', L)} running={isRunning(passes, span.id, w, 'full', L)} />)}</span>
                  </button>
                </div>
              </div>
            )
          })}
          {span.road === 'bottom' && <Road />}
          <div className="mt-2 flex gap-4 text-xs text-stone-500">
            <span className="flex items-center gap-1"><Pip tone="teal" pct={100} /> silicone layer</span>
            <span className="flex items-center gap-1"><Pip tone="orange" pct={100} /> PVDF layer</span>
            <span className="flex items-center gap-1"><Pip tone="teal" pct={60} /> partial</span>
          </div>
        </div>
        <p className="text-xs text-stone-500 mt-2">Tap a half to log silicone. Tap the PVDF bar to log a full-span PVDF pass.</p>
        {span.notes && <p className="text-xs text-stone-500 mt-1">Notes: {span.notes}</p>}
      </div>

      <div className="px-4 pt-5">
        <div className="text-xs uppercase tracking-wide text-stone-500 mb-2">Passes</div>
        {list.length === 0 && (
          <div className="text-sm text-stone-500 bg-white border border-stone-200 rounded-md p-3">No passes yet. Tap a half above to start one, or enter a past pass.</div>
        )}
        {list.map((p) => <PassRow key={p.id} p={p} span={span} now={now} onClick={() => onOpenPass(p)} />)}
      </div>
    </div>
  )
}

function Road() {
  return (
    <div className="relative h-6 rounded bg-stone-800">
      <div className="absolute left-3 right-3 top-1/2 border-t-2 border-dashed border-stone-200" />
      <span className="absolute left-3 top-0 h-6 flex items-center text-xs text-stone-300 font-semibold tracking-widest bg-stone-800 pr-1">ROAD</span>
    </div>
  )
}

function PassRow({ p, span, now, onClick }: { p: Pass; span: Span; now: number; onClick: () => void }) {
  const tone = p.material === 'silicone' ? 'teal' : 'orange'
  const dur = p.status === 'running' ? `${minutesBetween(p.start, now)} min so far` : p.end ? `${minutesBetween(p.start, p.end)} min` : 'end not recorded'
  return (
    <button type="button" onClick={onClick} className={`w-full text-left bg-white border rounded-md px-3 py-2 mb-2 flex items-center gap-3 ${p.status === 'running' ? 'border-teal-600' : 'border-stone-200'}`}>
      <Tag tone={tone}>#{p.robot}</Tag>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{segLabel(span, p.wire_idx, p.side)} · layer {p.layer}</div>
        <div className="text-xs text-stone-500">
          {fmtDate(p.start)} {fmtTime(p.start)}{p.end ? ` to ${fmtTime(p.end)}` : ''} · {dur}{p.source === 'paper' ? ' · from paper' : ''}
        </div>
      </div>
      <div className={`text-xs font-semibold text-right ${p.status === 'running' ? 'text-teal-700' : p.status === 'complete' ? 'text-stone-600' : 'text-amber-800'}`}>
        {statusText(p)}
        {p.reason ? <div className="font-normal text-stone-500">{p.reason}</div> : null}
      </div>
    </button>
  )
}
