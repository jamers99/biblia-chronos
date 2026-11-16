// Pure overrides-merge helpers, shared by the app loader (load.ts, via Vite)
// and the build-stage checker (scripts/check-data.ts, via Node fs). No IO here
// so both callers can read files their own way and agree on the result.
//
// Overrides win, matched by id (spec: data/overrides/ layered on seed at build
// time). A matching override's fields are overlaid onto the seed record (a
// shallow per-field merge, so e.g. an override can fill in just `modernName`);
// an override with a new id is added as a whole record. Edges have no single id,
// so they're keyed by from|to|type — overrides add or correct an edge, and an
// override with `"remove": true` deletes a wrong seed edge (a tombstone).

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

export type EdgeOverride = Edge & { remove?: boolean }

export function mergeEdges(seed: Edge[], overrides: EdgeOverride[]): Edge[] {
  const byKey = new Map<string, Edge>()
  for (const e of seed) byKey.set(edgeKey(e), e)
  for (const { remove, ...o } of overrides) {
    if (remove) byKey.delete(edgeKey(o))
    else byKey.set(edgeKey(o), { ...byKey.get(edgeKey(o)), ...o })
  }
  return [...byKey.values()]
}

// Tombstones that no longer match a seed edge (fixed upstream, or a typo), so
// the checker can say the override can go.
export const staleRemovals = (seed: Edge[], overrides: EdgeOverride[]): EdgeOverride[] => {
  const keys = new Set(seed.map(edgeKey))
  return overrides.filter((o) => o.remove && !keys.has(edgeKey(o)))
}

// Override fields that now say what the seed says (upstream made the same fix,
// or an override restated it), so the checker can say they can go. A record's
// `all` is true when every field but its id is redundant: the whole override
// can go.
export function redundantFields<T extends { id: string }>(
  seed: T[],
  overrides: (Partial<T> & { id: string })[],
): { id: string; fields: string[]; all: boolean }[] {
  const byId = new Map(seed.map((r) => [r.id, r as Record<string, unknown>]))
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  return overrides.flatMap((o) => {
    const s = byId.get(o.id)
    if (!s) return [] // a whole new record
    const keys = Object.keys(o).filter((k) => k !== "id")
    const fields = keys.filter((k) => same((o as Record<string, unknown>)[k], s[k]))
    return fields.length ? [{ id: o.id, fields, all: fields.length === keys.length }] : []
  })
}

// Override edges the seed now has as they are (only who's credited differs),
// so the checker can say they can go.
export const redundantEdges = (seed: Edge[], overrides: EdgeOverride[]): EdgeOverride[] => {
  const byKey = new Map(seed.map((e) => [edgeKey(e), e]))
  const rest = ({ source: _, ...e }: Edge) => JSON.stringify(Object.entries(e).sort())
  return overrides.filter((o) => {
    const s = byKey.get(edgeKey(o))
    return !o.remove && s !== undefined && rest(o) === rest(s)
  })
}
