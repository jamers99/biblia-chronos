// Where things sit in time. Pure helpers shared by the timeline, the map, and
// the entity pages, so they all agree on what "when" means for a record.

import type { DateEstimate, Event, Period, Person } from "./data/schema.ts"

export type Span = { start: number; end: number }

export function spanOf(d: DateEstimate | undefined): Span | undefined {
  const start = d?.earliest ?? d?.latest
  const end = d?.latest ?? d?.earliest
  return start === undefined || end === undefined ? undefined : { start, end }
}

// A person's place in time. With both birth and death we know their lifetime;
// otherwise we fall back to the years they're attested in: their recorded
// birth or death plus the dated events they took part in. (Upstream `lived` is
// not a lifespan, so it's deliberately ignored.) Two guards keep attested
// years human-sized:
// - an event longer than a lifetime (the 430-year sojourn in Egypt) dates a
//   person only by its start;
// - a gap of more than a century ends the run, so a later appearance (Elijah
//   at the Transfiguration) doesn't stretch a life across 900 years.
export type PersonSpan = Span & { lifetime: boolean }

const LIFETIME = 80
const GAP = 100

export function personSpan(person: Person, events: Event[]): PersonSpan | undefined {
  const birth = spanOf(person.birth)
  const death = spanOf(person.death)
  if (birth && death) return { start: birth.start, end: death.end, lifetime: true }

  const spans = [birth, death, ...events.map((e) => spanOf(e.date))]
    .filter((s) => s !== undefined)
    .map((s) => (s.end - s.start > LIFETIME ? { start: s.start, end: s.start } : s))
    .sort((a, b) => a.start - b.start)
  if (!spans.length) return undefined

  const run = { start: spans[0].start, end: spans[0].end, lifetime: false }
  for (const s of spans.slice(1)) {
    if (s.start - run.end > GAP) break
    run.end = Math.max(run.end, s.end)
  }
  return run
}

// Periods are half-open — [earliest, latest) — so a year on a boundary belongs
// to the era that starts there (AD 30 is the Early Church, not the Life of
// Christ). The last period also claims its own end year.
export const periodAt = (year: number, periods: Period[]): Period | undefined =>
  periods.find((p) => year >= p.date.earliest && year < p.date.latest) ??
  periods.find((p) => year === p.date.latest)

// Periods a span overlaps (a person's life, say). A span that merely touches a
// boundary doesn't overlap the era on the other side: Jesus (4 BC – AD 30)
// belongs to the Life of Christ only.
export function periodsOverlapping(span: Span, periods: Period[]): Period[] {
  const overlapping = periods.filter((p) => span.start < p.date.latest && span.end > p.date.earliest)
  if (overlapping.length) return overlapping
  const at = periodAt(span.start, periods)
  return at ? [at] : []
}
