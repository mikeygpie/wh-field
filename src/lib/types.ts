// Domain types. Every synced table shares the Stamped fields; updated_at is the
// last-write-wins clock used by sync (epoch milliseconds).

export type Material = 'silicone' | 'pvdf'
export type Side = 'A' | 'B' | 'full'
export type PassStatus = 'running' | 'complete' | 'partial' | 'interrupted' | 'failed'
export type PassSource = 'live' | 'paper' | 'csv'
export type RoadSide = 'bottom' | 'top' | 'none'
export type PresetKey = 'single' | 'two' | 'three'
export type WireRole = 'phase' | 'neutral' | 'ground'
export type LengthSource = 'range-finder' | 'google-maps' | 'other'

export interface Stamped {
  id: string
  created_at: number
  updated_at: number
}

export interface LayerPlan {
  silicone: number
  pvdf: number
}

/** Conductor description. Free-form strings chosen from the dropdown lists below. */
export interface WireType {
  thickness: string
  voltage: string
  material: string
}

export interface Job extends Stamped {
  name: string
  customer: string
  circuit: string
  layer_plan: LayerPlan // pre-selects Layers when a span is added
  wire_preset: PresetKey // pre-selects Wires (circuit type) when a span is added
  wire_type_default: WireType
  default_pass_minutes: { silicone: number; pvdf: number } // past-pass end time defaults
  notes: string
}

/** A street (or line segment). Poles and spans are filed under it. */
export interface Run extends Stamped {
  job_id: string
  name: string
  deleted_at: number | null
}

/** A pole the crew has recorded. A pole with no span yet shows as "No span yet". */
export interface Pole extends Stamped {
  job_id: string
  run_id: string | null
  pole_id: string
  notes: string
  deleted_at: number | null
}

export interface Wire {
  idx: number // 1 = closest to the road
  role: WireRole
  wrap: boolean
}

export interface Span extends Stamped {
  job_id: string
  run_id: string | null
  seq: number // position within the run
  pole_a: string
  pole_b: string
  length_ft: number | null
  length_source: LengthSource | null
  street: string
  landmark: string
  road: RoadSide
  preset: PresetKey
  wires: Wire[]
  layer_plan: LayerPlan
  wire_type: WireType
  notes: string
  deleted_at: number | null
}

export interface Pass extends Stamped {
  job_id: string
  span_id: string
  wire_idx: number
  side: Side // A/B for silicone half-segments, full for PVDF
  material: Material
  layer: number
  robot: number
  start: number
  end: number | null
  status: PassStatus
  pct: number // 0-100 share of the run covered
  reason: string
  operator: string
  notes: string
  source: PassSource
}

export interface Robot extends Stamped {
  number: number
  name: string
  type: Material
  active: boolean
  notes: string
  deleted_at: number | null
}

export type ActivityEntity = 'pass' | 'span' | 'run' | 'pole' | 'robot' | 'job'
export type ActivityAction = 'create' | 'update' | 'delete' | 'move' | 'start' | 'end'

/** Immutable activity record: who did what, when. Field-level changes are kept for updates. */
export interface Edit extends Stamped {
  job_id: string
  entity: ActivityEntity
  entity_id: string
  action: ActivityAction
  summary: string
  changes: Record<string, { old: unknown; new: unknown }>
  who: string
  reason: string
}

export type TableName = 'jobs' | 'runs' | 'poles' | 'spans' | 'passes' | 'robots' | 'edits'
export const SYNC_TABLES: TableName[] = ['jobs', 'runs', 'robots', 'poles', 'spans', 'passes', 'edits']

export interface OutboxItem {
  id: string
  table: TableName
  payload: Stamped
  created_at: number
  attempts: number
  last_error: string | null
}

export interface MetaRow {
  key: string
  value: unknown
}

export const REASONS = ['Battery', 'Tape out', 'Jam', 'Weather', 'Line crew', 'Slippage', 'Lost connection', 'Other'] as const

export const PRESETS: Record<PresetKey, { label: string; wires: Wire[] }> = {
  single: { label: 'One-wire', wires: [{ idx: 1, role: 'phase', wrap: true }] },
  two: { label: 'Two-wire', wires: [{ idx: 1, role: 'phase', wrap: true }, { idx: 2, role: 'phase', wrap: true }] },
  three: { label: 'Three-wire', wires: [{ idx: 1, role: 'phase', wrap: true }, { idx: 2, role: 'phase', wrap: true }, { idx: 3, role: 'phase', wrap: true }] },
}

export const WIRE_THICKNESSES = ['#4 (0.25 in)', '#2 (0.32 in)', '1/0 (0.40 in)', '2/0 (0.45 in)', '4/0 (0.56 in)', '336 kcmil (0.72 in)', 'Other'] as const
export const WIRE_VOLTAGES = ['4 kV', '12 kV', '16 kV', '21 kV', '34.5 kV', 'Other'] as const
export const WIRE_MATERIALS = ['ACSR', 'AAC', 'AAAC', 'Copper', 'Other'] as const
export const DEFAULT_WIRE_TYPE: WireType = { thickness: '#2 (0.32 in)', voltage: '4 kV', material: 'ACSR' }
export const DEFAULT_LAYER_PLAN: LayerPlan = { silicone: 4, pvdf: 2 }
export const DEFAULT_PASS_MINUTES = { silicone: 60, pvdf: 120 }
