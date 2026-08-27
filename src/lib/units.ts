import { useLiveQuery } from 'dexie-react-hooks'
import { db, setMeta } from './db'

// Lengths are stored in feet. The unit is a device preference used for display and entry.
export type Unit = 'ft' | 'yd' | 'm'
const PER_FT: Record<Unit, number> = { ft: 1, yd: 1 / 3, m: 0.3048 }
export const UNIT_LABEL: Record<Unit, string> = { ft: 'ft', yd: 'yd', m: 'm' }

export const fromFt = (ft: number, unit: Unit) => ft * PER_FT[unit]
export const toFt = (value: number, unit: Unit) => value / PER_FT[unit]

/** "147 ft", "49 yd", "44.8 m". Meters show one decimal; ft and yd round to whole numbers. */
export function fmtLen(ft: number, unit: Unit): string {
  const v = fromFt(ft, unit)
  const text = unit === 'm' ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : Math.round(v).toLocaleString()
  return `${text} ${UNIT_LABEL[unit]}`
}
/** Number only, for input fields. */
export function lenInput(ft: number | null, unit: Unit): string {
  if (ft == null) return ''
  const v = fromFt(ft, unit)
  return String(unit === 'm' ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100)
}
/** Long distances: wire-miles for ft and yd, wire-km for meters. */
export function fmtLong(ft: number, unit: Unit): string {
  return unit === 'm' ? `${(ft * 0.0003048).toFixed(3)} wire-km` : `${(ft / 5280).toFixed(3)} wire-mi`
}
export const longLabel = (unit: Unit) => (unit === 'm' ? 'wire-km' : 'wire-miles')

export function useUnit(): Unit {
  const row = useLiveQuery(() => db.meta.get('unit'))
  return (row?.value as Unit | undefined) ?? 'ft'
}
export const setUnit = (unit: Unit) => setMeta('unit', unit)
