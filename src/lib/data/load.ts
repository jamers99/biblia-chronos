// Loads the canonical data (seed + overrides) and exposes typed collections and
// the graph. Runs at build time (SSG) only, reading
// data/seed/ directly — none of this ships to the browser. Islands get the
// small slices they need as props.

import type { Person, Place, Event, PeopleGroup, Period, Book, Edge, Source } from "./schema.ts"
import { mergeEntities, mergeEdges } from "./merge.ts"
import { createGraph } from "./graph.ts"

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

// The dated (or undated) events a person took part in.
export const eventsOf = (personId: string) => resolve(graph.outgoing(personId, "participated-in"), "event")
