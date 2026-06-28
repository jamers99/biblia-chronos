// Loads the canonical seed data and exposes typed accessors plus a thin graph
// helper. Runs at build time (SSG) in Node, reading data/seed/ directly — no
// database ships to the browser. Overrides merging (data/overrides/) and the
// full graph index land with the build stage; this is the minimal seam.

import type { Person, Place, Event, PeopleGroup, Book, Edge, EdgeType } from "./schema.ts"
import { mergeEntities, mergeEdges } from "./merge.ts"

// JSON imports are resolved by Vite at build time (relative to this file) and
// inlined into the SSG build — they never ship to the browser.
import peopleData from "../../../data/seed/people.json"
import placesData from "../../../data/seed/places.json"
import eventsData from "../../../data/seed/events.json"
import peopleGroupsData from "../../../data/seed/peopleGroups.json"
import booksData from "../../../data/seed/books.json"
import edgesData from "../../../data/seed/edges.json"

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

const peopleById = new Map(people.map((p) => [p.id, p]))
export const personById = (id: string): Person | undefined => peopleById.get(id)

// Minimal graph access: the targets of a given edge type leaving `from`.
// (The runtime builds the reverse direction itself, so we store each fact once.)
export function targets(from: string, type: EdgeType): string[] {
  return edges.filter((e) => e.from === from && e.type === type).map((e) => e.to)
}
