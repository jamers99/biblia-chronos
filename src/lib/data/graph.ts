// An adjacency index over the edge list, built once. Each fact is stored once
// (spec), so lookups go both ways: `outgoing` follows an edge's direction,
// `incoming` walks it backwards, and `either` is for the symmetric types
// (sibling-of, partner-of, …) whose stored direction is arbitrary.

import type { Edge, EdgeType } from "./schema.ts"

export type Graph = ReturnType<typeof createGraph>

export function createGraph(edges: Edge[]) {
  const out = new Map<string, Edge[]>()
  const inc = new Map<string, Edge[]>()
  for (const e of edges) {
    if (!out.has(e.from)) out.set(e.from, [])
    if (!inc.has(e.to)) inc.set(e.to, [])
    out.get(e.from)!.push(e)
    inc.get(e.to)!.push(e)
  }

  const outgoing = (id: string, type: EdgeType): string[] =>
    (out.get(id) ?? []).filter((e) => e.type === type).map((e) => e.to)
  const incoming = (id: string, type: EdgeType): string[] =>
    (inc.get(id) ?? []).filter((e) => e.type === type).map((e) => e.from)
  const either = (id: string, type: EdgeType): string[] => [
    ...new Set([...outgoing(id, type), ...incoming(id, type)]),
  ]

  return { outgoing, incoming, either }
}
