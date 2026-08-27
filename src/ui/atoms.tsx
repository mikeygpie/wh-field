import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { REASONS } from '../lib/types'
import type { Material, PassStatus, Robot } from '../lib/types'
import type { SpanStatus } from '../lib/domain'

export const inputCls = 'w-full h-11 px-3 rounded-md border border-stone-300 bg-white text-base'

export function Tag({ children, tone = 'ink', className = '' }: { children: ReactNode; tone?: 'ink' | 'teal' | 'orange' | 'stone'; className?: string }) {
  const tones = {
    ink: 'bg-stone-900 text-stone-50',
    teal: 'bg-teal-700 text-white',
    orange: 'bg-orange-700 text-white',
    stone: 'bg-stone-200 text-stone-800',
  }
  return <span className={`inline-block font-mono text-sm font-semibold px-2 py-0.5 rounded ${tones[tone]} ${className}`}>{children}</span>
}

export function StatusChip({ status }: { status: SpanStatus }) {
  const map: Record<SpanStatus, [string, string]> = {
    planned: ['Planned', 'bg-stone-100 text-stone-600'],
    'in progress': ['In progress', 'bg-amber-100 text-amber-900'],
    complete: ['Complete', 'bg-teal-100 text-teal-900'],
  }
  const [label, cls] = map[status]
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

/** One layer of one segment: filled by completion %, pulsing while a pass runs. */
export function Pip({ pct, running = false, tone }: { pct: number; running?: boolean; tone: 'teal' | 'orange' }) {
  const fill = tone === 'teal' ? 'bg-teal-600' : 'bg-orange-600'
  const track = tone === 'teal' ? 'bg-teal-50 border-teal-300' : 'bg-orange-50 border-orange-300'
  const run = tone === 'teal' ? 'border-teal-600' : 'border-orange-600'
  return (
    <span className={`relative inline-block h-3 w-5 rounded-sm border overflow-hidden ${track} ${running ? `border-2 animate-pulse ${run}` : ''}`}>
      <span className={`absolute left-0 top-0 h-full ${fill}`} style={{ width: `${pct}%` }} />
    </span>
  )
}

export function BigButton({ children, onClick, tone = 'ink', disabled, className = '' }: {
  children: ReactNode; onClick?: () => void; tone?: 'ink' | 'teal' | 'orange' | 'ghost' | 'danger'; disabled?: boolean; className?: string
}) {
  const tones = {
    ink: 'bg-stone-900 text-white',
    teal: 'bg-teal-700 text-white',
    orange: 'bg-orange-700 text-white',
    ghost: 'bg-white text-stone-900 border border-stone-300',
    danger: 'bg-white text-red-700 border border-red-300',
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`h-12 px-4 rounded-md font-semibold text-base disabled:opacity-40 ${tones[tone]} ${className}`}>
      {children}
    </button>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block">
      <span className="block text-xs uppercase tracking-wide text-stone-500 mb-1">{label}</span>
      {children}
    </div>
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="text-xs uppercase tracking-wide text-stone-500 mb-2">{children}</div>
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-end z-20" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="w-full bg-stone-50 rounded-t-2xl overflow-y-auto" style={{ maxHeight: '92%' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 h-12 border-b border-stone-200 bg-white rounded-t-2xl sticky top-0">
          <div className="font-semibold">{title}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-10 w-10 flex items-center justify-center">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 space-y-4 pb-8">{children}</div>
      </div>
    </div>
  )
}

export function RobotChips({ robots, material, value, onChange }: { robots: Robot[]; material: Material; value: number | null; onChange: (n: number) => void }) {
  const list = robots.filter((r) => r.active).sort((a, b) => a.number - b.number)
  if (list.length === 0) return <div className="text-sm text-stone-500">No robots marked as on the truck. Add them on the Settings screen.</div>
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((r) => {
        const ok = r.type === material
        const sel = value === r.number
        const selCls = r.type === 'silicone' ? 'bg-teal-700 text-white border-teal-700' : 'bg-orange-700 text-white border-orange-700'
        return (
          <button type="button" key={r.number} onClick={() => ok && onChange(r.number)} disabled={!ok}
            className={`h-11 px-3 rounded-md font-mono font-semibold border ${sel ? selCls : ok ? 'bg-white border-stone-300' : 'bg-stone-100 text-stone-400 border-stone-200'}`}>
            #{r.number}
            <span className="ml-1 text-xs font-sans font-normal">{r.type === 'silicone' ? 'sil' : 'pvdf'}{r.name ? ` · ${r.name}` : ''}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Any reason that isn't one of the preset chips is free text entered under "Other". */
const PRESET_REASONS: readonly string[] = REASONS.filter((r) => r !== 'Other')
const isOtherReason = (reason: string) => reason !== '' && !PRESET_REASONS.includes(reason)

export function StatusPicker({ status, setStatus, pct, setPct, reason, setReason, allowRunning = false }: {
  status: PassStatus; setStatus: (s: PassStatus) => void; pct: number; setPct: (n: number) => void; reason: string; setReason: (r: string) => void; allowRunning?: boolean
}) {
  const opts: [PassStatus, string][] = [['complete', 'Complete'], ['partial', 'Partial'], ['interrupted', 'Interrupted'], ['failed', 'Failed']]
  if (allowRunning) opts.unshift(['running', 'Running'])
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {opts.map(([k, label]) => (
          <button type="button" key={k} onClick={() => setStatus(k)}
            className={`h-12 rounded-md border font-semibold ${status === k ? (k === 'complete' ? 'bg-teal-700 text-white border-teal-700' : 'bg-amber-600 text-white border-amber-600') : 'bg-white border-stone-300'}`}>
            {label}
          </button>
        ))}
      </div>
      {status !== 'complete' && status !== 'running' && (
        <>
          <Field label={`How much of the run was covered: ${pct}%`}>
            <input type="range" min={0} max={95} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-full h-8" />
          </Field>
          <Field label="Reason">
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => {
                const selected = r === 'Other' ? isOtherReason(reason) : reason === r
                return (
                  <button type="button" key={r} onClick={() => setReason(r)} className={`h-10 px-3 rounded-md border text-sm font-medium ${selected ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-300'}`}>
                    {r}
                  </button>
                )
              })}
            </div>
            {isOtherReason(reason) && (
              <input value={reason === 'Other' ? '' : reason} onChange={(e) => setReason(e.target.value || 'Other')} placeholder="What happened?" autoFocus className={`${inputCls} mt-2`} aria-label="Other reason" />
            )}
          </Field>
        </>
      )}
    </div>
  )
}

export function Warning({ children }: { children: ReactNode }) {
  return <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2">{children}</div>
}
export function ErrorNote({ children }: { children: ReactNode }) {
  return <div role="alert" className="text-sm text-red-900 bg-red-50 border border-red-300 rounded-md p-2">{children}</div>
}
export function Note({ children }: { children: ReactNode }) {
  return <div className="text-sm text-teal-900 bg-teal-50 border border-teal-200 rounded-md p-2">{children}</div>
}
