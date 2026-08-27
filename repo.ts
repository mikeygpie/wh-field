import { db, now, uuid, samePair, normPole } from './db'
import { materialFor } from './domain'
import { whoAmI } from './operator'
import { DEFAULT_LAYER_PLAN, DEFAULT_PASS_MINUTES, DEFAULT_WIRE_TYPE, PRESETS } from './types'
import type {
  Edit, Job, LayerPlan, LengthSource, Pass, PassStatus, Pole, PresetKey, Robot, Run, Side, Span, Stamped, TableName, WireType,
} from './types'

// Every write goes through put(): it stamps updated_at, stores the row
// locally, and queues it for sync in the same transaction. Nothing waits on
// the network.
export async function put<T extends Stamped>(table: TableName, row: T): Promise<T> {
  const stamped = { ...row, updated_at: now() }
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    await db.table(table).put(stamped)
    await db.outbox.put({ id: uuid(), table, payload: stamped, created_at: now(), attempts: 0, last_error: null })
  })
  return stamped
}

const stamp = (): Stamped => ({ id: uuid(), created_at: now(), updated_at: now() })

/** Diff two records and store an immutable edit row when something changed. */
async function recordEdit(job_id: string, entity: Edit['entity'], before: Record<string, unknown>, after: Record<string, unknown>, who: string, reason: string) {
  const changes: Edit['changes'] = {}
  Object.keys(after).forEach((k) => {
    if (JSON.stringify(after[k]) !== JSON.stringify(before[k])) changes[k] = { old: before[k], new: after[k] }
  })
  if (Object.keys(changes).length === 0) return
  const edit: Edit = { ...stamp(), job_id, entity, entity_id: String(after.id), changes, who, reason }
  await put('edits', edit)
}

// ---------- jobs ----------
export async function updateJob(job: Job, changes: Partial<Job>) {
  return put('jobs', { ...job, ...changes })
}
/** Older local jobs may predate some defaults; read them with fallbacks. */
export const jobDefaults = (job: Job) => ({
  layer_plan: job.layer_plan ?? DEFAULT_LAYER_PLAN,
  wire_type: job.wire_type_default ?? DEFAULT_WIRE_TYPE,
  pass_minutes: job.default_pass_minutes ?? DEFAULT_PASS_MINUTES,
})

// ---------- streets (runs) ----------
export async function addRun(job_id: string, name: string) {
  return put<Run>('runs', { ...stamp(), job_id, name: name.trim(), deleted_at: null })
}

/** Rename a street; the denormalized street name on its spans follows. */
export async function renameRun(run: Run, name: string) {
  const updated = await put('runs', { ...run, name: name.trim() })
  const spans = await db.spans.where('run_id').equals(run.id).toArray()
  for (const s of spans) if (s.street !== updated.name) await put('spans', { ...s, street: updated.name })
  return updated
}

/** Delete a street. Its spans and poles move to Other. */
export async function deleteRun(run: Run, who?: string) {
  who ??= await whoAmI()
  const spans = await db.spans.where('run_id').equals(run.id).toArray()
  for (const s of spans) if (!s.deleted_at) await updateSpan(s, { run_id: null, street: '', seq: await nextSeq(s.job_id, null) }, who, `Street ${run.name} deleted`)
  const poles = await db.poles.where('run_id').equals(run.id).toArray()
  for (const p of poles) if (!p.deleted_at) await put('poles', { ...p, run_id: null })
  return put('runs', { ...run, deleted_at: now() })
}

// ---------- poles ----------
export const liveRuns = (job_id: string) => db.runs.where('job_id').equals(job_id).filter((r) => !r.deleted_at).toArray()
export const livePoles = (job_id: string) => db.poles.where('job_id').equals(job_id).filter((p) => !p.deleted_at).toArray()
export const liveSpans = (job_id: string) => db.spans.where('job_id').equals(job_id).filter((s) => !s.deleted_at).toArray()

/** Record a pole. Same ID (ignoring spaces and case) returns the existing record. */
export async function addPole(job: Job, pole_id: string, run_id: string | null): Promise<{ pole: Pole; existed: boolean }> {
  const id = pole_id.trim()
  const all = await db.poles.where('job_id').equals(job.id).toArray()
  const found = all.find((p) => normPole(p.pole_id) === normPole(id))
  if (found) {
    if (found.deleted_at) return { pole: await put('poles', { ...found, deleted_at: null, run_id }), existed: false }
    return { pole: found, existed: true }
  }
  return { pole: await put<Pole>('poles', { ...stamp(), job_id: job.id, run_id, pole_id: id, notes: '', deleted_at: null }), existed: false }
}

