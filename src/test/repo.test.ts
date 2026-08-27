import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { addPole, addRun, addSpan, deletePole, deleteRobot, deleteRun, deleteSpan, editPass, endPass, liveRobots, lonePoles, movePole, moveSpan, renameRun, reverseSpan, startPass, upsertRobot } from '../lib/repo'
import { ensureSeed, importPaperLogs } from '../lib/seed'
import { layerPct, nextLayer, spanProgress, spanStatus } from '../lib/domain'
import { passesCsv, spansCsv } from '../lib/csv'
import { fmtLen, fromFt, lenInput, toFt } from '../lib/units'
import { setOperatorName } from '../lib/operator'

const span = (pole_a: string, pole_b: string, run_id: string | null, length_ft: number | null = 150) =>
  ({ pole_a, pole_b, length_ft, length_source: 'other' as const, landmark: '', preset: 'two' as const, run_id })

async function reset() {
  await db.delete()
  await db.open()
  await ensureSeed()
}
const job = async () => (await db.jobs.toArray())[0]

describe('seed and paper log import', () => {
  beforeEach(reset)

  it('creates one job and the robot list on first run', async () => {
    expect(await db.jobs.count()).toBe(1)
    expect(await db.robots.count()).toBe(8)
    expect(await db.spans.count()).toBe(0)
  })

  it('imports the two paper logs once and registers their poles', async () => {
    const j = await job()
    expect(await importPaperLogs(j)).toBe(2)
    expect(await importPaperLogs(j)).toBe(0)
    expect(await db.spans.count()).toBe(2)
    expect(await db.passes.count()).toBe(25)
    expect((await db.poles.toArray()).map((p) => p.pole_id).sort()).toEqual(['4755', '6851 BV', '6852 BV', 'BV 12173'])
    const s5 = (await db.spans.toArray()).find((s) => s.pole_a === '4755')!
    const passes = await db.passes.where('span_id').equals(s5.id).toArray()
    expect(spanStatus(passes, s5)).toBe('complete')
  })
})

