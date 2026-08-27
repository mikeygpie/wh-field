import { db, samePair } from './db'
import { addSpan, savePastPass, upsertRobot, put } from './repo'
import { DEFAULT_LAYER_PLAN, DEFAULT_PASS_MINUTES, DEFAULT_WIRE_TYPE, PRESETS } from './types'
import type { Job, Side, Span } from './types'

// First run: one job and the robot list. Nothing else is created automatically,
// so real field data never mixes with samples unless the crew taps import.
export async function ensureSeed() {
  if ((await db.jobs.count()) > 0) return
  const t = Date.now()
  // Seed rows carry updated_at = 1 (see put below) so any real row from the
  // server, on any device, wins over them.
  await put<Job>('jobs', {
    id: 'job-bves-pilot', created_at: t, updated_at: t,
    name: 'BVES pilot', customer: 'Bear Valley Electric Service', circuit: 'Sugarloaf',
    layer_plan: DEFAULT_LAYER_PLAN, wire_preset: 'two', wire_type_default: DEFAULT_WIRE_TYPE, default_pass_minutes: DEFAULT_PASS_MINUTES,
    notes: '2 wire-mile paid pilot. Two-wire 4 kV circuits.',
  }, { seed: true })
  // Robot types are assumed from the pattern on the paper logs (passes 1-4 vs pass 5).
  // Confirm on the Settings screen before relying on the material column.
  const silicone = [170, 171, 176, 177, 186]
  const pvdf = [132, 173, 174]
  for (const n of silicone) await upsertRobot({ number: n, type: 'silicone', notes: 'Type assumed from paper logs. Confirm.' }, { log: false, seed: true })
  for (const n of pvdf) await upsertRobot({ number: n, type: 'pvdf', notes: 'Type assumed from paper logs. Confirm.' }, { log: false, seed: true })
}

const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).getTime()
const Y = 2026 // year assumed; the sheets only show month/day

interface PaperPass {
  w: number
  side: Side
  layer: number
  robot: number
  start: number
  notes?: string
}

// Transcribed from the two photographed Powerline Process Logs. Only start
// times were recorded on paper, so end is null and status is complete.
interface PaperLog { pole_a: string; pole_b: string; length_ft: number; landmark: string; notes: string; passes: PaperPass[] }

const LOG_1: PaperLog = {
  pole_a: '6851 BV', pole_b: '6852 BV', length_ft: 147, landmark: 'Driveway R edge',
  notes: 'Paper log dated 8/25, entries 8/26. Length written as 49.14 (assumed yards = 147 ft).',
  passes: [
    { w: 1, side: 'A', layer: 1, robot: 177, start: at(Y, 8, 26, 10, 7) },
    { w: 1, side: 'B', layer: 1, robot: 177, start: at(Y, 8, 26, 10, 51) },
    { w: 2, side: 'A', layer: 1, robot: 170, start: at(Y, 8, 26, 10, 7) },
    { w: 2, side: 'A', layer: 2, robot: 176, start: at(Y, 8, 26, 10, 51) },
    { w: 2, side: 'B', layer: 1, robot: 171, start: at(Y, 8, 26, 10, 51) },
  ],
}

