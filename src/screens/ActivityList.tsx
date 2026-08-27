import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { fmtTime } from '../lib/domain'
import type { ActivityEntity, Edit, Job } from '../lib/types'
import { inputCls } from '../ui/atoms'

type Filter = 'all' | 'span' | 'pass' | 'robot' | 'street'
const FILTERS: [Filter, string][] = [['all', 'All'], ['pass', 'Passes'], ['span', 'Spans'], ['street', 'Streets & poles'], ['robot', 'Robots']]
const dayStart = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime() }
const dayLabel = (ms: number) => {
  const today = dayStart(Date.now())
  if (ms === today) return 'Today'
  if (ms === today - 86_400_000) return 'Yesterday'
  return new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}
const matches = (e: Edit, f: Filter) =>
  f === 'all' ? true : f === 'street' ? e.entity === 'run' || e.entity === 'pole' : e.entity === f

const DOT: Record<ActivityEntity, string> = { pass: 'bg-teal-600', span: 'bg-amber-500', run: 'bg-violet-500', pole: 'bg-violet-300', robot: 'bg-orange-600', job: 'bg-stone-400' }

/** Everything anyone did, newest first: streets, poles, spans, passes, robots, settings. Rendered at the bottom of Stats. */
export default function ActivityList({ job }: { job: Job }) {
  const edits = useLiveQuery(() => db.edits.where('job_id').equals(job.id).toArray(), [job.id]) ?? []
  const [filter, setFilter] = useState<Filter>('all')
  const [who, setWho] = useState('all')
  const [limit, setLimit] = useState(100)
  const people = useMemo(() => Array.from(new Set(edits.map((e) => e.who).filter(Boolean))).sort(), [edits])
  const rows = useMemo(
    () => edits.filter((e) => matches(e, filter) && (who === 'all' || e.who === who)).sort((a, b) => b.created_at - a.created_at),
    [edits, filter, who],
  )
  const groups = useMemo(() => {
    const out: { day: number; items: Edit[] }[] = []
    rows.slice(0, limit).forEach((e) => {
      const day = dayStart(e.created_at)
      const g = out[out.length - 1]
      if (g && g.day === day) g.items.push(e)
      else out.push({ day, items: [e] })
    })
    return out
  }, [rows, limit])

  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-wide text-stone-500">Activity <span className="normal-case tracking-normal text-stone-400">· {rows.length} entr{rows.length === 1 ? 'y' : 'ies'}</span></div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([k, label]) => (
          <button type="button" key={k} onClick={() => setFilter(k)} className={`h-9 px-3 rounded-full text-sm font-semibold whitespace-nowrap border ${filter === k ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-300 text-stone-700'}`}>{label}</button>
        ))}
      </div>
      {people.length > 1 && (
        <select value={who} onChange={(e) => setWho(e.target.value)} className={inputCls} aria-label="Person">
          <option value="all">Everyone</option>
          {people.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      )}

      {groups.length === 0 && (
        <div className="bg-white border border-stone-200 rounded-md p-3 text-sm text-stone-500">Nothing logged yet. Every street, pole, span, pass, and robot change shows up here with who did it.</div>
      )}
      {groups.map(({ day, items }) => (
        <div key={day}>
          <div className="text-xs uppercase tracking-wide text-stone-500 mb-1">{dayLabel(day)} <span className="normal-case tracking-normal text-stone-400">· {items.length}</span></div>
          <div className="bg-white border border-stone-200 rounded-md divide-y divide-stone-100">
            {items.map((e) => (
              <div key={e.id} className="px-3 py-2 flex gap-3">
                <div className="pt-1.5"><span className={`block h-2.5 w-2.5 rounded-full ${DOT[e.entity] ?? 'bg-stone-400'}`} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm"><span className="font-semibold">{e.who || 'Unnamed'}</span> <span className="text-stone-500">{fmtTime(e.created_at)}</span></div>
                  <div className="text-sm">{e.summary}{e.reason ? <span className="text-stone-500"> · {e.reason}</span> : null}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {rows.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + 100)} className="w-full h-11 rounded-md border border-stone-300 bg-white text-sm font-semibold">Show older entries</button>
      )}
    </div>
  )
}
