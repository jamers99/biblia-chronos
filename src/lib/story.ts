// The story map's chapters: one per era. The words, places, key moments, and
// people are editorial (see periods.json). An era without chosen moments or
// people falls back to its best-attested ones, taken from the timeline's items
// so both views agree on what belongs to an era.

import type { Event, Period, Person } from "./data/schema.ts"
import { periodAt, periodsOverlapping, spanOf } from "./chronology.ts"
import { formatEstimate, formatSpan, label } from "./format.ts"
import type { TimelineItem } from "./timeline.ts"

export type Chapter = {
  id: string
  name: string
  start: number
  end: number
  when: string
  lede?: string
  places: string[] // key place ids, most important first
  journey?: { name: string; places: string[] }
  moments: { id: string; name: string; when: string }[] // in date order
  people: { id: string; name: string }[]
}

export type Records = {
  events: (ids: string[]) => Event[]
  people: (ids: string[]) => Person[]
  onMap: (placeId: string) => boolean
}

const MOMENTS = 6
const PEOPLE = 7

export function storyChapters(periods: Period[], items: TimelineItem[], records: Records): Chapter[] {
  return periods.map((era) => {
    // Items arrive heaviest first. A moment belongs to the era it starts in; a
    // person to every era their life overlaps (as on the timeline).
    const moments = era.moments
      ? records.events(era.moments).map((e) => ({ id: e.id, name: e.name, when: spanOf(e.date) ? formatEstimate(e.date) : "" }))
      : items
          .filter((i) => i.kind === "event" && periodAt(i.start, periods) === era)
          .slice(0, MOMENTS)
          .sort((a, b) => a.start - b.start)
          .map((i) => ({ id: i.id, name: i.name, when: formatSpan(i.start, i.end) }))
    const people = era.people
      ? records.people(era.people).map((p) => ({ id: p.id, name: label(p) }))
      : items
          .filter((i) => i.kind === "person" && periodsOverlapping(i, periods).includes(era))
          .slice(0, PEOPLE)
          .map((i) => ({ id: i.id, name: i.name }))
    const journey = era.journey && { ...era.journey, places: era.journey.places.filter(records.onMap) }
    return {
      id: era.id,
      name: era.name,
      start: era.date.earliest,
      end: era.date.latest,
      when: formatSpan(era.date.earliest, era.date.latest),
      lede: era.lede,
      places: (era.places ?? []).filter(records.onMap),
      journey: journey && journey.places.length > 1 ? journey : undefined,
      moments,
      people,
    }
  })
}
