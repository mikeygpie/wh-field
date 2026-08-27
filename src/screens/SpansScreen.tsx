import { useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Clock, GripVertical, ChevronDown, ChevronRight, MoreHorizontal, Trash2 } from 'lucide-react'
import { doneWireFt, spanProgress, spanStatus, totalWireFt } from '../lib/domain'
import { fmtLen, useUnit } from '../lib/units'
import { deletePole, deleteRun, livePoles, liveRuns, liveSpans, lonePoles, movePole, moveSpan } from '../lib/repo'
import { db } from '../lib/db'
import type { Job, Pole, Run, Span } from '../lib/types'
import { BigButton, StatusChip, Tag } from '../ui/atoms'

const NONE = 'none' // bucket key for the Other section
const bySeq = (a: Span, b: Span) => a.seq - b.seq || a.created_at - b.created_at

// One color per street, by creation order, so sections read as separate blocks.
// Full class names are spelled out so Tailwind keeps them in the build.
const STREET_STYLES = [
  { stripe: 'border-sky-500', header: 'bg-sky-100 text-sky-900', body: 'bg-sky-50', over: 'bg-sky-200' },
  { stripe: 'border-violet-500', header: 'bg-violet-100 text-violet-900', body: 'bg-violet-50', over: 'bg-violet-200' },
  { stripe: 'border-emerald-500', header: 'bg-emerald-100 text-emerald-900', body: 'bg-emerald-50', over: 'bg-emerald-200' },
  { stripe: 'border-amber-500', header: 'bg-amber-100 text-amber-900', body: 'bg-amber-50', over: 'bg-amber-200' },
  { stripe: 'border-rose-500', header: 'bg-rose-100 text-rose-900', body: 'bg-rose-50', over: 'bg-rose-200' },
  { stripe: 'border-indigo-500', header: 'bg-indigo-100 text-indigo-900', body: 'bg-indigo-50', over: 'bg-indigo-200' },
  { stripe: 'border-lime-600', header: 'bg-lime-100 text-lime-900', body: 'bg-lime-50', over: 'bg-lime-200' },
  { stripe: 'border-cyan-500', header: 'bg-cyan-100 text-cyan-900', body: 'bg-cyan-50', over: 'bg-cyan-200' },
]
const OTHER_STYLE = { stripe: 'border-stone-400', header: 'bg-stone-200 text-stone-700', body: 'bg-stone-100', over: 'bg-stone-300' }

interface Drag {
  kind: 'span' | 'pole'
  id: string
  x: number
  y: number
  over: { bucket: string; index: number } | null
}

export interface SpansScreenProps {
  job: Job
  onOpen: (id: string) => void
  onAddStreet: () => void
  onRenameStreet: (run: Run) => void
  onAddSpan: (presetRunId?: string | null, presetPoleA?: string) => void
  onAddPole: (presetRunId?: string | null) => void
}

