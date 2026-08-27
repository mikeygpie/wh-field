import type { Material, Pass, Side, Span, Wire } from './types'

// All functions here are pure. They take a span (which carries its own layer
// plan) and the passes logged on it, so the UI and the stats never disagree.

export const wrapWires = (span: Span): Wire[] => span.wires.filter((w) => w.wrap)
export const materialFor = (side: Side): Material => (side === 'full' ? 'pvdf' : 'silicone')
export const layersFor = (span: Span, side: Side) => (side === 'full' ? span.layer_plan.pvdf : span.layer_plan.silicone)
export const runLengthFt = (span: Span, material: Material) => {
  const L = span.length_ft ?? 0
  return material === 'pvdf' ? L : L / 2
}
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

const matches = (p: Pass, spanId: string, w: number, side: Side, layer: number) =>
  p.span_id === spanId && p.wire_idx === w && p.side === side && p.layer === layer

/** Completion of one layer on one segment, 0-100, summing partial passes. */
export function layerPct(passes: Pass[], spanId: string, w: number, side: Side, layer: number): number {
  const total = passes
    .filter((p) => matches(p, spanId, w, side, layer) && p.status !== 'running')
    .reduce((s, p) => s + p.pct, 0)
  return Math.min(100, total)
}

export const isRunning = (passes: Pass[], spanId: string, w: number, side: Side, layer: number) =>
  passes.some((p) => matches(p, spanId, w, side, layer) && p.status === 'running')

/** First layer on the segment that is neither complete nor running. */
export function nextLayer(passes: Pass[], span: Span, w: number, side: Side): number | null {
  for (const L of range(layersFor(span, side))) {
    if (layerPct(passes, span.id, w, side, L) < 100 && !isRunning(passes, span.id, w, side, L)) return L
  }
  return null
}

export const siliconeDone = (passes: Pass[], span: Span, w: number) =>
  (['A', 'B'] as Side[]).every((s) => range(span.layer_plan.silicone).every((L) => layerPct(passes, span.id, w, s, L) >= 100))

export const wireDone = (passes: Pass[], span: Span, w: number) =>
  siliconeDone(passes, span, w) && range(span.layer_plan.pvdf).every((L) => layerPct(passes, span.id, w, 'full', L) >= 100)

export function spanProgress(passes: Pass[], span: Span) {
  let done = 0
  let total = 0
  wrapWires(span).forEach((wire) => {
    ;(['A', 'B'] as Side[]).forEach((s) => {
      for (const L of range(span.layer_plan.silicone)) {
        total += 1
        done += layerPct(passes, span.id, wire.idx, s, L) / 100
      }
    })
    for (const L of range(span.layer_plan.pvdf)) {
      total += 1
      done += layerPct(passes, span.id, wire.idx, 'full', L) / 100
    }
  })
  return { done, total }
}

export type SpanStatus = 'planned' | 'in progress' | 'complete'
export function spanStatus(passes: Pass[], span: Span): SpanStatus {
  const wires = wrapWires(span)
  if (wires.length > 0 && wires.every((w) => wireDone(passes, span, w.idx))) return 'complete'
  if (passes.some((p) => p.span_id === span.id)) return 'in progress'
  return 'planned'
}

export const segLabel = (span: Span, w: number, side: Side) =>
  side === 'full'
    ? `W${w} full span`
    : `W${w} ${side === 'A' ? span.pole_a : span.pole_b} side (${side === 'A' ? 'L' : 'R'}${w})`

/** Stable half-segment ID used in exports: wire index + nearest pole ID. */
export const segId = (span: Span, w: number, side: Side) =>
  side === 'full' ? `W${w}-FULL` : `W${w}-${(side === 'A' ? span.pole_a : span.pole_b).replace(/\s+/g, '')}`

export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
export const fmtDate = (ms: number) => new Date(ms).toLocaleDateString([], { month: 'numeric', day: 'numeric' })
export const minutesBetween = (a: number, b: number) => Math.round((b - a) / 60000)

/** Value for a datetime-local input, in the device's local time. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fromLocalInput = (s: string) => (s ? new Date(s).getTime() : NaN)

export const statusText = (p: Pass) =>
  ({
    running: 'Running',
    complete: 'Complete',
    partial: `Partial ${p.pct}%`,
    interrupted: `Interrupted ${p.pct}%`,
    failed: `Failed ${p.pct}%`,
  })[p.status]

/** Wire-feet in a set of spans: every wrap-required wire counts its span length. */
export const totalWireFt = (spans: Span[]) => spans.reduce((t, s) => t + wrapWires(s).length * (s.length_ft ?? 0), 0)

/** Wire-feet fully finished (all layers on the wire). */
export const doneWireFt = (spans: Span[], passes: Pass[]) =>
  spans.reduce((t, s) => t + wrapWires(s).filter((w) => wireDone(passes, s, w.idx)).length * (s.length_ft ?? 0), 0)

/** One-line conductor description for headers. */
export const wireTypeText = (span: Span) => [span.wire_type.thickness, span.wire_type.material, span.wire_type.voltage].filter((x) => x && x !== 'Other').join(' · ')
