import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { MoreHorizontal, Plus } from 'lucide-react'
import { db } from '../lib/db'
import { deleteRobot, liveRobots, upsertRobot } from '../lib/repo'
import type { Job, Robot } from '../lib/types'
import RobotSheet from '../sheets/RobotSheet'
import { BigButton, Eyebrow, Tag } from '../ui/atoms'

export default function FleetScreen({ job }: { job: Job }) {
  const robots = useLiveQuery(() => liveRobots()) ?? []
  const passes = useLiveQuery(() => db.passes.where('job_id').equals(job.id).toArray(), [job.id]) ?? []
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Robot | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const count = (num: number) => passes.filter((p) => p.robot === num).length
  const onTruck = robots.filter((r) => r.active).length

  return (
    <div className="p-4 space-y-4" onClick={() => menu && setMenu(null)}>
      <section>
        <Eyebrow>Robots · {onTruck} of {robots.length} on the truck</Eyebrow>
        <div className="bg-white border border-stone-200 rounded-md divide-y divide-stone-100">
          {robots.slice().sort((a, b) => a.number - b.number).map((r) => (
            <div key={r.id} className="px-3 py-2 flex items-center gap-3 relative">
              <Tag tone={r.type === 'silicone' ? 'teal' : 'orange'}>#{r.number}</Tag>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{r.name || <span className="text-stone-400 font-normal">no name</span>}</div>
                <div className="text-xs text-stone-500">{r.type === 'silicone' ? 'Silicone' : 'PVDF'} · {count(r.number)} pass{count(r.number) === 1 ? '' : 'es'}</div>
              </div>
              <label className="flex items-center gap-1 text-xs shrink-0">
                <input type="checkbox" checked={r.active} onChange={() => void upsertRobot({ number: r.number, type: r.type, active: !r.active })} className="h-5 w-5" /> on truck
              </label>
              <button type="button" aria-label={`Options for robot ${r.number}`} onClick={(e) => { e.stopPropagation(); setMenu(menu === r.id ? null : r.id) }} className="h-9 w-9 flex items-center justify-center text-stone-500 shrink-0">
                <MoreHorizontal size={18} />
              </button>
              {menu === r.id && (
                <div className="absolute right-2 top-11 bg-white border border-stone-200 rounded-md shadow-md z-10 w-48 text-sm" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="w-full text-left px-3 py-3 border-b border-stone-100" onClick={() => { setMenu(null); setEditing(r) }}>Edit robot</button>
                  <button type="button" className="w-full text-left px-3 py-3 text-red-700" onClick={() => {
                    setMenu(null)
                    const n = count(r.number)
                    if (confirm(`Remove #${r.number}${r.name ? ` (${r.name})` : ''} from the fleet?${n ? ` Its ${n} logged pass${n === 1 ? '' : 'es'} stay as they are.` : ''}`)) void deleteRobot(r)
                  }}>Delete robot</button>
                </div>
              )}
            </div>
          ))}
          {robots.length === 0 && <div className="px-3 py-3 text-sm text-stone-500">No robots yet.</div>}
        </div>
        <BigButton tone="ghost" className="w-full mt-2 flex items-center justify-center gap-2" onClick={() => setAdding(true)}><Plus size={18} /> Add a robot</BigButton>
        <p className="text-xs text-stone-500 mt-1">Only robots marked on the truck show in the pass picker. A robot's type fills in the material when a pass is logged; changing it later does not change passes already logged.</p>
      </section>

      {adding && <RobotSheet robots={robots} onClose={() => setAdding(false)} />}
      {editing && <RobotSheet robots={robots} robot={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