describe('streets, poles, and spans', () => {
  beforeEach(reset)

  it('dedupes spans by pole pair regardless of order and spacing', async () => {
    const j = await job()
    const a = await addSpan(j, span('6851 BV', '6852 BV', null, 147))
    const b = await addSpan(j, span('6852bv', '6851 bv', null, null))
    expect(a.existed).toBe(false)
    expect(b.existed).toBe(true)
    expect(b.span.id).toBe(a.span.id)
  })

  it('records poles once, shows them as lone until a span uses them, and lets them be deleted', async () => {
    const j = await job()
    const run = await addRun(j.id, 'Street A')
    const p1 = await addPole(j, '6851 BV', run.id)
    const again = await addPole(j, '6851bv', run.id)
    expect(again.existed).toBe(true)
    expect(again.pole.id).toBe(p1.pole.id)
    await addPole(j, '6852 BV', run.id)
    let lone = lonePoles(await db.poles.toArray(), await db.spans.toArray())
    expect(lone.map((p) => p.pole_id).sort()).toEqual(['6851 BV', '6852 BV'])
    const { span: s } = await addSpan(j, span('6851 BV', '6852 BV', run.id, 147))
    expect(s.run_id).toBe(run.id)
    expect(s.street).toBe('Street A')
    lone = lonePoles(await db.poles.toArray(), await db.spans.toArray())
    expect(lone).toHaveLength(0)
    // deleting the span frees the poles again; passes are kept
    await deleteSpan(s, 'lead', 'entered twice')
    lone = lonePoles(await db.poles.toArray(), await db.spans.toArray())
    expect(lone).toHaveLength(2)
    expect((await db.spans.get(s.id))!.deleted_at).not.toBeNull()
    await deletePole(lone[0])
    expect(lonePoles(await db.poles.toArray(), await db.spans.toArray())).toHaveLength(1)
  })

  it('moves poles and spans between streets and reorders spans within one', async () => {
    const j = await job()
    const a = await addRun(j.id, 'Street A')
    const b = await addRun(j.id, 'Street B')
    const pole = (await addPole(j, 'X9', a.id)).pole
    expect((await movePole(pole, b)).run_id).toBe(b.id)
    expect((await movePole((await db.poles.get(pole.id))!, null)).run_id).toBeNull()
    const s1 = (await addSpan(j, span('P1', 'P2', a.id))).span
    const s2 = (await addSpan(j, span('P2', 'P3', a.id))).span
    const s3 = (await addSpan(j, span('P3', 'P4', a.id))).span
    const order = async (run_id: string | null) =>
      (await db.spans.toArray()).filter((s) => (s.run_id ?? null) === run_id).sort((x, y) => x.seq - y.seq || x.created_at - y.created_at).map((s) => s.pole_a)
    expect(await order(a.id)).toEqual(['P1', 'P2', 'P3'])
    await moveSpan(s3, a, 0)
    expect(await order(a.id)).toEqual(['P3', 'P1', 'P2'])
    await moveSpan((await db.spans.get(s1.id))!, b, 0)
    expect(await order(a.id)).toEqual(['P3', 'P2'])
    expect(await order(b.id)).toEqual(['P1'])
    expect((await db.spans.get(s1.id))!.street).toBe('Street B')
    expect((await db.poles.toArray()).find((p) => p.pole_id === 'P1')!.run_id).toBe(b.id)
    void s2
  })

  it('renames a street and deletes one, moving its contents to Other', async () => {
    const j = await job()
    const a = await addRun(j.id, 'Stret A')
    const s = (await addSpan(j, span('P1', 'P2', a.id))).span
    await addPole(j, 'P9', a.id)
    const renamed = await renameRun(a, 'Street A')
    expect((await db.spans.get(s.id))!.street).toBe('Street A')
    await deleteRun(renamed)
    expect((await db.runs.get(a.id))!.deleted_at).not.toBeNull()
    expect((await db.spans.get(s.id))!.run_id).toBeNull()
    expect((await db.poles.toArray()).every((p) => p.run_id === null)).toBe(true)
  })

  it('reverses a span and flips half-segment sides with history', async () => {
    const j = await job()
    const { span: s } = await addSpan(j, span('A1', 'B1', null))
    const p = await startPass(j, s, 1, 'A', 1, 177, '')
    await endPass(p, 'complete', 100, '')
    await reverseSpan(s, 'tester')
    const after = (await db.spans.get(s.id))!
    expect(after.pole_a).toBe('B1')
    const pass = (await db.passes.get(p.id))!
    expect(pass.side).toBe('B')
    expect(await db.edits.count()).toBe(2)
  })
})

describe('units and operator', () => {
  beforeEach(reset)

  it('converts and formats lengths', () => {
    expect(fmtLen(147, 'ft')).toBe('147 ft')
    expect(fmtLen(150, 'yd')).toBe('50 yd')
    expect(fmtLen(150, 'm')).toBe('45.7 m')
    expect(toFt(50, 'yd')).toBe(150)
    expect(Math.round(fromFt(150, 'm') * 100) / 100).toBe(45.72)
    expect(lenInput(150, 'yd')).toBe('50')
    expect(lenInput(null, 'ft')).toBe('')
  })

  it('stamps passes and edits with the name set on this device', async () => {
    const j = await job()
    await setOperatorName('  Dana R. ')
    const { span: s } = await addSpan(j, span('P1', 'P2', null))
    const p = await startPass(j, s, 1, 'A', 1, 177)
    expect(p.operator).toBe('Dana R.')
    await editPass(p, { robot: 176 }, undefined, 'typo')
    expect((await db.edits.toArray())[0].who).toBe('Dana R.')
  })

  it('gives each span its own layer plan and wire type from the job defaults', async () => {
    const j = await job()
    const a = (await addSpan(j, span('P1', 'P2', null))).span
    expect(a.layer_plan).toEqual({ silicone: 4, pvdf: 2 })
    expect(a.wire_type.voltage).toBe('4 kV')
    const b = (await addSpan(j, { ...span('P3', 'P4', null), layer_plan: { silicone: 1, pvdf: 0 }, wire_type: { thickness: '1/0 (0.40 in)', voltage: '12 kV', material: 'AAC' } })).span
    expect(spanProgress([], b)).toEqual({ done: 0, total: 4 })
    // one silicone layer on each half of both wires completes the span
    for (const w of [1, 2]) for (const side of ['A', 'B'] as const) await endPass(await startPass(j, b, w, side, 1, 177), 'complete', 100, '')
    expect(spanStatus(await db.passes.toArray(), b)).toBe('complete')
  })
})

