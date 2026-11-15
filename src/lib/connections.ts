// Connections: the shortest chain of links between any two records, as
// "Ruth, mother of Obed, father of Jesse, father of David". The links are
// gathered at build time into one small file (/connections.json) and walked in
// the browser (see pages/connections/). Pure, so it's testable.
//
// The plain shortest path cheats: almost anyone is two steps apart through
// "Genealogy of Jesus", "Tribe of Judah", or Jerusalem. So the search is
// weighted: a family link is cheap, belonging to a group is dear, and passing
// through a record costs more the more links it has. Groups, regions, God, and
// the Holy Spirit are never passed through at all (they can still be either end).
//
// Places are timeless, so a chain could hop from Abraham at Hebron to David at
// Hebron, nine centuries on. So stepping through something with no date of its
// own (a place, someone undated) costs more the further apart in time the
// records on either side of it are.

import type { Edge, EdgeType, PeopleGroup, Person, Place } from "./data/schema.ts"

// --- The data (build time) ------------------------------------------------------

export type Link = [from: string, to: string, type: EdgeType]

export type ConnectionsData = {
  links: Link[]
  dates: Record<string, number> // a year for each dated person and event
  female: string[] // for "mother of" rather than "father of"
  closed: string[] // records a chain never passes through
}

// People too bound up with everyone to make a chain mean anything.
const EVERYWHERE = ["god_1324", "holy_spirit_7400"]

export function connectionsData(
  d: { edges: Edge[]; people: Person[]; places: Place[]; groups: PeopleGroup[] },
  dateOf: (id: string) => number | undefined,
): ConnectionsData {
  const dates: Record<string, number> = {}
  for (const id of new Set(d.edges.flatMap((e) => [e.from, e.to]))) {
    const year = dateOf(id)
    if (year !== undefined) dates[id] = year
  }
  return {
    links: d.edges.map((e) => [e.from, e.to, e.type]),
    dates,
    female: d.people.filter((p) => p.gender === "female").map((p) => p.id),
    closed: [...d.groups.map((g) => g.id), ...d.places.filter((p) => p.featureType === "Region").map((p) => p.id), ...EVERYWHERE],
  }
}

// --- Finding a chain (browser) ------------------------------------------------

const COST: Record<EdgeType, number> = {
  "parent-of": 1,
  "partner-of": 1,
  "sibling-of": 1.5,
  "half-sibling-of": 1.5,
  "participated-in": 1.5,
  near: 1.5,
  "occurred-at": 2,
  visited: 2,
  "died-at": 2,
  "part-of": 2,
  "member-of": 4,
  "alias-of": 0.1, // the same place under another name: barely a step
}
const FAMILY = new Set<EdgeType>(["parent-of", "partner-of", "sibling-of", "half-sibling-of"])
// Years apart, across something undated, that cost as much as one more step.
const YEARS_PER_STEP = 50

// One step of a chain: a record, and how it's linked to the one before (none for
// the first). `forward` is whether the link was stored from the one before.
export type Step = { id: string; type?: EdgeType; forward?: boolean }

// A chain to show, and what it is: the closest, the closest through family
// alone, or another way round.
export type Route = { kind: "closest" | "family" | "other"; steps: Step[] }

type Arc = { to: string; type: EdgeType; forward: boolean }

