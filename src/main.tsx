import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ensureSeed } from './lib/seed'
import { firstSyncDone, startSync } from './lib/sync'

// With signal, pull from the server before the first paint so the device
// shows the shared state, and only seed the starter job when the server
// has nothing. Without signal (or after 6 s), carry on with the local copy.
async function boot() {
  startSync()
  await Promise.race([firstSyncDone, new Promise<void>((r) => setTimeout(r, 6000))])
  await ensureSeed()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
void boot()
