// The links for Connections (see lib/connections.ts), one small file fetched
// when the page opens.
import { books, edges, evidenceFor, peopleGroups, people, places } from "../lib/data/load.ts"
import { connectionsData } from "../lib/connections.ts"
import { edgeFact, factStatus } from "../lib/evidence.ts"
import type { Edge } from "../lib/data/schema.ts"

// The verse a link cites, unless it's been found wanting.
function verseOf(e: Edge) {
  const { state, refs } = factStatus(evidenceFor(edgeFact(e.type, e.from, e.to)))
  return state === "wrong" || state === "unsupported" ? undefined : refs[0]
}

export const GET = () =>
  Response.json(connectionsData({ edges, people, places, groups: peopleGroups, books }, verseOf))
