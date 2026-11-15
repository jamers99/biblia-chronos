// The links for Connections (see lib/connections.ts), one small file fetched
// when the page opens.
import { edges, events, eventsOf, peopleGroups, people, places } from "../lib/data/load.ts"
import { connectionsData } from "../lib/connections.ts"
import { personSpan, spanOf } from "../lib/chronology.ts"

// A year for each dated person and event: the middle of their span.
const spans = new Map([
  ...people.map((p) => [p.id, personSpan(p, eventsOf(p.id))] as const),
  ...events.map((e) => [e.id, spanOf(e.date)] as const),
])
function dateOf(id: string) {
  const span = spans.get(id)
  return span && Math.round((span.start + span.end) / 2)
}

export const GET = () => Response.json(connectionsData({ edges, people, places, groups: peopleGroups }, dateOf))
