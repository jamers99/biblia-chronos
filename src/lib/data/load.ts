// Loads the canonical data (seed + overrides) and exposes typed collections and
// the graph. Runs at build time (SSG) only, reading
// data/seed/ directly — none of this ships to the browser. Islands get the
// small slices they need as props.

import type { Person, Place, Event, PeopleGroup, Period, Kingdom, Book, Edge, EvidenceBatch, Reviews, Source } from "./schema.ts"
import { mergeEntities, mergeEdges } from "./merge.ts"
import { createGraph } from "./graph.ts"
import { kingdomTrack } from "../kingdoms.ts"
import { collectEvidence, edgeFact, enumerateFacts, tally, type FactEvidence, type MatchEvidence } from "../evidence.ts"

// JSON imports are resolved by Vite at build time (relative to this file).
import peopleData from "../../../data/seed/people.json"
import placesData from "../../../data/seed/places.json"
import eventsData from "../../../data/seed/events.json"
import peopleGroupsData from "../../../data/seed/peopleGroups.json"
import booksData from "../../../data/seed/books.json"
import edgesData from "../../../data/seed/edges.json"
import sourcesData from "../../../data/sources.json"
import reviewsData from "../../../data/reviews.json"

// Hand-authored corrections layered on top of seed (overrides win, by id).
// The directory may be empty or absent — the glob simply yields nothing then.
const overrideModules = import.meta.glob("../../../data/overrides/*.json", {
  eager: true,
}) as Record<string, { default: { id: string }[] }>

const override = (name: string): any[] => {
  for (const [path, mod] of Object.entries(overrideModules))
    if (path.endsWith(`/${name}`)) return mod.default ?? []
  return []
}

export const people = mergeEntities(peopleData as Person[], override("people.json"))
export const places = mergeEntities(placesData as Place[], override("places.json"))
export const events = mergeEntities(eventsData as Event[], override("events.json"))
export const peopleGroups = mergeEntities(peopleGroupsData as PeopleGroup[], override("peopleGroups.json"))
export const books = mergeEntities(booksData as Book[], override("books.json"))
export const edges = mergeEdges(edgesData as Edge[], override("edges.json") as Edge[])
export const sources = sourcesData as Source[]

// Periods are hand-authored only (no seed), sorted into story order.
export const periods = (override("periods.json") as Period[]).sort(
  (a, b) => a.date.earliest - b.date.earliest,
)

// Kingdoms and their lines of kings, hand-authored only, in file order.
export const kingdoms = override("kingdoms.json") as Kingdom[]

export const graph = createGraph(edges)

export type Entity = Person | Place | Event | PeopleGroup

const byId = new Map<string, Entity>(
  [...people, ...places, ...events, ...peopleGroups].map((e) => [e.id, e]),
)
const sourceById = new Map(sources.map((s) => [s.id, s]))

export const source = (id: string): Source | undefined => sourceById.get(id)

// One record by id, of any kind.
export const record = (id: string): Entity | undefined => byId.get(id)

// Resolve ids to records of one kind, dropping any that don't resolve.
export function resolve<K extends Entity["kind"]>(ids: string[], kind: K) {
  return ids
    .map((id) => byId.get(id))
    .filter((e): e is Extract<Entity, { kind: K }> => e?.kind === kind)
}

// The kingdoms track (see src/lib/kingdoms.ts), for the timeline and the
// kingdom and reign pages.
export const track = kingdomTrack(kingdoms, events, (id) => graph.incoming(id, "participated-in")[0])

// The dated (or undated) events a person took part in.
export const eventsOf = (personId: string) => resolve(graph.outgoing(personId, "participated-in"), "event")

// --- Evidence ---------------------------------------------------------------

// The audit's evidence layers (docs/data-audit-plan.md): the text match
// (data/evidence/matches.json) and AI/editor review batches (the other files
// there), keyed to the facts the pages show.
const evidenceFiles = import.meta.glob("../../../data/evidence/*.json", { eager: true, import: "default" })
const isMatches = (path: string) => path.endsWith("/matches.json")
const evidence = collectEvidence(
  enumerateFacts({ people, places, events, edges, periods, kingdoms }),
  Object.entries(evidenceFiles).find(([path]) => isMatches(path))?.[1] as MatchEvidence | undefined,
  Object.entries(evidenceFiles).filter(([path]) => !isMatches(path)).map(([, batch]) => batch as EvidenceBatch),
  reviewsData as Reviews, // editors' verdicts, from review mode (data/reviews.json)
)
const evidenceByRecord = new Map<string, FactEvidence[]>()
for (const ev of evidence.values())
  for (const r of ev.records) evidenceByRecord.set(r, [...(evidenceByRecord.get(r) ?? []), ev])

// Every fact and what's known about it, for the review queue.
export const allEvidence = () => evidence

// What's known about one fact, by id ("parent-of:abraham_58>isaac_616").
export const evidenceFor = (factId: string): FactEvidence | undefined => evidence.get(factId)

// A link stored either way round ("near"), as whichever fact the data has.
export const factBetween = (type: Edge["type"], a: string, b: string) =>
  [edgeFact(type, a, b), edgeFact(type, b, a)].find((id) => evidence.has(id))

// How far a record's facts have been checked, by layer.
export const tallyOf = (recordId: string) => tally(evidenceByRecord.get(recordId) ?? [])