const LOG_2: PaperLog = {
  pole_a: '4755', pole_b: 'BV 12173', length_ft: 153, landmark: 'House chimney',
  notes: 'Paper log dated 8/24-8/25. Length written as 51 yards (153 ft). Several cross-outs; see pass notes.',
  passes: [
    // W1 left half (L1)
    { w: 1, side: 'A', layer: 1, robot: 176, start: at(Y, 8, 24, 9, 24) },
    { w: 1, side: 'A', layer: 2, robot: 176, start: at(Y, 8, 24, 9, 45) },
    { w: 1, side: 'A', layer: 3, robot: 177, start: at(Y, 8, 24, 10, 8) },
    { w: 1, side: 'A', layer: 4, robot: 171, start: at(Y, 8, 25, 9, 35) },
    // W1 right half (R1)
    { w: 1, side: 'B', layer: 1, robot: 170, start: at(Y, 8, 24, 9, 24), notes: 'Paper shows a circled-x mark next to 170.' },
    { w: 1, side: 'B', layer: 2, robot: 176, start: at(Y, 8, 25, 10, 25), notes: 'An earlier entry on this line is crossed out.' },
    { w: 1, side: 'B', layer: 3, robot: 186, start: at(Y, 8, 25, 10, 25), notes: '171 crossed out; 186 is an uncertain reading.' },
    { w: 1, side: 'B', layer: 4, robot: 171, start: at(Y, 8, 25, 10, 50) },
    // W1 PVDF: paper logged pass 5 on L1 (#173) and R1 (#132) at the same time; read as two PVDF robots in series on wire 1.
    { w: 1, side: 'full', layer: 1, robot: 173, start: at(Y, 8, 25, 11, 31), notes: 'Paper: pass 5 on L1. Interpreted as PVDF layer 1, full span.' },
    { w: 1, side: 'full', layer: 2, robot: 132, start: at(Y, 8, 25, 11, 31), notes: 'Paper: pass 5 on R1. Interpreted as PVDF layer 2 in series.' },
    // W2 left half (L2)
    { w: 2, side: 'A', layer: 1, robot: 177, start: at(Y, 8, 24, 9, 24) },
    { w: 2, side: 'A', layer: 2, robot: 171, start: at(Y, 8, 24, 9, 45) },
    { w: 2, side: 'A', layer: 3, robot: 176, start: at(Y, 8, 24, 10, 8) },
    { w: 2, side: 'A', layer: 4, robot: 176, start: at(Y, 8, 25, 9, 35) },
    // W2 right half (R2)
    { w: 2, side: 'B', layer: 1, robot: 177, start: at(Y, 8, 24, 9, 24), notes: 'Paper shows 171 with a circled-x mark, then 177.' },
    { w: 2, side: 'B', layer: 2, robot: 170, start: at(Y, 8, 25, 10, 23), notes: 'Entry has a cross-out.' },
    { w: 2, side: 'B', layer: 3, robot: 177, start: at(Y, 8, 25, 10, 25) },
    { w: 2, side: 'B', layer: 4, robot: 177, start: at(Y, 8, 25, 10, 50) },
    // W2 PVDF
    { w: 2, side: 'full', layer: 1, robot: 173, start: at(Y, 8, 25, 11, 31), notes: 'Paper: pass 5 on L2 reads 173, the same robot logged on W1 at this time. Confirm.' },
    { w: 2, side: 'full', layer: 2, robot: 174, start: at(Y, 8, 25, 11, 31), notes: 'Paper: pass 5 on R2.' },
  ],
}

/** Insert the two paper logs as sample data. Used by the tests; not exposed in the app. */
export async function importPaperLogs(job: Job): Promise<number> {
  const existing = await db.spans.where('job_id').equals(job.id).toArray()
  let created = 0
  for (const log of [LOG_1, LOG_2]) {
    if (existing.some((s) => samePair(s.pole_a, s.pole_b, log.pole_a, log.pole_b))) continue
    const { span } = await addSpan(job, {
      pole_a: log.pole_a, pole_b: log.pole_b, length_ft: log.length_ft, length_source: 'other',
      landmark: log.landmark, preset: 'two', run_id: null,
    })
    const withNotes: Span = { ...span, notes: log.notes, wires: PRESETS.two.wires }
    await put('spans', withNotes)
    for (const p of log.passes) {
      await savePastPass(job, withNotes, {
        wire_idx: p.w, side: p.side, layer: p.layer, robot: p.robot, start: p.start, end: null,
        status: 'complete', pct: 100, reason: '', operator: '', notes: p.notes ?? 'End time not recorded on paper.', source: 'paper',
      })
    }
    created += 1
  }
  return created
}
