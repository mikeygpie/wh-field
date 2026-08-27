# WH Field Log (V1 starter)

Job tracking for Witching Hour line crews. Replaces the paper Powerline Process Log: one record per span, one row per robot pass, logged by half-segment with the pole numbers. Works offline, syncs when it can, exports CSV.

This is a starter codebase, not a finished product. The screens, data model, sync, and tests are in place; the engineer picking it up wires in the Supabase project, adjusts what the crew asks for, and ships it.

## What is here

- React + TypeScript + Vite, installable as a PWA (home screen icon, offline app shell).
- Local-first data in IndexedDB (Dexie). Every write lands locally first and is queued for sync.
- Optional Supabase sync (Postgres + magic-link sign-in). Without keys the app runs local-only.
- CSV export of spans, passes, and edit history.
- First-run seed: the BVES pilot job and the robot list. The two photographed paper logs are transcribed in `src/lib/seed.ts` and used as test fixtures.
- Tests: data layer (dedupe, streets and poles, moves and reorders, layer math, edits, outbox, CSV) and three end-to-end UI flows.

Not in V1 (planned for V2): job planning, fleet assumptions, crew throughput, map drawing, GIS import, gen2 full-span silicone, utility-facing completion PDF.

## Quick start

```bash
npm install
npm run dev -- --host     # open the printed LAN URL on a phone on the same network
npm test                  # vitest
npm run build && npm run preview
```

Sync stays off until `.env.local` has the Supabase keys (see below). Everything else works immediately.

## Screens

| Screen | What it does |
|---|---|
| Spans | One collapsible, color-coded section per street plus "Other (not on a recorded street)" for anything unassigned (always shown). Each section has its own progress bar and "X of Y spans done", then its spans (status, progress), then its poles that have no span yet, each with a "Create span" button that opens the span sheet with that pole as Pole A. Span rows show completed / total length and a progress bar. Section header: collapse, "+ pole", "+ span" (preselect the street), rename, delete (contents move to Other). Bottom buttons add a street, a pole, or a span. Poles are picked from the recorded poles or typed new; span length is entered on the span. Recorded poles carry their street, so the span follows them, and two poles on different streets are refused with an error. Drag the grip on a row to reorder spans within a street or move a span or pole to another street. |
| Span record | Mirrors the paper sheet: Pole A left, Pole B right, wires numbered from the road, the road always below the wires by convention, a pip per layer per half-segment, and the pass list. Tap a half to log silicone, the PVDF bar to log a full-span PVDF pass, a pass row to end or edit it. Menu: edit details (including street), swap A and B. |
| Stats | Spans completed, wire-ft and wire-miles, pass-ft, span-passes, rolls by type, partial/failed counts and reasons, average pass minutes. Today, week, whole job, or by day: the day list comes from the days passes were logged, and tapping a day shows its full set. CSV export. |
| Fleet | Robot list (number, name, type, passes, on truck) with an add/edit sheet and a per-robot menu (edit, delete with confirmation). |
| Settings | This device: your name (stamped on every pass and edit from this phone) and length unit (feet, yards, meters; storage stays in feet). Job details: name, customer, circuit type default (pre-selects Wires), layer default (pre-selects Layers), wire type default (thickness, voltage, material), default pass minutes. Sync, build stamp with an update button, clear local data. |

## Data model

Types live in `src/lib/types.ts` and match the Supabase schema column for column.

- **Job**: name, customer, circuit, and the defaults that pre-fill new spans (layer plan, wire configuration, wire type) and past passes (pass minutes). Job wire length is computed from span lengths × wrapped wires, never entered.
- **Run** (a street in the UI): a name. Poles and spans point at it.
- **Pole**: a recorded pole ID under a street (or none). Every span registers both of its poles; a pole with no live span is shown as "No span yet".
- **Span**: Pole A, Pole B, length (stored in feet), landmark, wire configuration, its own layer plan and wire type (copied from the job defaults, editable per span), and the street it is filed under (`run_id`; null means Other). The road is always below the wires; the `road` field is kept for a future need. Deleting a span sets `deleted_at`; its passes stay.
- **Wire**: index (1 = closest to the road), role, wrap-required. Ground and neutral wires are not wrapped.
- **Half-segment**: not stored; it is (span, wire, side) where side is A or B. Exports use the ID `W{n}-{PoleID}`. PVDF passes use side `full`.
- **Pass**: segment, layer, robot, material (looked up from the robot list when saved, then fixed), start, end, status, completion %, reason, notes, source (live / paper / csv). One roll per pass started.
- **Robot**: number, name, type, on truck. Deleting one hides it from the list; passes logged against its number are untouched.
- **Edit**: immutable record of a change to a pass or span: who, when, reason, and the changed fields with old and new values.

