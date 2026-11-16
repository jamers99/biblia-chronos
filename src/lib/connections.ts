// Connections: the shortest chain of links between any two records, as
// "Ruth, mother of Obed, father of Jesse, father of David". The links are
// gathered at build time into one small file (/connections.json) and walked in
// the browser (see pages/connections/). Pure, so it's testable.
//
// The plain shortest path cheats: almost anyone is two steps apart through
// "Genealogy of Jesus", "Tribe of Judah", or Jerusalem. So the search is
// weighted: a family link is cheap, belonging to a group is dear, and passing
// through a record costs more the more links it has. Groups, regions, God, and
// the Holy Spirit are a last resort, passed through only when there's no other
// way (they can be either end like anything else).
//
// Places are timeless, so a chain could hop from Abraham at Hebron to David at
// Hebron, nine centuries on. So stepping through a place costs more the further
// apart in time the records on either side of it are.

import type { EdgeType } from "./data/schema.ts"

// --- The data -------------------------------------------------------------------

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
const TYPES = Object.keys(COST) as EdgeType[]
const FAMILY = new Set<EdgeType>(["parent-of", "partner-of", "sibling-of", "half-sibling-of"])
// Years apart, across a place, that cost as much as one more step: about a
// generation, so hopping centuries at a place costs about as much as walking
// the generations between.
const YEARS_PER_STEP = 20
// The cost of passing through a closed record: more than any other way.
const LAST_RESORT = 1000

// What the chains are found in, readably: links, a year for each dated person
// and event, the places, the women (for "mother of" rather than "father of"),
// and the records passed through only as a last resort.
export type Connections = {
  links: [from: string, to: string, type: EdgeType][]
  dates: Record<string, number>
  places: string[]
  female: string[]
  closed: string[]
}

// The same, packed for the wire (/connections.json): each record's id once, and
// everything else pointing to it by its place in `ids`.
export type Packed = {
  ids: string[]
  links: [from: number, to: number, type: number][]
  dates: (number | null)[]
  places: number[]
  female: number[]
  closed: number[]
}

export function pack(c: Connections): Packed {
  const ids = [...new Set(c.links.flatMap(([from, to]) => [from, to]))]
  const at = new Map(ids.map((id, i) => [id, i]))
  const known = (list: string[]) => list.flatMap((id) => at.get(id) ?? [])
  return {
    ids,
    links: c.links.map(([from, to, type]) => [at.get(from)!, at.get(to)!, TYPES.indexOf(type)]),
    dates: ids.map((id) => c.dates[id] ?? null),
    places: known(c.places),
    female: known(c.female),
    closed: known(c.closed),
  }
}

// --- Finding a chain ------------------------------------------------------------

// One step of a chain: a record, and how it's linked to the one before (none for
// the first). `forward` is whether the link was stored from the one before.
export type Step = { id: string; type?: EdgeType; forward?: boolean }

// A chain to show, and what it is: the closest, the closest through family
// alone, or another way round.
export type Route = { kind: "closest" | "family" | "other"; steps: Step[] }

type Arc = { to: string; type: EdgeType; forward: boolean }

export function createRouter({ ids, links, dates: years, places: where, female, closed: last }: Packed) {
  const arcs = new Map<string, Arc[]>()
  const add = (id: string, arc: Arc) => arcs.get(id)?.push(arc) ?? arcs.set(id, [arc])
  for (const [from, to, type] of links) {
    add(ids[from], { to: ids[to], type: TYPES[type], forward: true })
    add(ids[to], { to: ids[from], type: TYPES[type], forward: false })
  }
  const closed = new Set(last.map((i) => ids[i]))
  const places = new Set(where.map((i) => ids[i]))
  const dates = new Map(ids.flatMap((id, i) => (years[i] === null ? [] : [[id, years[i]] as const])))
  const women = new Set(female.map((i) => ids[i]))
  const toll = (id: string) => Math.log2((arcs.get(id)?.length ?? 0) + 1)

  // The cheapest chain from one record to another, or undefined if there's none.
  // `avoid`: records the chain mustn't pass through (to find another way).
  function route(from: string, to: string, { family = false, avoid = new Set<string>() } = {}): Step[] | undefined {
    if (from === to || !arcs.has(from) || !arcs.has(to)) return
    const cost = new Map([[from, 0]])
    const prev = new Map<string, [string, Arc]>()
    // On the way to each record: the year of the last dated record (its own,
    // if it has one), and whether a place has been passed since. The next
    // dated record after a place is priced by how far apart in time they are.
    const when = new Map([[from, dates.get(from)]])
    const crossed = new Map<string, boolean>()
    const heap = new Heap()
    heap.push(0, from)
    for (let next = heap.pop(); next; next = heap.pop()) {
      const [c, id] = next
      if (id === to) break
      if (c > cost.get(id)! || (id !== from && avoid.has(id))) continue
      const before = when.get(id)
      const across = crossed.get(id) || places.has(id)
      for (const arc of arcs.get(id)!) {
        if (family && !FAMILY.has(arc.type)) continue
        const year = dates.get(arc.to)
        const gap = across && before !== undefined && year !== undefined ? Math.abs(year - before) : 0
        const through = arc.to === to ? 0 : toll(arc.to) + (closed.has(arc.to) ? LAST_RESORT : 0)
        const nc = c + COST[arc.type] + through + gap / YEARS_PER_STEP
        if (nc < (cost.get(arc.to) ?? Infinity)) {
          cost.set(arc.to, nc)
          prev.set(arc.to, [id, arc])
          when.set(arc.to, year ?? before)
          crossed.set(arc.to, year === undefined && across)
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
  // or else another way through none of the same records (nor a last resort),
  // if there's one about as short: a long detour isn't another way, just a
  // worse one.
  function routes(from: string, to: string): Route[] {
    const best = route(from, to)
    if (!best) return []
    const found: Route[] = [{ kind: "closest", steps: best }]
    if (best.some((s) => s.type && !FAMILY.has(s.type))) {
      const line = route(from, to, { family: true })
      if (line) return [...found, { kind: "family", steps: line }]
    }
    const between = best.slice(1, -1).map((s) => s.id)
    const other = between.length ? route(from, to, { avoid: new Set([...between, ...closed]) }) : undefined
    return other && other.length <= best.length + 2 ? [...found, { kind: "other", steps: other }] : found
  }

  // How a step's record relates to the one before it in the chain.
  const linkOf = (steps: Step[], i: number) => linkLabel(steps[i].type!, steps[i].forward!, women.has(steps[i - 1].id))

  return { routes, linkOf, linked: (id: string) => arcs.has(id) }
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
