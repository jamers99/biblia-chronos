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
// otherwise we fall back to the years they're attested in — their recorded
// birth or death plus the dated events they took part in. (Upstream `lived` is
// not a lifespan, so it's deliberately ignored.)
export type PersonSpan = Span & { lifetime: boolean }

export function personSpan(person: Person, events: Event[]): PersonSpan | undefined {
  const birth = spanOf(person.birth)
  const death = spanOf(person.death)
  if (birth && death) return { start: birth.start, end: death.end, lifetime: true }

  const spans = [birth, death, ...events.map((e) => spanOf(e.date))].filter((s) => s !== undefined)
  if (!spans.length) return undefined
  return {
    start: Math.min(...spans.map((s) => s.start)),
    end: Math.max(...spans.map((s) => s.end)),
    lifetime: false,
  }
}

// The period a span begins in, if any.
export const periodAt = (year: number, periods: Period[]): Period | undefined =>
  periods.find((p) => year >= p.date.earliest && year < p.date.latest) ??
  periods.find((p) => year === p.date.latest)

// Periods a span overlaps (for a place's events, a person's life, …).
export const periodsOverlapping = (span: Span, periods: Period[]): Period[] =>
  periods.filter((p) => span.start <= p.date.latest && span.end >= p.date.earliest)