export function createRouter(data: ConnectionsData) {
  const arcs = new Map<string, Arc[]>()
  const add = (id: string, arc: Arc) => arcs.get(id)?.push(arc) ?? arcs.set(id, [arc])
  for (const [from, to, type] of data.links) {
    add(from, { to, type, forward: true })
    add(to, { to: from, type, forward: false })
  }
  const closed = new Set(data.closed)
  const dates = new Map(Object.entries(data.dates))
  const toll = (id: string) => Math.log2((arcs.get(id)?.length ?? 0) + 1)

  // The cheapest chain from one record to another, or undefined if there's none.
  // `avoid`: records the chain mustn't pass through (to find another way).
  function route(from: string, to: string, { family = false, avoid = new Set<string>() } = {}): Step[] | undefined {
    if (from === to || !arcs.has(from) || !arcs.has(to)) return
    const cost = new Map([[from, 0]])
    const prev = new Map<string, [string, Arc]>()
    // The year of the last dated record on the way to each record (its own, if
    // it has one), to price the step out of an undated one.
    const when = new Map([[from, dates.get(from)]])
    const heap = new Heap()
    heap.push(0, from)
    for (let next = heap.pop(); next; next = heap.pop()) {
      const [c, id] = next
      if (id === to) break
      if (c > cost.get(id)! || (id !== from && (closed.has(id) || avoid.has(id)))) continue
      const before = when.get(id)
      for (const arc of arcs.get(id)!) {
        if (family && !FAMILY.has(arc.type)) continue
        const year = dates.get(arc.to)
        const gap = !dates.has(id) && before !== undefined && year !== undefined ? Math.abs(year - before) : 0
        const nc = c + COST[arc.type] + (arc.to === to ? 0 : toll(arc.to)) + gap / YEARS_PER_STEP
        if (nc < (cost.get(arc.to) ?? Infinity)) {
          cost.set(arc.to, nc)
          prev.set(arc.to, [id, arc])
          when.set(arc.to, year ?? before)
          heap.push(nc, arc.to)
        }
      }
    }
    if (!prev.has(to)) return
    const steps: Step[] = []
    for (let id = to; id !== from; ) {
      const [back, { type, forward }] = prev.get(id)!
      steps.unshift({ id, type, forward })
      id = back
    }
    return [{ id: from }, ...steps]
  }

  // The closest chain; then the family line, if the closest isn't one already;
  // or else another way through none of the same records, if there's one about
  // as short (a long detour isn't another way, just a worse one).
  function routes(from: string, to: string): Route[] {
    const best = route(from, to)
    if (!best) return []
    const found: Route[] = [{ kind: "closest", steps: best }]
    if (best.some((s) => s.type && !FAMILY.has(s.type))) {
      const line = route(from, to, { family: true })
      if (line) return [...found, { kind: "family", steps: line }]
    }
    const between = new Set(best.slice(1, -1).map((s) => s.id))
    const other = between.size ? route(from, to, { avoid: between }) : undefined
    return other && other.length <= best.length + 2 ? [...found, { kind: "other", steps: other }] : found
  }

  return { routes, linked: (id: string) => arcs.has(id) }
}

// A small binary min-heap of [cost, id].
class Heap {
  private items: [number, string][] = []
  push(cost: number, id: string) {
    const a = this.items
    a.push([cost, id])
    for (let i = a.length - 1, p; i > 0 && a[(p = (i - 1) >> 1)][0] > a[i][0]; i = p) [a[i], a[p]] = [a[p], a[i]]
  }
  pop(): [number, string] | undefined {
    const a = this.items
    const top = a[0]
    const last = a.pop()
    if (a.length && last) {
      a[0] = last
      for (let i = 0; ; ) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l][0] < a[m][0]) m = l
        if (r < a.length && a[r][0] < a[m][0]) m = r
        if (m === i) break
        ;[a[i], a[m]] = [a[m], a[i]]
        i = m
      }
    }
    return top
  }
}

// --- Saying it ----------------------------------------------------------------

// How a step's record relates to the one before, read down the chain: "Ruth,
// mother of Obed". `female`: whether the record before it is a woman.
export function linkLabel(type: EdgeType, forward: boolean, female: boolean): string {
  const words = LABEL[type][forward ? 0 : 1]
  return typeof words === "string" ? words : words[female ? 1 : 0]
}

// [read along the stored link, read against it]; family words by gender.
type Words = string | [man: string, woman: string]
const LABEL: Record<EdgeType, [Words, Words]> = {
  "parent-of": [
    ["father of", "mother of"],
    ["son of", "daughter of"],
  ],
  "sibling-of": [
    ["brother of", "sister of"],
    ["brother of", "sister of"],
  ],
  "half-sibling-of": [
    ["half-brother of", "half-sister of"],
    ["half-brother of", "half-sister of"],
  ],
  "partner-of": [
    ["husband of", "wife of"],
    ["husband of", "wife of"],
  ],
  "member-of": ["one of", "including"],
  "participated-in": ["took part in", "with"],
  "occurred-at": ["at", "the scene of"],
  "died-at": ["died at", "place of death of"],
  visited: ["visited", "visited by"],
  "part-of": ["in", "containing"],
  near: ["near", "near"],
  "alias-of": ["also called", "also called"],
}
