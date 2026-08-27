import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta, setMeta } from './db'

// "Your name" on the Settings tab. Kept on the device; written into every pass
// (operator) and every edit (who) made from this phone.
export const whoAmI = async () => (await getMeta<string>('operator_name', '')).trim() || 'Unnamed'
export function useOperatorName(): string {
  const row = useLiveQuery(() => db.meta.get('operator_name'))
  return (row?.value as string | undefined) ?? ''
}
export const setOperatorName = (name: string) => setMeta('operator_name', name.trim())
