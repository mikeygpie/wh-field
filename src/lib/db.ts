import Dexie, { type Table } from 'dexie'
import type { Edit, Job, MetaRow, OutboxItem, Pass, Pole, Robot, Run, Span, TableName } from './types'

// Local store. Every table that syncs is indexed on updated_at so pulls and
// exports can scan in order. The outbox holds writes waiting to reach Supabase.
export class WHDatabase extends Dexie {
  jobs!: Table<Job, string>
  runs!: Table<Run, string>
  poles!: Table<Pole, string>
  spans!: Table<Span, string>
  passes!: Table<Pass, string>
  robots!: Table<Robot, string>
  edits!: Table<Edit, string>
  outbox!: Table<OutboxItem, string>
  meta!: Table<MetaRow, string>

  constructor() {
    super('wh-field')
    this.version(1).stores({
      jobs: 'id, created_at, updated_at',
      runs: 'id, job_id, updated_at',
      spans: 'id, job_id, run_id, updated_at',
      passes: 'id, job_id, span_id, robot, start, status, updated_at',
      robots: 'id, number, updated_at',
      edits: 'id, job_id, entity_id, updated_at',
      outbox: 'id, created_at',
      meta: 'key',
    })
    // v2: poles become their own table; streets no longer carry a pole list.
    this.version(2).stores({
      poles: 'id, job_id, run_id, updated_at',
    })
    // v3: per-span layer plan and wire type; job-level defaults for both plus pass minutes.
    this.version(3).stores({}).upgrade(async (tx) => {
      await tx.table('jobs').toCollection().modify((j) => {
        j.wire_type_default ??= { thickness: '#2 (0.32 in)', voltage: '4 kV', material: 'ACSR' }
        j.default_pass_minutes ??= { silicone: 60, pvdf: 120 }
        j.layer_plan ??= { silicone: 4, pvdf: 2 }
      })
      const job = await tx.table('jobs').toCollection().first()
      await tx.table('spans').toCollection().modify((s) => {
        s.layer_plan ??= job?.layer_plan ?? { silicone: 4, pvdf: 2 }
        s.wire_type ??= job?.wire_type_default ?? { thickness: '#2 (0.32 in)', voltage: '4 kV', material: 'ACSR' }
      })
    })
    // v4: "three + neutral" folded into three-wire (the neutral row is dropped; passes are unaffected).
    this.version(4).stores({}).upgrade(async (tx) => {
      await tx.table('spans').toCollection().modify((s) => {
        if (s.preset === 'threeN') {
          s.preset = 'three'
          s.wires = (s.wires ?? []).filter((w: { role: string }) => w.role === 'phase')
        }
      })
      await tx.table('jobs').toCollection().modify((j) => { if (j.wire_preset === 'threeN') j.wire_preset = 'three' })
    })
    // v5: edits carry an action and a one-line summary (the activity log).
    this.version(5).stores({}).upgrade(async (tx) => {
      await tx.table('edits').toCollection().modify((e) => {
        e.action ??= 'update'
        e.summary ??= `Edited ${e.entity}: ${Object.keys(e.changes ?? {}).join(', ')}`
      })
    })
  }

  table_(name: TableName): Table<{ id: string; updated_at: number }, string> {
    return this.table(name)
  }
}

export const db = new WHDatabase()

export const now = () => Date.now()

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** Pole IDs are compared without spaces or case: "BV 12173" matches "bv12173". */
export const normPole = (s: string) => (s || '').toUpperCase().replace(/\s+/g, '')

export const samePair = (a1: string, b1: string, a2: string, b2: string) =>
  (normPole(a1) === normPole(a2) && normPole(b1) === normPole(b2)) ||
  (normPole(a1) === normPole(b2) && normPole(b1) === normPole(a2))

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row ? (row.value as T) : fallback
}
export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value })
}
