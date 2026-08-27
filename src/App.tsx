import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { db } from './lib/db'
import { syncNow, useSyncStatus } from './lib/sync'
import { setOperatorName, useOperatorName } from './lib/operator'
import { BigButton, Field, inputCls } from './ui/atoms'
import type { Pass, Run } from './lib/types'
import SpansScreen from './screens/SpansScreen'
import SpanScreen from './screens/SpanScreen'
import StatsScreen from './screens/StatsScreen'
import FleetScreen from './screens/FleetScreen'
import SettingsScreen from './screens/SettingsScreen'
import LogSheet from './sheets/LogSheet'
import EndSheet from './sheets/EndSheet'
import EditPassSheet from './sheets/EditPassSheet'
import AddSpanSheet from './sheets/AddSpanSheet'
import EditSpanSheet from './sheets/EditSpanSheet'
import AddPoleSheet from './sheets/AddPoleSheet'
import StreetSheet from './sheets/StreetSheet'

export type Screen = { name: 'spans' } | { name: 'span'; id: string } | { name: 'fleet' } | { name: 'stats' } | { name: 'settings' }
type NavName = 'spans' | 'fleet' | 'stats' | 'settings'
export type SheetState =
  | { kind: 'log'; spanId: string; w: number; side: 'A' | 'B' | 'full' }
  | { kind: 'end'; passId: string }
  | { kind: 'editPass'; passId: string }
  | { kind: 'addSpan'; presetRunId?: string | null; presetPoleA?: string }
  | { kind: 'addPole'; presetRunId?: string | null }
  | { kind: 'street'; run?: Run }
  | { kind: 'editSpan'; spanId: string }

/** Ticks every 15 s so elapsed times on running passes stay current. */
export function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])
  return now
}

export default function App() {
  const job = useLiveQuery(() => db.jobs.orderBy('created_at').first())
  const name = useOperatorName()
  const [screen, setScreen] = useState<Screen>({ name: 'spans' })
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const close = () => setSheet(null)

  if (!job) return <div className="min-h-screen flex items-center justify-center text-stone-500">Loading…</div>

  const openPass = (p: Pass) => setSheet(p.status === 'running' ? { kind: 'end', passId: p.id } : { kind: 'editPass', passId: p.id })

  return (
    <div className="min-h-screen flex justify-center">
      <div className="w-full max-w-md min-h-screen bg-stone-50 flex flex-col relative">
        <TopBar title={job.name} subtitle={job.circuit} />
        <div className="flex-1 overflow-y-auto pb-24" data-scroll>
          {screen.name === 'spans' && (
            <SpansScreen
              job={job}
              onOpen={(id) => setScreen({ name: 'span', id })}
              onAddStreet={() => setSheet({ kind: 'street' })}
              onRenameStreet={(run) => setSheet({ kind: 'street', run })}
              onAddSpan={(presetRunId, presetPoleA) => setSheet({ kind: 'addSpan', presetRunId, presetPoleA })}
              onAddPole={(presetRunId) => setSheet({ kind: 'addPole', presetRunId })}
            />
          )}
          {screen.name === 'span' && (
            <SpanScreen
              job={job}
              spanId={screen.id}
              onBack={() => setScreen({ name: 'spans' })}
              onLog={(w, side) => setSheet({ kind: 'log', spanId: screen.id, w, side })}
              onOpenPass={openPass}
              onEdit={() => setSheet({ kind: 'editSpan', spanId: screen.id })}
            />
          )}
          {screen.name === 'fleet' && <FleetScreen job={job} />}
          {screen.name === 'stats' && <StatsScreen job={job} />}
          {screen.name === 'settings' && <SettingsScreen job={job} />}
        </div>
        <NavBar screen={screen.name} onNav={(name) => setScreen({ name } as Screen)} />

        {name.trim() === '' && <NameGate />}
        {sheet?.kind === 'log' && <LogSheet job={job} spanId={sheet.spanId} w={sheet.w} side={sheet.side} onClose={close} />}
        {sheet?.kind === 'end' && <EndSheet passId={sheet.passId} onClose={close} />}
        {sheet?.kind === 'editPass' && <EditPassSheet passId={sheet.passId} onClose={close} />}
        {sheet?.kind === 'addSpan' && <AddSpanSheet job={job} presetRunId={sheet.presetRunId} presetPoleA={sheet.presetPoleA} onClose={close} onOpen={(id) => { close(); setScreen({ name: 'span', id }) }} />}
        {sheet?.kind === 'addPole' && <AddPoleSheet job={job} presetRunId={sheet.presetRunId} onClose={close} />}
        {sheet?.kind === 'street' && <StreetSheet job={job} run={sheet.run} onClose={close} />}
        {sheet?.kind === 'editSpan' && <EditSpanSheet spanId={sheet.spanId} onClose={close} />}
      </div>
    </div>
  )
}

