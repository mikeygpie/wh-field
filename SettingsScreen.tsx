import { useState } from 'react'
import { setOperatorName, useOperatorName } from '../lib/operator'
import { clearLocalData, jobDefaults, updateJob } from '../lib/repo'
import { ensureSeed } from '../lib/seed'
import { anonymousAuth, signInWithPassword, signOut, syncNow, useSyncStatus } from '../lib/sync'
import { PRESETS } from '../lib/types'
import type { Job, PresetKey } from '../lib/types'
import { UNIT_LABEL, setUnit, useUnit } from '../lib/units'
import type { Unit } from '../lib/units'
import { BigButton, Eyebrow, Field, inputCls } from '../ui/atoms'
import { WireTypeFields } from '../ui/SpanFields'

export default function SettingsScreen({ job }: { job: Job }) {
  const [msg, setMsg] = useState('')
  return (
    <div className="p-4 space-y-5">
      <YouSection />
      <JobSection job={job} />
      <SyncSection />
      <AboutSection />
      <section>
        <Eyebrow>Data</Eyebrow>
        <div className="space-y-2">
          <BigButton tone="danger" className="w-full" onClick={async () => { if (confirm('Erase all data on this device? Synced data stays on the server.')) { await clearLocalData(); await ensureSeed(); setMsg('Local data cleared.') } }}>
            Clear local data
          </BigButton>
          {msg && <div className="text-sm text-stone-600">{msg}</div>}
        </div>
      </section>
    </div>
  )
}

/** Device-level preferences: who is logging from this phone, and the length unit. */
function YouSection() {
  const name = useOperatorName()
  const unit = useUnit()
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <section>
      <Eyebrow>This device</Eyebrow>
      <div className="bg-white border border-stone-200 rounded-md p-3 space-y-3">
        <Field label="Your name (recorded on every pass and edit from this phone)">
          <input value={draft ?? name} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (draft !== null) { void setOperatorName(draft); setDraft(null) } }} placeholder="First and last name" className={inputCls} aria-label="Your name" />
        </Field>
        <Field label="Length unit">
          <div className="flex bg-stone-200 rounded-md p-1">
            {(['ft', 'yd', 'm'] as Unit[]).map((u) => (
              <button type="button" key={u} onClick={() => void setUnit(u)} className={`flex-1 h-10 rounded font-semibold text-sm ${unit === u ? 'bg-white shadow-sm' : 'text-stone-600'}`}>
                {u === 'ft' ? 'Feet' : u === 'yd' ? 'Yards' : 'Meters'}
              </button>
            ))}
          </div>
          <div className="text-xs text-stone-500 mt-1">Lengths are entered and shown in {UNIT_LABEL[unit]} everywhere. Stored values don't change.</div>
        </Field>
      </div>
    </section>
  )
}

/** Job details and the defaults that pre-fill new spans and past passes. Synced to the crew. */
function JobSection({ job }: { job: Job }) {
  const d = jobDefaults(job)
  const [name, setName] = useState<string | null>(null)
  const [customer, setCustomer] = useState<string | null>(null)
  const num = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v) || 0))
  return (
    <section>
      <Eyebrow>Job details</Eyebrow>
      <div className="bg-white border border-stone-200 rounded-md p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Job name">
            <input value={name ?? job.name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name !== null) { void updateJob(job, { name: name.trim() || job.name }); setName(null) } }} className={inputCls} aria-label="Job name" />
          </Field>
          <Field label="Customer">
            <input value={customer ?? job.customer} onChange={(e) => setCustomer(e.target.value)} onBlur={() => { if (customer !== null) { void updateJob(job, { customer: customer.trim() }); setCustomer(null) } }} className={inputCls} aria-label="Customer" />
          </Field>
        </div>
        <Field label="Circuit type default (pre-selects Wires when adding a span)">
          <select value={job.wire_preset} onChange={(e) => void updateJob(job, { wire_preset: e.target.value as PresetKey })} className={inputCls} aria-label="Circuit type default">
            {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Layer default (pre-selects Layers when adding a span)">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-xs text-stone-500 mb-1">Silicone</span>
              <input type="number" inputMode="numeric" min={0} max={8} value={d.layer_plan.silicone} onChange={(e) => void updateJob(job, { layer_plan: { ...d.layer_plan, silicone: num(e.target.value, 0, 8) } })} className={inputCls} aria-label="Default silicone layers" />
            </label>
            <label className="block">
              <span className="block text-xs text-stone-500 mb-1">PVDF</span>
              <input type="number" inputMode="numeric" min={0} max={4} value={d.layer_plan.pvdf} onChange={(e) => void updateJob(job, { layer_plan: { ...d.layer_plan, pvdf: num(e.target.value, 0, 4) } })} className={inputCls} aria-label="Default PVDF layers" />
            </label>
          </div>
        </Field>
        <WireTypeFields label="Wire type default (pre-fills Wire type when adding a span)" value={d.wire_type} onChange={(w) => void updateJob(job, { wire_type_default: w })} />
        <Field label="Default pass minutes (past-pass end time = start + this)">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-xs text-stone-500 mb-1">Silicone</span>
              <input type="number" inputMode="numeric" min={1} max={600} value={d.pass_minutes.silicone} onChange={(e) => void updateJob(job, { default_pass_minutes: { ...d.pass_minutes, silicone: num(e.target.value, 1, 600) } })} className={inputCls} aria-label="Default silicone pass minutes" />
            </label>
            <label className="block">
              <span className="block text-xs text-stone-500 mb-1">PVDF</span>
              <input type="number" inputMode="numeric" min={1} max={600} value={d.pass_minutes.pvdf} onChange={(e) => void updateJob(job, { default_pass_minutes: { ...d.pass_minutes, pvdf: num(e.target.value, 1, 600) } })} className={inputCls} aria-label="Default PVDF pass minutes" />
            </label>
          </div>
        </Field>
        <p className="text-xs text-stone-500">Defaults only pre-fill new spans and past passes; spans already entered keep their own settings.</p>
      </div>
    </section>
  )
}

