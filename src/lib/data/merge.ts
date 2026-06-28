// Pure overrides-merge helpers, shared by the app loader (load.ts, via Vite)
// and the build-stage checker (scripts/check-data.ts, via Node fs). No IO here
// so both callers can read files their own way and agree on the result.
//
// Overrides win, matched by id (spec: data/overrides/ layered on seed at build
// time). A matching override's fields are overlaid onto the seed record (a
// shallow per-field merge, so e.g. an override can fill in just `modernName`);
// an override with a new id is added as a whole record. Edges have no single id,
// so they're keyed by from|to|type — overrides add or correct an edge but cannot
// delete a seed edge (a tombstone mechanism is out of scope for now).

import type { Edge } from "./schema.ts"

export function mergeEntities<T extends { id: string }>(
  seed: T[],
  overrides: (Partial<T> & { id: string })[],
): T[] {
  const byId = new Map<string, T>()
  for (const r of seed) byId.set(r.id, r)
  for (const o of overrides) {
    const existing = byId.get(o.id)
    byId.set(o.id, (existing ? { ...existing, ...o } : o) as T)
  }
  return [...byId.values()]
}

const edgeKey = (e: Pick<Edge, "from" | "to" | "type">) => `${e.from}|${e.to}|${e.type}`

export function mergeEdges(seed: Edge[], overrides: Edge[]): Edge[] {
  const byKey = new Map<string, Edge>()
  for (const e of seed) byKey.set(edgeKey(e), e)
  for (const o of overrides) byKey.set(edgeKey(o), { ...byKey.get(edgeKey(o)), ...o })
  return [...byKey.values()]
}
