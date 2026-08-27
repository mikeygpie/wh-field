import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft } from 'lucide-react'
import { db } from '../lib/db'
import { exportJob } from '../lib/csv'
import { runLengthFt, totalWireFt, wireDone, wrapWires } from '../lib/domain'
import { fmtLen, fmtLong, useUnit } from '../lib/units'
import { liveSpans } from '../lib/repo'
import type { Job, Pass, Span } from '../lib/types'
import { BigButton } from '../ui/atoms'

type Period = 'today' | 'week' | 'job' | 'day'
const DAY = 86_400_000

const dayStart = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime() }
const dayKey = (ms: number) => dayStart(ms)
const dayLabel = (ms: number) => new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

/** Everything the cards show, for passes that started in [from, to). Span completion counts on the day it finished. */
function computeStats(spans: Span[], passes: Pass[], from: number, to: number) {
  const inP = passes.filter((p) => p.start >= from && p.start < to)
  const finished = inP.filter((p) => p.status !== 'running')
  const byId = Object.fromEntries(spans.map((s) => [s.id, s]))
  const passFt = finished.reduce((s, p) => s + (byId[p.span_id] ? runLengthFt(byId[p.span_id], p.material) : 0) * (p.pct / 100), 0)
  const rolls = { silicone: inP.filter((p) => p.material === 'silicone').length, pvdf: inP.filter((p) => p.material === 'pvdf').length }
  const bad = finished.filter((p) => p.status !== 'complete')
  const reasons: Record<string, number> = {}
  bad.forEach((p) => { const k = p.reason || 'No reason'; reasons[k] = (reasons[k] || 0) + 1 })
  const avg = (m: 'silicone' | 'pvdf') => {
    const xs = finished.filter((p) => p.material === m && p.status === 'complete' && p.end)
    return xs.length ? Math.round(xs.reduce((s, p) => s + ((p.end as number) - p.start), 0) / xs.length / 60000) : null
  }
  let spansDone = 0
  let wireFt = 0
  spans.forEach((sp) => {
    const wires = wrapWires(sp)
    const doneWires = wires.filter((w) => wireDone(passes, sp, w.idx))
    if (!doneWires.length) return
    const ends = passes.filter((p) => p.span_id === sp.id && p.end).map((p) => p.end as number)
    const finishedAt = ends.length ? Math.max(...ends) : 0
    if (finishedAt >= from && finishedAt < to) {
      wireFt += doneWires.length * (sp.length_ft ?? 0)
      if (doneWires.length === wires.length) spansDone += 1
    }
  })
  return { spansDone, wireFt, passFt, spanPasses: finished.length, rolls, bad, reasons, avgSil: avg('silicone'), avgPv: avg('pvdf') }
}

