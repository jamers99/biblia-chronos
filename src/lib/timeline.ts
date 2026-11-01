// The timeline's data and layout, kept pure so it's testable and so the island
// only has to render. Items are built at build time and passed to the island as
// props; lanes are packed on every zoom, in pixels.

import type { Event, Period, Person } from "./data/schema.ts"
import { personSpan, spanOf, periodsOverlapping, type Span } from "./chronology.ts"
import { formatEstimate, label, summarize } from "./format.ts"

export type TimelineItem = {
  id: string
  kind: "person" | "event"
  name: string
  start: number
  end: number
  // How much Scripture says about it (verse count). Busier items win lanes,
  // so zooming out keeps Abraham and the Exodus and drops minor figures.
  weight: number
  draft: boolean
  lifetime: boolean // people: true = birth–death known; false = attested years only
  eras: string // the eras it overlaps, e.g. "Israel in Egypt, Exodus & Wilderness"
  summary?: string
  related: string[] // ids of connected items on the timeline: family, events, participants
}

export type TimelinePeriod = { id: string; name: string; start: number; end: number; when: string; summary?: string }

export function timelinePeriods(periods: Period[]): TimelinePeriod[] {
  return periods.map((p) => ({
    id: p.id,
    name: p.name,
    start: p.date.earliest,
    end: p.date.latest,
    when: formatEstimate(p.date),
    summary: summarize(p.description),
  }))
}

// Everything dated within the periods' range, heaviest first (the order lanes
// are packed in). "Lifetime of X" events are left out: they'd duplicate X's
// own bar in the people lanes. `connections` lists any record's linked ids;
// only those that are themselves on the timeline are kept.
export function timelineItems(
  people: Person[],
  events: Event[],
  periods: Period[],
  eventsOf: (personId: string) => Event[],
  connections: (id: string) => string[] = () => [],
): TimelineItem[] {
  const first = periods[0].date.earliest
  const last = periods[periods.length - 1].date.latest

  // The fields every item shares, or nothing if it's undated or out of range.
  const item = (record: Event | Person, span: Span | undefined) =>
    span && span.end >= first && span.start <= last
      ? [
          {
            id: record.id,
            ...span,
            weight: record.scriptureRefs?.length ?? 0,
            draft: record.status === "draft",
            eras: periodsOverlapping(span, periods).map((p) => p.name).join(", "),
          },
        ]
      : []

  const items = [
    ...events
      .filter((e) => !e.id.startsWith("lifetime-of-"))
      .flatMap((e) => item(e, spanOf(e.date)).map((i) => ({ ...i, kind: "event" as const, name: e.name, lifetime: false }))),
    ...people.flatMap((p) => {
      const span = personSpan(p, eventsOf(p.id))
      return item(p, span && { start: span.start, end: span.end }).map((i) => ({
        ...i,
        kind: "person" as const,
        name: label(p),
        lifetime: span!.lifetime,
        summary: summarize(p.description),
      }))
    }),
  ].sort((a, b) => b.weight - a.weight)

  const onTimeline = new Set(items.map((i) => i.id))
  return items.map((i) => ({ ...i, related: [...new Set(connections(i.id))].filter((id) => onTimeline.has(id)) }))
}

// --- Lane packing -----------------------------------------------------------

export type Placed<T> = { item: T; lane: number; x0: number; x1: number }

// Greedy packing in pixel space. Items are placed heaviest first, each into
// the first lane where its extent (mark plus label) doesn't collide; items
// that fit nowhere within `maxLanes` are dropped and counted, so zooming in
// reveals them. `extent` returns an item's [left, right] in pixels.
//
// Each lane keeps its spans sorted by position (they never overlap), so a fit
// is a binary search: fast enough to pack thousands of items per frame.
export function packLanes<T>(
  items: T[],
  weight: (item: T) => number,
  extent: (item: T) => [number, number],
  maxLanes: number,
  gap = 8,
): { placed: Placed<T>[]; hidden: number } {
  const lanes: [number, number][][] = []
  const placed: Placed<T>[] = []
  let hidden = 0

  for (const item of [...items].sort((a, b) => weight(b) - weight(a))) {
    const [x0, x1] = extent(item)
    let lane = -1
    let at = 0
    for (let l = 0; l < lanes.length && lane === -1; l++) {
      at = firstEndingAfter(lanes[l], x0 - gap)
      if (at === lanes[l].length || lanes[l][at][0] >= x1 + gap) lane = l
    }
    if (lane === -1 && lanes.length < maxLanes) [lane, at] = [lanes.push([]) - 1, 0]
    if (lane === -1) {
      hidden++
      continue
    }
    lanes[lane].splice(at, 0, [x0, x1])
    placed.push({ item, lane, x0, x1 })
  }
  return { placed, hidden }
}

// The index of the first span in a sorted lane that ends after `x`.
function firstEndingAfter(lane: [number, number][], x: number) {
  let [lo, hi] = [0, lane.length]
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (lane[mid][1] > x) hi = mid
    else lo = mid + 1
  }
  return lo
}
