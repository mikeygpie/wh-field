import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App'
import { db } from '../lib/db'
import { ensureSeed, importPaperLogs } from '../lib/seed'
import { addPole, addRun } from '../lib/repo'

async function fresh() {
  await db.delete()
  await db.open()
  await ensureSeed()
  return (await db.jobs.toArray())[0]
}

describe('Spans tab', () => {
  it('adds a street, a pole, and a span from that pole', async () => {
    const job = await fresh()
    render(<App />)
    // add a street from the bottom buttons
    fireEvent.click(await screen.findByText('Street'))
    fireEvent.change(await screen.findByLabelText('Street name'), { target: { value: 'Maple Ln' } })
    fireEvent.click(screen.getByText('Add street'))
    await screen.findByText('Maple Ln')
    // add a pole under it from the section header; it shows as "No span yet"
    fireEvent.click(screen.getAllByText('pole')[0]) // Maple Ln section header
    await screen.findByText('Add a pole')
    fireEvent.change(screen.getByLabelText('Pole ID'), { target: { value: '6851 BV' } })
    fireEvent.click(screen.getByText('Save pole'))
    await screen.findByText('Poles with no span yet')
    expect(screen.getByText('6851 BV')).toBeTruthy()
    // "Add span" on the pole row opens the sheet with Pole A filled and the street preset
    fireEvent.click(screen.getByText('Create span'))
    await screen.findByText('Add a span')
    const selects = () => Array.from(document.querySelectorAll('select')) as HTMLSelectElement[]
    const run = (await db.runs.toArray())[0]
    await waitFor(() => expect(selects()[0].value).toBe(run.id))
    await waitFor(() => expect(selects()[1].value).toBe('6851 BV'))
    // type a new pole for B, set a length, save
    fireEvent.change(selects()[2], { target: { value: '__new__' } })
    fireEvent.change(await screen.findByLabelText('New pole ID'), { target: { value: '6852 BV' } })
    fireEvent.change(screen.getByLabelText('Length'), { target: { value: '147' } })
    // layers and wire type are pre-filled from the job defaults and editable
    expect((screen.getByLabelText('Silicone layers') as HTMLInputElement).value).toBe('4')
    expect((screen.getByLabelText('Wire voltage') as HTMLSelectElement).value).toBe('4 kV')
    fireEvent.change(screen.getByLabelText('PVDF layers'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Wire voltage'), { target: { value: '12 kV' } })
    // "Other" on a wire type dropdown opens a text field and the typed text is saved
    fireEvent.change(screen.getByLabelText('Wire material'), { target: { value: 'Other' } })
    fireEvent.change(await screen.findByLabelText('Wire material (other)'), { target: { value: 'Copperweld' } })
    fireEvent.click(screen.getByText('Save span'))
    await screen.findByText('Passes')
    const span = (await db.spans.toArray())[0]
    expect(span).toMatchObject({ pole_a: '6851 BV', pole_b: '6852 BV', length_ft: 147, run_id: run.id, street: 'Maple Ln', layer_plan: { silicone: 4, pvdf: 1 } })
    expect(span.wire_type.voltage).toBe('12 kV')
    expect(span.wire_type.material).toBe('Copperweld')
    // both poles are registered and no longer lone
    expect((await db.poles.toArray()).map((p) => p.pole_id).sort()).toEqual(['6851 BV', '6852 BV'])
    void job
  })

  it('shows the Other section from the start and blocks spans that cross streets', async () => {
    const job = await fresh()
    render(<App />)
    await screen.findByText('Other')
    const a = await addRun(job.id, 'Street A')
    const b = await addRun(job.id, 'Street B')
    await addPole(job, 'P1', a.id)
    await addPole(job, 'P2', b.id)
    fireEvent.click(await screen.findByText('Span'))
    await screen.findByText('Add a span')
    const selects = () => Array.from(document.querySelectorAll('select')) as HTMLSelectElement[]
    await waitFor(() => expect(selects()[1].querySelectorAll('option').length).toBeGreaterThan(2))
    fireEvent.change(selects()[1], { target: { value: 'P1' } })
    fireEvent.change(selects()[2], { target: { value: 'P2' } })
    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toContain("can't cross streets")
    expect((screen.getByText('Save span') as HTMLButtonElement).disabled).toBe(true)
  })

  it('lists imported spans under Other and collapses a section', async () => {
    const job = await fresh()
    await importPaperLogs(job)
    await addPole(job, '7000 BV', (await addRun(job.id, 'Pine Ln')).id)
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('6851 BV').length).toBeGreaterThan(0))
    expect(screen.getByText('Other')).toBeTruthy()
    await screen.findByText('Poles with no span yet')
    fireEvent.click(screen.getByText('Pine Ln'))
    await waitFor(() => expect(screen.queryByText('Poles with no span yet')).toBeNull())
    fireEvent.click(screen.getByText('Pine Ln'))
    await screen.findByText('Poles with no span yet')
  })
})