export async function movePole(pole: Pole, run: Run | null) {
  if ((pole.run_id ?? null) === (run?.id ?? null)) return pole
  return put('poles', { ...pole, run_id: run?.id ?? null })
}

export async function deletePole(pole: Pole) {
  return put('poles', { ...pole, deleted_at: now() })
}

/** Poles referenced by no live span. */
export function lonePoles(poles: Pole[], spans: Span[]): Pole[] {
  const used = new Set<string>()
  spans.filter((s) => !s.deleted_at).forEach((s) => { used.add(normPole(s.pole_a)); used.add(normPole(s.pole_b)) })
  return poles.filter((p) => !p.deleted_at && !used.has(normPole(p.pole_id)))
}

// ---------- spans ----------
export interface NewSpanInput {
  pole_a: string
  pole_b: string
  length_ft: number | null
  length_source: LengthSource | null
  landmark: string
  preset: PresetKey
  layer_plan?: LayerPlan // defaults to the job's
  wire_type?: WireType // defaults to the job's
  /** Street to file the span under; null = not on a recorded street. */
  run_id: string | null
}

const bucketSpans = (spans: Span[], run_id: string | null) =>
  spans.filter((s) => !s.deleted_at && (s.run_id ?? null) === run_id).sort((a, b) => a.seq - b.seq || a.created_at - b.created_at)

async function nextSeq(job_id: string, run_id: string | null) {
  const list = bucketSpans(await db.spans.where('job_id').equals(job_id).toArray(), run_id)
  return list.length ? list[list.length - 1].seq + 1 : 0
}

/** Returns the existing span if the pole pair is already in the job, otherwise the new one. Both poles get registered. */
export async function addSpan(job: Job, input: NewSpanInput): Promise<{ span: Span; existed: boolean }> {
  const spans = await liveSpans(job.id)
  const pole_a = input.pole_a.trim()
  const pole_b = input.pole_b.trim()
  const dup = spans.find((s) => samePair(s.pole_a, s.pole_b, pole_a, pole_b))
  if (dup) return { span: dup, existed: true }
  const run = input.run_id ? await db.runs.get(input.run_id) : undefined
  const run_id = run && !run.deleted_at ? run.id : null
  const span = await put<Span>('spans', {
    ...stamp(), job_id: job.id, run_id, seq: await nextSeq(job.id, run_id), street: run_id ? run!.name : '', pole_a, pole_b,
    length_ft: input.length_ft, length_source: input.length_source, landmark: input.landmark, road: 'bottom',
    preset: input.preset, wires: PRESETS[input.preset].wires, layer_plan: input.layer_plan ?? job.layer_plan ?? DEFAULT_LAYER_PLAN,
    wire_type: input.wire_type ?? job.wire_type_default ?? DEFAULT_WIRE_TYPE, notes: '', deleted_at: null,
  })
  for (const id of [pole_a, pole_b]) {
    const { pole } = await addPole(job, id, run_id)
    if (run_id && pole.run_id === null) await put('poles', { ...pole, run_id })
  }
  return { span, existed: false }
}

export async function updateSpan(span: Span, changes: Partial<Span>, who: string | undefined, reason: string) {
  who ??= await whoAmI()
  const next: Span = { ...span, ...changes }
  if (changes.preset && changes.preset !== span.preset) next.wires = PRESETS[changes.preset].wires
  await recordEdit(span.job_id, 'span', span as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>, who, reason)
  const saved = await put('spans', next)
  if (changes.pole_a || changes.pole_b) {
    const job = await db.jobs.get(span.job_id)
    if (job) {
      await addPole(job, saved.pole_a, saved.run_id)
      await addPole(job, saved.pole_b, saved.run_id)
    }
  }
  return saved
}

/** Swap Pole A and B. Half-segment sides on every pass flip with it. */
export async function reverseSpan(span: Span, who?: string) {
  who ??= await whoAmI()
  const passes = await db.passes.where('span_id').equals(span.id).toArray()
  for (const p of passes) {
    if (p.side === 'full') continue
    const flipped: Pass = { ...p, side: p.side === 'A' ? 'B' : 'A' }
    await recordEdit(span.job_id, 'pass', p as unknown as Record<string, unknown>, flipped as unknown as Record<string, unknown>, who, 'Span reversed')
    await put('passes', flipped)
  }
  return updateSpan(span, { pole_a: span.pole_b, pole_b: span.pole_a }, who, 'Span reversed (A and B swapped)')
}

