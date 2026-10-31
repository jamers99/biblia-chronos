// Genealogy walks over the parent-of graph. Pure: callers pass in how to find a
// person's parents, so this works the same at build time and in tests.

import type { Person } from "./data/schema.ts"

// The line of descent back to the earliest known ancestor: the father at each
// step (the mother where no father is recorded), oldest first, ending with the
// person themselves. Stops on a cycle, since upstream data isn't guaranteed
// acyclic.
export function lineage(person: Person, parentsOf: (id: string) => Person[]): Person[] {
  const line = [person]
  const seen = new Set([person.id])
  let current = person
  for (;;) {
    const parents = parentsOf(current.id)
    const next = parents.find((p) => p.gender === "male") ?? parents[0]
    if (!next || seen.has(next.id)) break
    line.unshift(next)
    seen.add(next.id)
    current = next
  }
  return line
}
