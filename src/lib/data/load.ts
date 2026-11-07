// Loads the canonical data (seed + overrides) and exposes typed collections and
// the graph. Runs at build time (SSG) only, reading
// data/seed/ directly — none of this ships to the browser. Islands get the
// small slices they need as props.

import type { Person, Place, Event, PeopleGroup, Period, Kingdom, Book, Edge, Source } from "./schema.ts"
import { mergeEntities, mergeEdges } from "./merge.ts"
import { createGraph } from "./graph.ts"
import { kingdomTrack } from "../kingdoms.ts"
import { collectEvidence, enumerateFacts, type BatchEvidence, type Fact, type FactEvidence, type ScriptEvidence } from "../evidence.ts"

// JSON imports are resolved by Vite at build time (relative to this file).
import peopleData from "../../../data/seed/people.json"
import placesData from "../../../data/seed/places.json"
import eventsData from "../../../data/seed/events.json"
import peopleGroupsData from "../../../data/seed/peopleGroups.json"
import booksData from "../../../data/seed/books.json"
import edgesData from "../../../data/seed/edges.json"
import sourcesData from "../../../data/sources.json"

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

// The audit's evidence layers (docs/data-audit-plan.md): the script's verse
// matches (data/evidence/script.json) and AI/editor review batches (the other
// files there), keyed to the facts the pages show.
const evidenceModules = import.meta.glob("../../../data/evidence/*.json", { eager: true }) as Record<string, { default: unknown }>
const evidenceFile = (path: string) => path.slice(path.lastIndexOf("/") + 1)
const scriptEvidence = Object.entries(evidenceModules).find(([path]) => evidenceFile(path) === "script.json")?.[1]
  .default as ScriptEvidence | undefined
const batches = Object.entries(evidenceModules)
  .filter(([path]) => evidenceFile(path) !== "script.json")
  .map(([path, mod]) => [evidenceFile(path).replace(/\.json$/, ""), mod.default as BatchEvidence] as [string, BatchEvidence])

export const facts = enumerateFacts({ people, places, events, edges, periods, kingdoms })
const evidence = collectEvidence(facts, scriptEvidence, batches)
const factsByRecord = new Map<string, Fact[]>()
for (const f of facts) for (const r of f.records) factsByRecord.set(r, [...(factsByRecord.get(r) ?? []), f])

// The fact id for a link either way round ("near", shown from both ends),
// whichever way the data stores it.
export const factBetween = (type: string, a: string, b: string) =>
  evidence.has(`${type}:${a}>${b}`) ? `${type}:${a}>${b}` : evidence.has(`${type}:${b}>${a}`) ? `${type}:${b}>${a}` : undefined

// What's known about one fact, by id ("parent-of:abraham_58>isaac_616").
export const evidenceFor = (factId: string): FactEvidence | undefined => evidence.get(factId)
// The facts a record's page shows, with their evidence.
export const factsOf = (recordId: string) =>
  (factsByRecord.get(recordId) ?? []).map((f) => ({ fact: f, evidence: evidence.get(f.id)! }))