function AboutSection() {
  const [note, setNote] = useState('')
  const built = __BUILD_TIME__ === 'test' ? 'test build' : new Date(__BUILD_TIME__).toLocaleString()
  return (
    <section>
      <Eyebrow>App version</Eyebrow>
      <div className="bg-white border border-stone-200 rounded-md p-3 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-stone-600">Built</span><span className="font-medium">{built}</span></div>
        <p className="text-xs text-stone-500">If a change you expect isn't here, this device is showing a cached copy. The button below drops the cached app files (your data is kept) and loads the current version.</p>
        <BigButton tone="ghost" className="w-full" onClick={async () => {
          setNote('Loading the latest version…')
          try {
            // Drop every cached copy of the app shell so the next load comes from the server.
            const regs = (await navigator.serviceWorker?.getRegistrations()) ?? []
            for (const r of regs) await r.unregister()
            if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k)
          } catch { /* no service worker in dev */ }
          window.location.reload()
        }}>
          Load the latest version
        </BigButton>
        {note && <div className="text-stone-600">{note}</div>}
      </div>
    </section>
  )
}

function SyncSection() {
  const s = useSyncStatus()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  return (
    <section>
      <Eyebrow>Sync</Eyebrow>
      <div className="bg-white border border-stone-200 rounded-md p-3 space-y-2 text-sm">
        {!s.configured && <div className="text-stone-600">Not configured. This device keeps its own copy only. Add the Supabase keys to .env.local to enable sync.</div>}
        {s.configured && !s.signedIn && anonymousAuth && (
          <div className="text-stone-600">Connecting this device… {s.error && <span className="text-red-700">{s.error}</span>}</div>
        )}
        {s.configured && !s.signedIn && !anonymousAuth && (
          <div className="space-y-2">
            <div className="text-stone-600">Sign in with the email and password you were given.</div>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="username" className={inputCls} aria-label="Email" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" className={inputCls} aria-label="Password" />
            <BigButton tone="ink" className="w-full" disabled={busy || !email.includes('@') || password.length < 6} onClick={async () => {
              setBusy(true)
              setNote('')
              try { await signInWithPassword(email, password); setPassword('') } catch (e) { setNote(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
            }}>
              {busy ? 'Signing in…' : 'Sign in'}
            </BigButton>
          </div>
        )}
        {s.configured && s.signedIn && (
          <div className="space-y-2">
            <div className="flex justify-between"><span className="text-stone-600">{anonymousAuth ? 'Connected as' : 'Signed in as'}</span><span className="font-medium">{s.email}</span></div>
            <div className="flex justify-between"><span className="text-stone-600">Queued writes</span><span className="font-medium">{s.pending}</span></div>
            <div className="flex justify-between"><span className="text-stone-600">Last sync</span><span className="font-medium">{s.lastSync ? new Date(s.lastSync).toLocaleTimeString() : 'never'}</span></div>
            {s.error && <div className="text-red-700">{s.error}</div>}
            <div className="flex gap-2">
              <BigButton tone="ghost" className="flex-1" onClick={() => void syncNow()}>Sync now</BigButton>
              {!anonymousAuth && <BigButton tone="ghost" className="flex-1" onClick={() => void signOut()}>Sign out</BigButton>}
            </div>
          </div>
        )}
        {note && <div className="text-stone-600">{note}</div>}
      </div>
    </section>
  )
}