Status rules (`src/lib/domain.ts`): a layer on a segment is done at 100% (partial passes add up); a wire is done when all silicone layers are done on both halves and all PVDF layers are done; a span is done when every wrap-required wire is done.

Ordering: `seq` is the span's position within its street section and is set by drag and drop. Streets, spans, and poles are soft-deleted (`deleted_at`) so deletes sync like any other change.

## Offline and sync

`src/lib/repo.ts` is the only place that writes. `put()` stamps `updated_at`, stores the row in Dexie, and adds it to the outbox in one transaction. The UI reads through `useLiveQuery`, so it updates the moment the local store changes, online or not.

`src/lib/sync.ts` pushes the outbox in order (upsert by id, stop at the first error so order holds), then pulls each table incrementally by `updated_at`. Merge rule is last-write-wins on `updated_at`. Passes and edits are append-only in practice, so conflicts only touch span details. Sync runs on: app start, coming back online, every 30 seconds, and shortly after any local write.

The top bar shows the state: Local only, Synced, N queued, Offline, Syncing, Sync error. Tapping it syncs now.

Known simplifications to revisit: `updated_at` comes from device clocks; the outbox has no size cap; the signed-in user is not yet written into `operator` or `who` (both default to blank or "Crew lead").

## Supabase setup

1. Create a project at supabase.com.
2. SQL editor: run `supabase/migrations/0001_init.sql`.
3. Authentication > Providers: enable Email. Authentication > Email Templates > Magic Link: make sure the body includes `{{ .Token }}` so the email carries the 6-digit code (on phones the code is what people type into the app; a link opens in the browser, not the home-screen app). Authentication > URL configuration: set the site URL to where the app is hosted (and `http://localhost:5173` for dev).
4. Copy the project URL and anon key into `.env.local`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
5. Restart `npm run dev`. On Settings, enter an email, type the code from the email (or tap the link when in a browser), and sync starts.

Row-level security lets any signed-in user read and write everything, which is right for one crew. Tighten to per-organization policies before a second customer or outside users get access.

## Deploy

Static build: `npm run build` produces `dist/`. Host on Vercel, Netlify, Cloudflare Pages, or any static host with HTTPS (required for the service worker and home-screen install). Set the two `VITE_` variables in the host's environment. On iPhone: open in Safari, Share, Add to Home Screen.

## Sample data

First run creates the job and eight robots. Robot types are assumed from the pattern on the paper logs (170, 171, 176, 177, 186 silicone; 132, 173, 174 PVDF) and flagged in each robot's notes. Confirm them on Settings.

`importPaperLogs()` in `src/lib/seed.ts` holds spans 6851 BV to 6852 BV and 4755 to BV 12173 with 25 passes transcribed from the photographed sheets, including notes where the paper had cross-outs or uncertain readings. It is used by the tests and is not exposed in the app. "Clear local data" on Settings wipes this device only.

## Layout

```
src/
  App.tsx              shell: nav, top bar, sheet routing
  lib/types.ts         domain types (mirror of the SQL schema)
  lib/db.ts            Dexie schema, ids, pole-ID normalization
  lib/domain.ts        pure layer/status math, labels, formatting
  lib/repo.ts          all writes (put + outbox, edit history)
  lib/sync.ts          Supabase client, auth, push/pull, status store
  lib/csv.ts           exports
  lib/seed.ts          first-run seed and paper log import
  ui/atoms.tsx         tags, pips, buttons, sheet, robot chips, status picker
  screens/             Spans, Span, Fleet, Stats, Settings
  sheets/              Log, End, EditPass, AddSpan, EditSpan, AddPole, Street, Robot
  ui/PolePicker.tsx    pick a recorded pole or type a new one
  ui/SpanFields.tsx    wires, layers, wire type fields
  lib/units.ts         ft/yd/m display and entry
  lib/operator.ts      "your name" on this device
  test/                vitest suites (fake-indexeddb + jsdom)
supabase/migrations/   schema
```

## Next for the engineer

1. Wire the Supabase project and test two phones logging on the same span.
2. Optionally tie "your name" to the signed-in account.
3. Merge two records for the same span; undo for deleted spans and poles.
4. Photos on span records (landmark, pole tags) with upload queueing.
5. Decide whether the crew wants the diagram taps or a big "Log pass" button as the primary action, then remove the other.