describe('Stats', () => {
  it('offers a by-day view built from the days work was logged', async () => {
    const job = await fresh()
    await importPaperLogs(job)
    render(<App />)
    fireEvent.click(await screen.findByText('Stats'))
    fireEvent.click(await screen.findByText('By day'))
    await waitFor(() => expect(screen.getAllByText(/Aug 2[456]/).length).toBe(3))
    fireEvent.click(screen.getByText(/Aug 24/))
    await screen.findByText('Spans completed')
    expect(screen.getByText(/All days/)).toBeTruthy()
  })
})

describe('Span record', () => {
  it('opens a span and starts and ends a pass from the diagram', async () => {
    const job = await fresh()
    await importPaperLogs(job)
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('6851 BV').length).toBeGreaterThan(0))

    fireEvent.click(screen.getAllByText('6851 BV')[0].closest('button')!)
    await waitFor(() => expect(screen.getByText('Passes')).toBeTruthy())
    expect(screen.getAllByText(/from paper/).length).toBe(5)

    fireEvent.click(screen.getByLabelText('W1 6852 BV side (R1)'))
    await screen.findByText('W1 6852 BV side (R1)', { selector: 'div' })
    expect(screen.getByText('Next up: layer 2')).toBeTruthy()
    fireEvent.click(await screen.findByText('#177', { selector: 'button' }))

    // past-pass mode: end defaults to start + 60 min for silicone and follows start until edited
    fireEvent.click(screen.getByLabelText('Enter a past pass'))
    const startInput = screen.getByLabelText('Start') as HTMLInputElement
    const endInput = screen.getByLabelText('End') as HTMLInputElement
    const minutes = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000
    expect(minutes(startInput.value, endInput.value)).toBe(60)
    fireEvent.change(startInput, { target: { value: '2026-08-24T09:24' } })
    expect(endInput.value).toBe('2026-08-24T10:24')
    fireEvent.change(endInput, { target: { value: '2026-08-24T10:00' } })
    fireEvent.change(startInput, { target: { value: '2026-08-24T09:30' } })
    expect(endInput.value).toBe('2026-08-24T10:00')
    fireEvent.click(screen.getByLabelText('Enter a past pass'))

    fireEvent.click(screen.getByText('Start pass'))
    await waitFor(() => expect(screen.getByText('Running')).toBeTruthy())
    const running = await db.passes.filter((p) => p.status === 'running').toArray()
    expect(running).toHaveLength(1)
    expect(running[0]).toMatchObject({ wire_idx: 1, side: 'B', layer: 2, robot: 177, material: 'silicone' })

    fireEvent.click(screen.getByText('Running').closest('button')!)
    await screen.findByText('Keep running')
    fireEvent.click(screen.getByText('Interrupted'))
    fireEvent.click(screen.getByText('Other', { selector: 'button' }))
    fireEvent.change(await screen.findByLabelText('Other reason'), { target: { value: 'Wind picked up' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(async () => expect(await db.passes.filter((p) => p.status === 'running').count()).toBe(0))
    const ended = await db.passes.filter((p) => p.status === 'interrupted').toArray()
    expect(ended[0]).toMatchObject({ pct: 50, reason: 'Wind picked up' })
    expect(within(screen.getByText('Passes').parentElement!).getAllByText(/Interrupted 50%/).length).toBe(1)
  })
})