/** Every change is stamped with a name, so the app asks for one before anything else. */
function NameGate() {
  const [draft, setDraft] = useState('')
  const ok = draft.trim().length >= 2
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-6" style={{ background: 'rgba(28,25,23,0.85)' }}>
      <div className="w-full bg-white rounded-lg p-4 space-y-3">
        <div className="text-lg font-bold tracking-tight">Who's using this phone?</div>
        <p className="text-sm text-stone-600">Your first name goes on every pass, span, and change you make, so the crew can see who did what.</p>
        <Field label="First name">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus autoComplete="given-name" placeholder="e.g. Dana" className={inputCls} aria-label="First name" onKeyDown={(e) => { if (e.key === 'Enter' && ok) void setOperatorName(draft) }} />
        </Field>
        <BigButton tone="ink" className="w-full" disabled={!ok} onClick={() => void setOperatorName(draft)}>Continue</BigButton>
        <p className="text-xs text-stone-500">You can change it later under Settings.</p>
      </div>
    </div>
  )
}

function TopBar({ title, subtitle }: { title: string; subtitle: string }) {
  const s = useSyncStatus()
  let label = 'Local only'
  let cls = 'bg-stone-700 text-stone-200'
  if (s.configured) {
    if (!s.online) {
      label = `Offline · ${s.pending} queued`
      cls = 'bg-amber-700 text-amber-50'
    } else if (!s.signedIn) {
      label = 'Not signed in'
    } else if (s.error) {
      label = `Sync error · ${s.pending} queued`
      cls = 'bg-red-800 text-red-50'
    } else if (s.syncing) {
      label = 'Syncing…'
      cls = 'bg-teal-800 text-teal-100'
    } else {
      label = s.pending > 0 ? `${s.pending} queued` : 'Synced'
      cls = 'bg-teal-800 text-teal-100'
    }
  }
  return (
    <div className="flex items-center justify-between px-4 h-12 bg-stone-900 text-stone-50">
      <div className="text-sm font-semibold tracking-tight">
        {title} <span className="text-stone-400 font-normal">{subtitle}</span>
      </div>
      <button type="button" onClick={() => void syncNow()} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded ${cls}`}>
        {!s.online ? <WifiOff size={14} /> : s.syncing ? <RefreshCw size={14} className="animate-spin" /> : <Wifi size={14} />}
        {label}
      </button>
    </div>
  )
}

function NavBar({ screen, onNav }: { screen: Screen['name']; onNav: (name: NavName) => void }) {
  const items: [NavName, string][] = [['spans', 'Spans'], ['fleet', 'Fleet'], ['stats', 'Stats'], ['settings', 'Settings']]
  return (
    <div className="absolute bottom-0 left-0 right-0 h-16 bg-white border-t border-stone-200 flex z-10">
      {items.map(([k, label]) => {
        const active = screen === k || (k === 'spans' && screen === 'span')
        return (
          <button type="button" key={k} onClick={() => onNav(k)} className={`flex-1 text-sm font-semibold ${active ? 'text-stone-900 border-t-2 border-stone-900' : 'text-stone-400'}`}>
            {label}
          </button>
        )
      })}
    </div>
  )
}
