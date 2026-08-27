import { useSyncExternalStore } from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { db, getMeta, setMeta, now } from './db'
import { SYNC_TABLES } from './types'

// Sync is optional. Without VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY the app
// runs local-only and the Settings screen says so.
//
// Model: local writes land in Dexie and the outbox immediately. When online and
// signed in, the outbox is pushed in order (upsert by id), then every table is
// pulled incrementally by updated_at. Merge rule is last-write-wins on
// updated_at; passes and edits are effectively append-only, so conflicts are
// rare and confined to span details.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null
export const syncConfigured = supabase !== null
/** VITE_AUTH_MODE=anonymous signs every device in silently (no accounts). Anything else means email + password. */
export const anonymousAuth = (import.meta.env.VITE_AUTH_MODE as string | undefined) === 'anonymous'

export interface SyncStatus {
  configured: boolean
  online: boolean
  signedIn: boolean
  email: string | null
  pending: number
  syncing: boolean
  lastSync: number | null
  error: string | null
}

let status: SyncStatus = {
  configured: syncConfigured,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  signedIn: false,
  email: null,
  pending: 0,
  syncing: false,
  lastSync: null,
  error: null,
}
const listeners = new Set<() => void>()
function setStatus(partial: Partial<SyncStatus>) {
  status = { ...status, ...partial }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
const getSnapshot = () => status
export const useSyncStatus = () => useSyncExternalStore(subscribe, getSnapshot)

export async function refreshPending() {
  setStatus({ pending: await db.outbox.count() })
}

const PAGE = 500

/** Push queued writes in order. Stops at the first failure so order is preserved. */
export async function pushOutbox() {
  if (!supabase || !status.signedIn) return
  const items = await db.outbox.orderBy('created_at').toArray()
  for (const item of items) {
    const { error } = await supabase.from(item.table).upsert(item.payload)
    if (error) {
      // 23505 = unique violation: the server already has a row with this key
      // (a robot number from another device). Drop the item rather than block
      // everything queued behind it; the pull brings down the server's copy.
      if (error.code === '23505') {
        await db.outbox.delete(item.id)
        continue
      }
      await db.outbox.update(item.id, { attempts: item.attempts + 1, last_error: error.message })
      throw new Error(`${item.table}: ${error.message}`)
    }
    await db.outbox.delete(item.id)
  }
}

/** Pull rows changed since the last pull, table by table, newest wins. */
export async function pullChanges() {
  if (!supabase || !status.signedIn) return
  for (const table of SYNC_TABLES) {
    let since = await getMeta<number>(`pulled:${table}`, 0)
    for (;;) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .gt('updated_at', since)
        .order('updated_at', { ascending: true })
        .limit(PAGE)
      if (error) throw new Error(`${table}: ${error.message}`)
      if (!data || data.length === 0) break
      await db.transaction('rw', db.table(table), async () => {
        for (const row of data as Array<{ id: string; updated_at: number }>) {
          const local = await db.table_(table).get(row.id)
          if (!local || row.updated_at > local.updated_at) await db.table_(table).put(row)
        }
      })
      since = (data[data.length - 1] as { updated_at: number }).updated_at
      await setMeta(`pulled:${table}`, since)
      if (data.length < PAGE) break
    }
  }
}

let inFlight: Promise<void> | null = null
export function syncNow(): Promise<void> {
  if (!supabase || !status.online || !status.signedIn) return refreshPending()
  if (inFlight) return inFlight
  inFlight = (async () => {
    setStatus({ syncing: true, error: null })
    try {
      await pushOutbox()
      await pullChanges()
      setStatus({ lastSync: now(), error: null })
    } catch (e) {
      setStatus({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      await refreshPending()
      setStatus({ syncing: false })
      inFlight = null
    }
  })()
  return inFlight
}

let debounce: number | undefined
function scheduleSync(delayMs = 800) {
  if (typeof window === 'undefined') return
  window.clearTimeout(debounce)
  debounce = window.setTimeout(() => void syncNow(), delayMs)
}

/** Call once at startup. Wires up online/offline events, auth, and a periodic sync. */
export function startSync() {
  void refreshPending()
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      setStatus({ online: true })
      scheduleSync(200)
    })
    window.addEventListener('offline', () => setStatus({ online: false }))
    window.setInterval(() => void syncNow(), 30_000)
  }
  // Any new outbox row nudges a push shortly after.
  db.outbox.hook('creating', () => {
    scheduleSync()
    setTimeout(() => void refreshPending(), 0)
  })
  if (!supabase) return
  void supabase.auth.getSession().then(async ({ data }) => {
    let session = data.session
    if (!session && anonymousAuth) {
      // No accounts in this mode: each device gets its own anonymous user.
      // Requires "Allow anonymous sign-ins" in Supabase Auth settings.
      const { data: anon, error } = await supabase.auth.signInAnonymously()
      if (error) setStatus({ error: error.message })
      session = anon.session
    }
    setStatus({ signedIn: !!session, email: session?.user.email || (session ? 'this device' : null) })
    if (session) scheduleSync(200)
  })
  supabase.auth.onAuthStateChange((_event, session) => {
    setStatus({ signedIn: !!session, email: session?.user.email || (session ? 'this device' : null) })
    if (session) scheduleSync(200)
  })
}

// ---------- auth (email + password) ----------
// Users are created by an admin in Supabase (Authentication > Users > Add user)
// with a password. No sign-up emails, no links: a link would open in the
// browser rather than the home-screen app, and editing the email templates
// needs a custom mail server.
export async function signInWithPassword(email: string, password: string) {
  if (!supabase) throw new Error('Sync is not configured')
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
}
export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}