describe('robots', () => {
  beforeEach(reset)

  it('removes a robot from the list and brings it back on re-add', async () => {
    const r = (await liveRobots()).find((x) => x.number === 177)!
    await deleteRobot(r)
    expect((await liveRobots()).some((x) => x.number === 177)).toBe(false)
    await upsertRobot({ number: 177, type: 'silicone' })
    expect((await liveRobots()).some((x) => x.number === 177)).toBe(true)
    expect(await db.robots.count()).toBe(8)
  })
})

describe('passes', () => {
  beforeEach(reset)

  it('tracks layer completion, next layer, and status', async () => {
    const j = await job()
    const { span: s } = await addSpan(j, span('P1', 'P2', null))
    const p1 = await startPass(j, s, 1, 'A', 1, 177, '')
    let passes = await db.passes.toArray()
    expect(nextLayer(passes, s, 1, 'A')).toBe(2)
    expect(spanStatus(passes, s)).toBe('in progress')
    await endPass(p1, 'interrupted', 60, 'Battery')
    passes = await db.passes.toArray()
    expect(layerPct(passes, s.id, 1, 'A', 1)).toBe(60)
    expect(nextLayer(passes, s, 1, 'A')).toBe(1)
    const p2 = await startPass(j, s, 1, 'A', 1, 176, '')
    await endPass(p2, 'partial', 40, 'Tape out')
    passes = await db.passes.toArray()
    expect(layerPct(passes, s.id, 1, 'A', 1)).toBe(100)
    expect(nextLayer(passes, s, 1, 'A')).toBe(2)
    expect(spanProgress(passes, s)).toEqual({ done: 1, total: 20 })
  })

  it('records an edit with the changed fields', async () => {
    const j = await job()
    const { span: s } = await addSpan(j, span('P1', 'P2', null))
    const p = await startPass(j, s, 2, 'B', 1, 170, '')
    const done = await endPass(p, 'complete', 100, '')
    await editPass(done, { robot: 171 }, 'lead', 'typo')
    const edits = await db.edits.toArray()
    expect(edits).toHaveLength(1)
    expect(edits[0].changes).toEqual({ robot: { old: 170, new: 171 } })
    expect((await db.passes.get(p.id))!.robot).toBe(171)
  })

  it('queues every write in the outbox and exports CSV', async () => {
    const j = await job()
    const before = await db.outbox.count()
    const { span: s } = await addSpan(j, span('P1', 'P2', null))
    const p = await startPass(j, s, 1, 'A', 1, 177, '')
    await endPass(p, 'complete', 100, '')
    expect(await db.outbox.count()).toBe(before + 5) // span, two poles, pass start, pass end
    const spans = await db.spans.toArray()
    const passes = await db.passes.toArray()
    expect(spansCsv(spans, {}).split('\n')[0]).toContain('pole_a,pole_b')
    const csv = passesCsv(passes, spans)
    expect(csv.split('\n')).toHaveLength(2)
    expect(csv).toContain('W1-P1')
  })
})
