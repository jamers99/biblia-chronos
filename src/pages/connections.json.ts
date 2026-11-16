// The links for Connections (see lib/connections.ts), one small file fetched
// when the page opens.
import { edges, events, eventsOf, peopleGroups, people, places } from "../lib/data/load.ts"
import { pack } from "../lib/connections.ts"
import { personSpan, spanOf, TIMELESS, type Span } from "../lib/chronology.ts"

// A year for each dated person and event: the middle of their span.
const dates: Record<string, number> = {}
const date = (id: string, s: Span | undefined) => s && (dates[id] = Math.round((s.start + s.end) / 2))
for (const p of people) if (!TIMELESS.has(p.id)) date(p.id, personSpan(p, eventsOf(p.id)))
for (const e of events) date(e.id, spanOf(e.date))

export const GET = () =>
  Response.json(
    pack({
      links: edges.map((e) => [e.from, e.to, e.type]),
      dates,
      places: places.map((p) => p.id),
      female: people.filter((p) => p.gender === "female").map((p) => p.id),
      closed: [...peopleGroups.map((g) => g.id), ...places.filter((p) => p.featureType === "Region").map((p) => p.id), ...TIMELESS],
    }),
  )
