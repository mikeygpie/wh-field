import { db } from './db'
import { minutesBetween, segId, segLabel } from './domain'
import type { Job, Pass, Span } from './types'

// Column names are stable on purpose: the ops spreadsheet imports these files.

const q = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const row = (cells: unknown[]) => cells.map(q).join(',')
const iso = (ms: number | null) => (ms == null ? '' : new Date(ms).toISOString())
const local = (ms: number | null) => (ms == null ? '' : new Date(ms).toLocaleString())

export function spansCsv(spans: Span[], runNames: Record<string, string>): string {
  const head = ['span_id', 'street', 'seq', 'pole_a', 'pole_b', 'length_ft', 'length_source', 'landmark', 'wire_preset', 'wrap_wires', 'notes', 'deleted', 'created_at', 'updated_at']
  const lines = spans.map((s) =>
    row([
      s.id, s.run_id ? runNames[s.run_id] ?? s.run_id : '', s.seq, s.pole_a, s.pole_b, s.length_ft ?? '', s.length_source ?? '',
      s.landmark, s.preset, s.wires.filter((w) => w.wrap).map((w) => `W${w.idx}`).join(' '), s.notes, s.deleted_at ? 'yes' : '', iso(s.created_at), iso(s.updated_at),
    ]),
  )
  return [row(head), ...lines].join('\n')
}

export function passesCsv(passes: Pass[], spans: Span[]): string {
  const byId = Object.fromEntries(spans.map((s) => [s.id, s]))
  const head = [
    'pass_id', 'span_id', 'pole_a', 'pole_b', 'wire', 'side', 'segment_id', 'segment', 'material', 'layer', 'robot',
    'start_local', 'end_local', 'start_iso', 'end_iso', 'minutes', 'status', 'pct', 'reason', 'operator', 'source', 'notes',
  ]
  const lines = passes
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((p) => {
      const s = byId[p.span_id]
      return row([
        p.id, p.span_id, s?.pole_a ?? '', s?.pole_b ?? '', `W${p.wire_idx}`, p.side, s ? segId(s, p.wire_idx, p.side) : '', s ? segLabel(s, p.wire_idx, p.side) : '',
        p.material, p.layer, p.robot, local(p.start), local(p.end), iso(p.start), iso(p.end), p.end ? minutesBetween(p.start, p.end) : '',
        p.status, p.pct, p.reason, p.operator, p.source, p.notes,
      ])
    })
  return [row(head), ...lines].join('\n')
}

export async function editsCsv(job: Job): Promise<string> {
  const edits = await db.edits.where('job_id').equals(job.id).toArray()
  const head = ['activity_id', 'when_local', 'who', 'action', 'entity', 'entity_id', 'summary', 'reason', 'changes']
  const lines = edits.sort((a, b) => a.created_at - b.created_at).map((e) => row([e.id, local(e.created_at), e.who, e.action, e.entity, e.entity_id, e.summary, e.reason, JSON.stringify(e.changes)]))
  return [row(head), ...lines].join('\n')
}

export function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

export async function exportJob(job: Job) {
  const [spans, passes, runs] = await Promise.all([
    db.spans.where('job_id').equals(job.id).toArray(),
    db.passes.where('job_id').equals(job.id).toArray(),
    db.runs.where('job_id').equals(job.id).toArray(),
  ])
  const runNames = Object.fromEntries(runs.map((r) => [r.id, r.name]))
  const stamp = new Date().toISOString().slice(0, 10)
  download(`${stamp}-spans.csv`, spansCsv(spans, runNames))
  download(`${stamp}-passes.csv`, passesCsv(passes, spans))
  download(`${stamp}-activity.csv`, await editsCsv(job))
}