export default function SpansScreen({ job, onOpen, onAddStreet, onRenameStreet, onAddSpan, onAddPole }: SpansScreenProps) {
  const spans = useLiveQuery(() => liveSpans(job.id), [job.id]) ?? []
  const runs = useLiveQuery(() => liveRuns(job.id), [job.id]) ?? []
  const poles = useLiveQuery(() => livePoles(job.id), [job.id]) ?? []
  const passes = useLiveQuery(() => db.passes.where('job_id').equals(job.id).toArray(), [job.id]) ?? []
  const [drag, setDrag] = useState<Drag | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<string | null>(null)
  const unit = useUnit()

  const wireFt = doneWireFt(spans, passes)
  const totalFt = totalWireFt(spans)
  const done = spans.filter((s) => spanStatus(passes, s) === 'complete').length
  const lone = lonePoles(poles, spans)
  const buckets: { key: string; run: Run | null; list: Span[]; poles: Pole[]; style: typeof OTHER_STYLE }[] = [
    ...runs.slice().sort((a, b) => a.created_at - b.created_at).map((r, i) => ({
      key: r.id, run: r, list: spans.filter((s) => s.run_id === r.id).sort(bySeq), poles: lone.filter((p) => p.run_id === r.id), style: STREET_STYLES[i % STREET_STYLES.length],
    })),
    { key: NONE, run: null, list: spans.filter((s) => !s.run_id).sort(bySeq), poles: lone.filter((p) => !p.run_id), style: OTHER_STYLE },
  ]
  const dragSpan = drag?.kind === 'span' ? spans.find((s) => s.id === drag.id) : undefined
  const dragPole = drag?.kind === 'pole' ? poles.find((p) => p.id === drag.id) : undefined
  const dragHome = dragSpan ? dragSpan.run_id ?? NONE : dragPole ? dragPole.run_id ?? NONE : null

  const toggle = (key: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(key)) n.delete(key); else n.add(key); return n })

  // Pointer-based drag so it works with touch. The handle sets touch-action:
  // none. Spans drop into a slot between rows; poles drop into a section.
  const targetAt = (x: number, y: number, kind: Drag['kind'], id: string): Drag['over'] => {
    if (typeof document.elementFromPoint !== 'function') return null
    let bucketEl = document.elementFromPoint(x, y)?.closest('[data-bucket]') as HTMLElement | null
    if (!bucketEl) {
      // Between sections or past the last one: use the nearest section by vertical distance.
      let best: { el: HTMLElement; dist: number } | null = null
      document.querySelectorAll<HTMLElement>('[data-bucket]').forEach((el) => {
        const r = el.getBoundingClientRect()
        const dist = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
        if (!best || dist < best.dist) best = { el, dist }
      })
      if (!best || (best as { dist: number }).dist > 120) return null
      bucketEl = (best as { el: HTMLElement }).el
    }
    const bucket = bucketEl.dataset.bucket ?? NONE
    if (kind === 'pole') return { bucket, index: 0 }
    const rows = Array.from(bucketEl.querySelectorAll<HTMLElement>('[data-span-row]')).filter((r) => r.dataset.spanRow !== id)
    let index = rows.length
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect()
      if (y < r.top + r.height / 2) { index = i; break }
    }
    return { bucket, index }
  }
  const autoScroll = (y: number) => {
    const sc = document.querySelector<HTMLElement>('[data-scroll]')
    if (!sc) return
    const r = sc.getBoundingClientRect()
    if (y < r.top + 72) sc.scrollBy(0, -14)
    else if (y > r.bottom - 72) sc.scrollBy(0, 14)
  }
  const onDown = (e: ReactPointerEvent<HTMLDivElement>, kind: Drag['kind'], id: string) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ kind, id, x: e.clientX, y: e.clientY, over: null })
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return
    autoScroll(e.clientY)
    setDrag({ ...drag, x: e.clientX, y: e.clientY, over: targetAt(e.clientX, e.clientY, drag.kind, drag.id) })
  }
  const onUp = async () => {
    if (!drag) return
    const target = drag.over
    const d = drag
    setDrag(null)
    if (!target) return
    const run = target.bucket === NONE ? null : runs.find((r) => r.id === target.bucket) ?? null
    if (d.kind === 'pole') {
      const pole = poles.find((p) => p.id === d.id)
      if (pole && target.bucket !== (pole.run_id ?? NONE)) await movePole(pole, run)
      return
    }
    const span = spans.find((s) => s.id === d.id)
    if (!span) return
    if (target.bucket === (span.run_id ?? NONE)) {
      const list = buckets.find((b) => b.key === target.bucket)?.list ?? []
      if (list.findIndex((s) => s.id === span.id) === target.index) return
    }
    await moveSpan(span, run, target.index)
  }
  const handleProps = (kind: Drag['kind'], id: string, label: string) => ({
    role: 'button' as const, 'aria-label': label,
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => onDown(e, kind, id),
    onPointerMove: onMove,
    onPointerUp: () => void onUp(),
    onPointerCancel: () => setDrag(null),
    className: 'touch-none w-10 flex items-center justify-center text-stone-400 active:text-stone-700',
  })

  return (
    <div className={drag ? 'select-none' : ''} onClick={() => menu && setMenu(null)}>
      <div className="px-4 pt-4 pb-3 border-b border-stone-200 bg-white">
        <div className="flex items-baseline justify-between">
          <div className="text-2xl font-bold tracking-tight">
            {done} <span className="text-stone-400 text-base font-medium">of {spans.length} spans done</span>
          </div>
          <div className="text-sm text-stone-600">{fmtLen(wireFt, unit)} / {fmtLen(totalFt, unit)} of wire</div>
        </div>
        <div className="mt-2 h-2 rounded bg-stone-200 overflow-hidden">
          <div className="h-full bg-teal-600" style={{ width: `${Math.min(100, (wireFt / Math.max(1, totalFt)) * 100)}%` }} />
        </div>
      </div>

      {runs.length === 0 && (
        <div className="mx-2 mt-3 p-4 bg-white border border-stone-200 rounded-md text-sm text-stone-600">
          Add a street first, then poles and spans under it. Anything without a street goes under "Other".
        </div>
      )}

      {buckets.map(({ key, run, list, poles: lonePolesHere, style }) => {
        const over = drag?.over?.bucket === key
        const slot = over && drag?.kind === 'span' ? drag.over!.index : -1
        const isCollapsed = collapsed.has(key)
        const doneHere = list.filter((s) => spanStatus(passes, s) === 'complete').length
        const ftHere = totalWireFt(list)
        const ftDoneHere = doneWireFt(list, passes)
        const visibleCount = list.filter((s) => !(drag?.kind === 'span' && s.id === drag.id)).length
        const Slot = () => <div className="mx-4 h-0.5 rounded bg-teal-700 my-1" />
        let vi = 0 // index among rows other than the one being dragged
        return (
          <div key={key} data-bucket={key} className={`mx-2 mt-3 rounded-lg border-l-4 overflow-hidden ${style.stripe} ${over ? style.over : style.body}`}>
            <div className={`px-1 py-1 flex items-center gap-1 relative ${style.header}`}>
              <button type="button" onClick={() => toggle(key)} aria-label={isCollapsed ? 'Expand' : 'Collapse'} className="h-9 w-9 flex items-center justify-center">
                {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
              </button>
              <button type="button" onClick={() => toggle(key)} className="flex-1 min-w-0 text-left">
                <div className="text-sm font-bold tracking-tight truncate">
                  {run ? run.name : 'Other'}
                  {over && <span className="ml-2 text-xs font-semibold">{key === dragHome && drag?.kind === 'span' ? 'reorder' : 'drop here'}</span>}
                </div>
                <div className="text-xs opacity-80">{doneHere} of {list.length} span{list.length === 1 ? '' : 's'} done{lonePolesHere.length ? ` · ${lonePolesHere.length} pole${lonePolesHere.length === 1 ? '' : 's'}` : ''}</div>
              </button>
              <button type="button" onClick={() => onAddSpan(run ? run.id : null)} className="h-9 px-2 text-xs font-semibold flex items-center gap-0.5"><Plus size={14} /> span</button>
              <button type="button" onClick={() => onAddPole(run ? run.id : null)} className="h-9 px-2 text-xs font-semibold flex items-center gap-0.5"><Plus size={14} /> pole</button>
              {run && (
                <button type="button" aria-label={`Options for ${run.name}`} onClick={(e) => { e.stopPropagation(); setMenu(menu === key ? null : key) }} className="h-9 w-9 flex items-center justify-center"><MoreHorizontal size={18} /></button>
              )}
              {run && menu === key && (
                <div className="absolute right-2 top-11 bg-white border border-stone-200 rounded-md shadow-md z-10 w-56 text-sm text-stone-900" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="w-full text-left px-3 py-3 border-b border-stone-100" onClick={() => { setMenu(null); onRenameStreet(run) }}>Rename street</button>
                  <button type="button" className="w-full text-left px-3 py-3 text-red-700" onClick={() => {
                    setMenu(null)
                    const n = list.length + lonePolesHere.length
                    if (confirm(`Delete ${run.name}?${n ? ` Its ${list.length} span${list.length === 1 ? '' : 's'} and ${lonePolesHere.length} pole${lonePolesHere.length === 1 ? '' : 's'} move to "Other".` : ''}`)) void deleteRun(run)
                  }}>Delete street</button>
                </div>
              )}
            </div>

            {list.length > 0 && (
              <div className={`px-3 pb-2 ${style.header}`}>
                <div className="h-1.5 rounded bg-white/70 overflow-hidden">
                  <div className="h-full bg-teal-600" style={{ width: `${Math.min(100, (ftDoneHere / Math.max(1, ftHere)) * 100)}%` }} />
                </div>
                <div className="text-xs opacity-80 mt-1">{fmtLen(ftDoneHere, unit)} / {fmtLen(ftHere, unit)} of wire</div>
              </div>
            )}
            {!isCollapsed && (
              <div className="pb-2">
                {list.length === 0 && lonePolesHere.length === 0 && (
                  <div className={`mx-3 my-2 h-12 rounded-md border border-dashed flex items-center justify-center text-xs ${over ? 'border-teal-600 text-teal-900' : 'border-stone-300 text-stone-500'}`}>
                    {drag ? 'Drop to move here' : 'Nothing here yet'}
                  </div>
                )}
                {list.map((s) => {
                  const lifted = drag?.kind === 'span' && s.id === drag.id
                  const showSlotBefore = !lifted && slot === vi
                  if (!lifted) vi += 1
                  const st = spanStatus(passes, s)
                  const pr = spanProgress(passes, s)
                  const running = passes.some((p) => p.span_id === s.id && p.status === 'running')
                  return (
                    <div key={s.id}>
                      {showSlotBefore && <Slot />}
                      <div data-span-row={s.id} className={`flex items-stretch bg-white border-b border-stone-200 ${lifted ? 'opacity-40' : ''}`}>
                        <div {...handleProps('span', s.id, `Drag span ${s.pole_a} to ${s.pole_b}`)}><GripVertical size={18} /></div>
                        <button type="button" onClick={() => onOpen(s.id)} className="flex-1 text-left pr-4 py-3 flex items-center gap-3 active:bg-stone-100 min-w-0">
                          <div className="flex items-center gap-1 shrink-0">
                            <Tag>{s.pole_a}</Tag>
                            <span className="w-3 border-t border-stone-400" />
                            <Tag>{s.pole_b}</Tag>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-stone-600 truncate">
                              {s.length_ft != null
                                ? `${fmtLen((pr.total ? pr.done / pr.total : 0) * s.length_ft, unit)} / ${fmtLen(s.length_ft, unit)}`
                                : 'length not set'}
                            </div>
                            <div className="mt-1 h-1.5 rounded bg-stone-200 overflow-hidden">
                              <div className={`h-full ${st === 'complete' ? 'bg-teal-600' : 'bg-amber-500'}`} style={{ width: `${pr.total ? (pr.done / pr.total) * 100 : 0}%` }} />
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <StatusChip status={st} />
                            {running && (<span className="text-xs text-teal-700 flex items-center gap-1"><Clock size={12} /> running</span>)}
                          </div>
                        </button>
                      </div>
                    </div>
                  )
                })}
                {over && drag?.kind === 'span' && slot >= visibleCount && visibleCount > 0 && <Slot />}

                {lonePolesHere.length > 0 && (
                  <div className="px-4 pt-3 pb-1 text-xs uppercase tracking-wide text-stone-500">Poles with no span yet</div>
                )}
                {lonePolesHere.map((p) => {
                  const lifted = drag?.kind === 'pole' && p.id === drag.id
                  return (
                    <div key={p.id} className={`flex items-stretch bg-white border-b border-stone-200 ${lifted ? 'opacity-40' : ''}`}>
                      <div {...handleProps('pole', p.id, `Drag pole ${p.pole_id}`)}><GripVertical size={18} /></div>
                      <div className="flex-1 pr-2 py-2 flex items-center gap-3 min-w-0">
                        <Tag>{p.pole_id}</Tag>
                        <button type="button" onClick={() => onAddSpan(run ? run.id : null, p.pole_id)} className="h-8 px-2 rounded-md border border-stone-300 bg-white text-[11px] font-medium flex items-center gap-1"><Plus size={12} /> Create span</button>
                        <button type="button" aria-label={`Delete pole ${p.pole_id}`} onClick={() => { if (confirm(`Delete pole ${p.pole_id}?`)) void deletePole(p) }} className="ml-auto h-9 w-9 flex items-center justify-center text-stone-400 active:text-red-700"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      <div className="p-4 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <BigButton onClick={onAddStreet} tone="ghost" className="flex items-center justify-center gap-1 px-2 text-sm"><Plus size={16} /> Street</BigButton>
          <BigButton onClick={() => onAddSpan()} tone="ink" className="flex items-center justify-center gap-1 px-2 text-sm"><Plus size={16} /> Span</BigButton>
          <BigButton onClick={() => onAddPole()} tone="ghost" className="flex items-center justify-center gap-1 px-2 text-sm"><Plus size={16} /> Pole</BigButton>
        </div>
      </div>

      {drag && (dragSpan || dragPole) && (
        <div className="fixed z-30 pointer-events-none bg-white border border-stone-400 rounded-md shadow-lg px-3 py-2 flex items-center gap-1" style={{ left: drag.x + 14, top: drag.y - 22 }}>
          {dragSpan ? (<><Tag>{dragSpan.pole_a}</Tag><span className="w-3 border-t border-stone-400" /><Tag>{dragSpan.pole_b}</Tag></>) : <Tag>{dragPole!.pole_id}</Tag>}
        </div>
      )}
    </div>
  )
}
