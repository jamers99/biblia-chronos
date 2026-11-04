// Site-wide search: the index (built at build time, served as /search.json)
// and the ranking (run in the browser, see SiteSearch.astro). Kept pure so
// it's testable.

import type { Event, Period, Person, PeopleGroup, Place } from "./data/schema.ts"
import { personSpan, type Span } from "./chronology.ts"
import { formatEstimate, formatSpan, label } from "./format.ts"

export type SearchEntry = {
  id: string
  kind: "person" | "place" | "event" | "peopleGroup" | "period"
  name: string
  hint: string // what tells it apart in a list: its dates, or what kind of place
  also?: string[] // other names it goes by (a person's plain name, a place's alt and modern names)
  weight: number // how much Scripture says about it; busier records rank first
  draft?: true
}

export function searchIndex(
  data: { people: Person[]; places: Place[]; events: Event[]; groups: PeopleGroup[]; periods: Period[] },
  eventsOf: (personId: string) => Event[],
): SearchEntry[] {
  const weight = (r: { scriptureRefs?: unknown[] }) => r.scriptureRefs?.length ?? 0
  const draft = (r: { status: string }) => (r.status === "draft" ? { draft: true as const } : {})
  const also = (names: (string | undefined)[], name: string) => {
    const rest = [...new Set(names)].filter((n): n is string => !!n && n !== name)
    return rest.length ? { also: rest } : {}
  }
  const span = (s: Span | undefined) => (s ? formatSpan(s.start, s.end) : "")
  return [
    // Eras first: they're few, and the way into the story.
    ...data.periods.map((p) => ({ id: p.id, kind: "period" as const, name: p.name, hint: formatEstimate(p.date), weight: 1e6 })),
    ...data.people.map((p) => ({
      id: p.id,
      kind: "person" as const,
      name: label(p),
      hint: span(personSpan(p, eventsOf(p.id))),
      ...also([p.name], label(p)),
      weight: weight(p),
      ...draft(p),
    })),
    ...data.places.map((p) => ({
      id: p.id,
      kind: "place" as const,
      name: p.name,
      hint: [p.featureSubType ?? p.featureType, p.modernName && `today ${p.modernName}`].filter(Boolean).join(" · "),
      ...also([...(p.altNames ?? []), p.modernName], p.name),
      weight: weight(p),
      ...draft(p),
    })),
    ...data.events.map((e) => ({
      id: e.id,
      kind: "event" as const,
      name: e.name,
      hint: e.date ? formatEstimate(e.date) : "",
      weight: weight(e),
      ...draft(e),
    })),
    ...data.groups.map((g) => ({ id: g.id, kind: "peopleGroup" as const, name: g.name, hint: "", weight: weight(g), ...draft(g) })),
  ]
}

// --- Ranking ------------------------------------------------------------------

// Case- and accent-insensitive.
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()

export type Prepared = { entry: SearchEntry; name: string; also: string[] }
export const prepare = (entries: SearchEntry[]): Prepared[] =>
  entries.map((entry) => ({ entry, name: fold(entry.name), also: (entry.also ?? []).map(fold) }))

// How well a name matches: the whole name, its start, the start of a word in
// it, or anywhere in it (lower is better).
function score(name: string, q: string): number {
  if (name === q) return 0
  if (name.startsWith(q)) return 1
  for (let i = name.indexOf(q); i > 0; i = name.indexOf(q, i + 1)) if (!/[a-z0-9]/.test(name[i - 1])) return 2
  return name.includes(q) ? 3 : Infinity
}

// The best matches for a query: by how well they match (a record's own name
// beats one it also goes by), then by weight.
export function search(index: Prepared[], query: string, limit = 8, keep = (_: SearchEntry) => true): SearchEntry[] {
  const q = fold(query)
  if (!q) return []
  const hits: { entry: SearchEntry; score: number }[] = []
  for (const p of index) {
    const s = Math.min(score(p.name, q), ...p.also.map((a) => score(a, q) + 0.5))
    if (s < Infinity && keep(p.entry)) hits.push({ entry: p.entry, score: s })
  }
  return hits
    .sort((a, b) => a.score - b.score || b.entry.weight - a.entry.weight || a.entry.name.length - b.entry.name.length)
    .slice(0, limit)
    .map((h) => h.entry)
}

export const KIND_LABEL: Record<SearchEntry["kind"], string> = {
  person: "Person",
  place: "Place",
  event: "Event",
  peopleGroup: "Group",
  period: "Era",
}
