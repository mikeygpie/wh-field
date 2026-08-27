import { useState } from 'react'
import { upsertRobot } from '../lib/repo'
import type { Material, Robot } from '../lib/types'
import { BigButton, Field, Sheet, inputCls } from '../ui/atoms'

/** Add a robot, or edit one when `robot` is given. */
export default function RobotSheet({ robots, robot, onClose }: { robots: Robot[]; robot?: Robot; onClose: () => void }) {
  const [number, setNumber] = useState(robot ? String(robot.number) : '')
  const [name, setName] = useState(robot?.name ?? '')
  const [type, setType] = useState<Material>(robot?.type ?? 'silicone')
  const [active, setActive] = useState(robot?.active ?? true)
  const taken = !robot && number !== '' && robots.some((r) => r.number === Number(number))
  return (
    <Sheet title={robot ? `Edit robot #${robot.number}` : 'Add a robot'} onClose={onClose}>
      <Field label="Robot number">
        <input value={number} onChange={(e) => setNumber(e.target.value.replace(/[^0-9]/g, ''))} disabled={!!robot} placeholder="178" type="text" inputMode="numeric" pattern="[0-9]*" autoFocus={!robot} className={`${inputCls} font-mono`} aria-label="Robot number" />
        {taken && <div className="text-xs text-red-700 mt-1">#{number} is already on the list.</div>}
      </Field>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sparky" className={inputCls} aria-label="Robot name" />
      </Field>
      <Field label="Type">
        <div className="grid grid-cols-2 gap-2">
          {(['silicone', 'pvdf'] as Material[]).map((t) => (
            <button type="button" key={t} onClick={() => setType(t)} className={`h-12 rounded-md border font-semibold ${type === t ? (t === 'silicone' ? 'bg-teal-700 text-white border-teal-700' : 'bg-orange-700 text-white border-orange-700') : 'bg-white border-stone-300'}`}>
              {t === 'silicone' ? 'Silicone' : 'PVDF'}
            </button>
          ))}
        </div>
      </Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5" /> On the truck (shows in the robot picker)</label>
      <div className="flex gap-2 pt-1">
        <BigButton tone="ghost" onClick={onClose} className="flex-1">Cancel</BigButton>
        <BigButton tone="ink" disabled={number === '' || taken} className="flex-1" onClick={async () => {
          await upsertRobot({ number: Number(number), name: name.trim(), type, active })
          onClose()
        }}>
          {robot ? 'Save robot' : 'Add robot'}
        </BigButton>
      </div>
    </Sheet>
  )
}