export default function StatsScreen({ job }: { job: Job }) {
  const spans = useLiveQuery(() => liveSpans(job.id), [job.id]) ?? []
  const allPasses = useLiveQuery(() => db.passes.where('job_id').equals(job.id).toArray(), [job.id]) ?? []
  const [period, setPeriod] = useState<Period>('job')
  const [day, setDay] = useState<number | null>(null)
  const unit = useUnit()
  const liveIds = useMemo(() => new Set(spans.map((s) => s.id)), [spans])
  const passes = useMemo(() => allPasses.filter((p) => liveIds.has(p.span_id)), [allPasses, liveIds])

  // Days come from the data: any day a pass started or a span finished.
  const days = useMemo(() => {
    const keys = new Set<number>()
    passes.forEach((p) => { keys.add(dayKey(p.start)); if (p.end) keys.add(dayKey(p.end)) })
    return Array.from(keys).sort((a, b) => b - a)
  }, [passes])

  const range = useMemo((): [number, number] => {
    const today = dayStart(Date.now())
    if (period === 'today') return [today, today + DAY]
    if (period === 'week') return [today - 6 * DAY, today + DAY]
    if (period === 'day' && day != null) return [day, day + DAY]
    return [0, Number.MAX_SAFE_INTEGER]
  }, [period, day])

  const S = useMemo(() => computeStats(spans, passes, range[0], range[1]), [spans, passes, range])
  const perDay = useMemo(() => days.map((d) => ({ d, s: computeStats(spans, passes, d, d + DAY) })), [days, spans, passes])

  const Card = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
    <div className="bg-white border border-stone-200 rounded-md p-3">
      <div className="text-xs uppercase tracking-wide text-stone-500">{label}</div>
      <div className="text-2xl font-bold tracking-tight mt-1">{value}</div>
      {sub && <div className="text-xs text-stone-500 mt-0.5">{sub}</div>}
    </div>
  )

  const showDayList = period === 'day' && day == null

  return (
    <div className="p-4 space-y-3">
      <div className="flex bg-stone-200 rounded-md p-1">
        {([['today', 'Today'], ['week', 'Week'], ['job', 'Job'], ['day', 'By day']] as [Period, string][]).map(([k, l]) => (
          <button type="button" key={k} onClick={() => { setPeriod(k); setDay(null) }} className={`flex-1 h-10 rounded font-semibold text-sm ${period === k ? 'bg-white shadow-sm' : 'text-stone-600'}`}>{l}</button>
        ))}
      </div>

      {showDayList && (
        <div className="bg-white border border-stone-200 rounded-md divide-y divide-stone-100">
          {perDay.length === 0 && <div className="p-3 text-sm text-stone-500">No passes logged yet. Days appear here as work is logged.</div>}
          {perDay.map(({ d, s }) => (
            <button type="button" key={d} onClick={() => setDay(d)} className="w-full text-left px-3 py-3 active:bg-stone-100">
              <div className="flex items-baseline justify-between">
                <div className="font-semibold">{dayLabel(d)}</div>
                <div className="text-xs text-stone-500">{s.spanPasses} pass{s.spanPasses === 1 ? '' : 'es'} · {s.rolls.silicone} sil / {s.rolls.pvdf} pvdf rolls</div>
              </div>
              <div className="text-sm text-stone-600 mt-0.5">
                {s.spansDone} span{s.spansDone === 1 ? '' : 's'} done · {fmtLen(s.wireFt, unit)} of wire · {fmtLen(s.passFt, unit)} of passes{s.bad.length ? ` · ${s.bad.length} partial/failed` : ''}
              </div>
            </button>
          ))}
        </div>
      )}

      {!showDayList && (
        <>
          {period === 'day' && day != null && (
            <button type="button" onClick={() => setDay(null)} className="flex items-center gap-1 text-sm font-semibold text-stone-700"><ChevronLeft size={16} /> All days · {dayLabel(day)}</button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Card label="Spans completed" value={S.spansDone} />
            <Card label="Wire finished" value={fmtLen(S.wireFt, unit)} sub={`${fmtLong(S.wireFt, unit)}${period === 'job' ? ` · ${Math.round((S.wireFt / Math.max(1, totalWireFt(spans))) * 100)}% of ${fmtLen(totalWireFt(spans), unit)}` : ''}`} />
            <Card label="Pass length" value={fmtLen(S.passFt, unit)} sub="run length × % covered" />
            <Card label="Span-passes" value={S.spanPasses} />
            <Card label="Silicone rolls" value={S.rolls.silicone} sub="one per pass started" />
            <Card label="PVDF rolls" value={S.rolls.pvdf} sub="one per pass started" />
            <Card label="Avg silicone pass" value={S.avgSil == null ? '–' : `${S.avgSil} min`} sub="complete passes with end times" />
            <Card label="Avg PVDF pass" value={S.avgPv == null ? '–' : `${S.avgPv} min`} sub="complete passes with end times" />
          </div>
          <div className="bg-white border border-stone-200 rounded-md p-3">
            <div className="text-xs uppercase tracking-wide text-stone-500">Partial or failed passes</div>
            <div className="text-2xl font-bold tracking-tight mt-1">{S.bad.length}</div>
            {Object.entries(S.reasons).map(([r, n]) => (
              <div key={r} className="text-sm text-stone-600 flex justify-between"><span>{r}</span><span>{n}</span></div>
            ))}
          </div>
        </>
      )}

      <BigButton tone="ghost" className="w-full" onClick={() => void exportJob(job)}>Export CSV (spans, passes, edits)</BigButton>
    </div>
  )
}