/** Soft-delete a span. Its passes stay in the database and in exports; its poles show as "No span yet" again. */
export async function deleteSpan(span: Span, who: string | undefined, reason: string) {
  return updateSpan(span, { deleted_at: now() }, who, reason || 'Span deleted')
}

/**
 * Move a span to a street (or none) and a position in that bucket's order.
 * index undefined = end of the bucket. Everything is written in one
 * transaction so the list never shows a half-finished order.
 */
export async function moveSpan(span: Span, run: Run | null, index?: number, who?: string) {
  who ??= await whoAmI()
  return db.transaction('rw', [db.spans, db.poles, db.jobs, db.edits, db.outbox], async () => {
    let current = span
    const target_id = run?.id ?? null
    if ((span.run_id ?? null) !== target_id) {
      current = await updateSpan(span, { run_id: target_id, street: run?.name ?? '' }, who, run ? `Moved to ${run.name}` : 'Moved to Other')
      const job = await db.jobs.get(span.job_id)
      if (job) {
        for (const id of [span.pole_a, span.pole_b]) {
          const { pole } = await addPole(job, id, target_id)
          if ((pole.run_id ?? null) !== target_id) await put('poles', { ...pole, run_id: target_id })
        }
      }
    }
    const spans = await db.spans.where('job_id').equals(span.job_id).toArray()
    const list = bucketSpans(spans, target_id).filter((s) => s.id !== span.id)
    const at = index === undefined ? list.length : Math.max(0, Math.min(index, list.length))
    list.splice(at, 0, current)
    let moved = current
    for (let i = 0; i < list.length; i++) {
      if (list[i].seq !== i) {
        const saved = await put('spans', { ...list[i], seq: i })
        if (saved.id === span.id) moved = saved
      }
    }
    return moved
  })
}

/** File a span under a street (or none), at the end of that bucket. */
export const moveSpanToRun = (span: Span, run: Run | null, who?: string) => moveSpan(span, run, undefined, who)

// ---------- passes ----------
export async function startPass(job: Job, span: Span, wire_idx: number, side: Side, layer: number, robot: number, operator?: string) {
  operator ??= await whoAmI()
  return put<Pass>('passes', {
    ...stamp(), job_id: job.id, span_id: span.id, wire_idx, side, material: materialFor(side), layer, robot,
    start: now(), end: null, status: 'running', pct: 0, reason: '', operator, notes: '', source: 'live',
  })
}

export async function endPass(pass: Pass, status: PassStatus, pct: number, reason: string) {
  return put('passes', { ...pass, end: now(), status, pct: status === 'complete' ? 100 : pct, reason: status === 'complete' ? '' : reason })
}

export interface PastPassInput {
  wire_idx: number
  side: Side
  layer: number
  robot: number
  start: number
  end: number | null
  status: PassStatus
  pct: number
  reason: string
  operator: string
  notes: string
  source: 'paper' | 'csv'
}
export async function savePastPass(job: Job, span: Span, input: PastPassInput) {
  const operator = input.operator || (await whoAmI())
  return put<Pass>('passes', {
    ...stamp(), job_id: job.id, span_id: span.id, material: materialFor(input.side), ...input, operator,
    pct: input.status === 'complete' ? 100 : input.pct, reason: input.status === 'complete' ? '' : input.reason,
  })
}

export async function editPass(pass: Pass, changes: Partial<Pass>, who: string | undefined, reason: string) {
  who ??= await whoAmI()
  const next: Pass = { ...pass, ...changes }
  if (next.status === 'complete') next.pct = 100
  await recordEdit(pass.job_id, 'pass', pass as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>, who, reason)
  return put('passes', next)
}

// ---------- robots ----------
export const liveRobots = () => db.robots.filter((r) => !r.deleted_at).toArray()

// A robot's id is derived from its number, so every device creates the same
// row for #177 and sync merges them instead of colliding on the unique number.
export const robotId = (number: number) => `robot-${number}`

export async function upsertRobot(robot: Partial<Robot> & { number: number; type: Robot['type'] }) {
  const existing = (await db.robots.get(robotId(robot.number))) ?? (await db.robots.where('number').equals(robot.number).first())
  if (existing) return put('robots', { ...existing, ...robot, deleted_at: null })
  return put<Robot>('robots', { ...stamp(), id: robotId(robot.number), name: '', active: true, notes: '', deleted_at: null, ...robot })
}

/** Remove a robot from the list. Passes logged against its number are untouched. */
export async function deleteRobot(robot: Robot) {
  return put('robots', { ...robot, deleted_at: now() })
}

/** Wipe everything on this device. Data already synced stays in Supabase. */
export async function clearLocalData() {
  await db.delete()
  await db.open()
}
