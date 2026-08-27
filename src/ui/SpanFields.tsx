import { PRESETS, WIRE_MATERIALS, WIRE_THICKNESSES, WIRE_VOLTAGES } from '../lib/types'
import type { LayerPlan, PresetKey, WireType } from '../lib/types'
import { Field, inputCls } from './atoms'

/** Wires, Layers, and Wire type: shared by the add and edit span sheets. */
export function SpanConfigFields({ preset, setPreset, layers, setLayers, wireType, setWireType }: {
  preset: PresetKey
  setPreset: (p: PresetKey) => void
  layers: LayerPlan
  setLayers: (l: LayerPlan) => void
  wireType: WireType
  setWireType: (w: WireType) => void
}) {
  const clamp = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v) || 0))
  return (
    <>
      <Field label="Wires (circuit type)">
        <select value={preset} onChange={(e) => setPreset(e.target.value as PresetKey)} className={inputCls} aria-label="Wires">
          {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </Field>
      <Field label="Layers">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-xs text-stone-500 mb-1">Silicone</span>
            <input type="number" inputMode="numeric" min={0} max={8} value={layers.silicone} onChange={(e) => setLayers({ ...layers, silicone: clamp(e.target.value, 0, 8) })} className={inputCls} aria-label="Silicone layers" />
          </label>
          <label className="block">
            <span className="block text-xs text-stone-500 mb-1">PVDF</span>
            <input type="number" inputMode="numeric" min={0} max={4} value={layers.pvdf} onChange={(e) => setLayers({ ...layers, pvdf: clamp(e.target.value, 0, 4) })} className={inputCls} aria-label="PVDF layers" />
          </label>
        </div>
      </Field>
      <WireTypeFields value={wireType} onChange={setWireType} />
    </>
  )
}

export function WireTypeFields({ value, onChange, label = 'Wire type' }: { value: WireType; onChange: (w: WireType) => void; label?: string }) {
  return (
    <Field label={label}>
      <div className="grid grid-cols-3 gap-2 items-start">
        <ComboSelect options={WIRE_THICKNESSES} value={value.thickness} onChange={(v) => onChange({ ...value, thickness: v })} ariaLabel="Wire thickness" placeholder="thickness" />
        <ComboSelect options={WIRE_VOLTAGES} value={value.voltage} onChange={(v) => onChange({ ...value, voltage: v })} ariaLabel="Wire voltage" placeholder="voltage" />
        <ComboSelect options={WIRE_MATERIALS} value={value.material} onChange={(v) => onChange({ ...value, material: v })} ariaLabel="Wire material" placeholder="material" />
      </div>
    </Field>
  )
}

/** A dropdown whose "Other" choice opens a text field; the typed text becomes the value. */
function ComboSelect({ options, value, onChange, ariaLabel, placeholder }: {
  options: readonly string[]
  value: string
  onChange: (v: string) => void
  ariaLabel: string
  placeholder: string
}) {
  const presets = options.filter((o) => o !== 'Other')
  const custom = value === 'Other' || (value !== '' && !presets.includes(value))
  return (
    <div className="space-y-1">
      <select value={custom ? 'Other' : value} onChange={(e) => onChange(e.target.value)} className={inputCls} aria-label={ariaLabel}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {custom && (
        <input value={value === 'Other' ? '' : value} onChange={(e) => onChange(e.target.value || 'Other')} placeholder={placeholder} className={`${inputCls} text-sm`} aria-label={`${ariaLabel} (other)`} />
      )}
    </div>
  )
}
