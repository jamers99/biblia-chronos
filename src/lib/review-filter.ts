// The review queue's filters, groups and order (ReviewQueue.svelte), kept
// pure so they're tested. The queue's data comes from
// src/lib/data/review-queue.ts as /review/queue.json.

export type Status = "flagged" | "no-verse" | "reading"
export type Severity = "high" | "medium" | "low"
export type Part = string | { text: string; href?: string }
export type QueueItem = {
  key: string // id@hash
  status: Status
  severity?: Severity // for "flagged" and "no-verse"
  kind: string // parent-of, date, …
  claim: Part[]
  note?: string // the AI's
  refs: { label: string; url: string }[]
  book?: string // the book it's told in, e.g. "gen"
  subject: { id: string; name: string } // the record it's about
}
export type QueueData = {
  items: QueueItem[]
  kinds: [string, string][] // [kind, heading], in order
  books: [string, string][] // [id, name], in canonical order
  reviewed: number // facts with an editor's verdict, out of the queue
}

export const STATUSES: [Status, string][] = [
  ["flagged", "Flagged as wrong"],
  ["no-verse", "No verse found"],
  ["reading", "Readings"],
]
export const SEVERITIES: [Severity, string][] = [
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
]
export const GROUPS = [
  ["severity", "Severity"],
  ["kind", "Kind of fact"],
  ["book", "Book"],
  ["subject", "Person, place or event"],
  ["none", "Nothing"],
] as const
export type Group = (typeof GROUPS)[number][0]

export type Filters = {
  status: Status[]
  severity: Severity[] // empty: any. Readings have none, so any choice here hides them
  kind: string // "" for all
  book: string // "" for all
  q: string
  group: Group
  hide: boolean // hide facts with a verdict waiting to be submitted
}
export const DEFAULTS: Filters = { status: ["flagged"], severity: [], kind: "", book: "", q: "", group: "severity", hide: false }

const textOf = (i: QueueItem) =>
  [...i.claim.map((p) => (typeof p === "string" ? p : p.text)), i.note ?? "", ...i.refs.map((r) => r.label), i.subject.name]
    .join(" ")
    .toLowerCase()

type Facet = keyof Pick<Filters, "status" | "severity" | "kind" | "book">
// Whether an item passes every filter but `skip` (to count a facet's options).
function passes(i: QueueItem, f: Filters, pending: Set<string>, skip?: Facet) {
  if (skip !== "status" && !f.status.includes(i.status)) return false
  if (skip !== "severity" && f.severity.length && !(i.severity && f.severity.includes(i.severity))) return false
  if (skip !== "kind" && f.kind && i.kind !== f.kind) return false
  if (skip !== "book" && f.book && i.book !== f.book) return false
  if (f.hide && pending.has(i.key)) return false
  if (f.q) {
    const text = textOf(i)
    if (!f.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => text.includes(w))) return false
  }
  return true
}

export const filterItems = (items: QueueItem[], f: Filters, pending = new Set<string>()) =>
  items.filter((i) => passes(i, f, pending))

// How many items each option of a facet would show, given the other filters.
export function facets(items: QueueItem[], f: Filters, pending = new Set<string>()) {
  const count = (facet: Facet, value: (i: QueueItem) => string | undefined) => {
    const out = new Map<string, number>()
    for (const i of items) {
      const v = value(i)
      if (v !== undefined && passes(i, f, pending, facet)) out.set(v, (out.get(v) ?? 0) + 1)
    }
    return out
  }
  return {
    status: count("status", (i) => i.status),
    severity: count("severity", (i) => i.severity),
    kind: count("kind", (i) => i.kind),
    book: count("book", (i) => i.book),
  }
}

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }
const STATUS_RANK: Record<Status, number> = { flagged: 0, "no-verse": 1, reading: 2 }

// Most severe first; then flags before readings, then in Bible order, by kind.
export function order(data: Pick<QueueData, "kinds" | "books">) {
  const book = new Map(data.books.map(([id], n) => [id, n]))
  const kind = new Map(data.kinds.map(([k], n) => [k, n]))
  const at = (m: Map<string, number>, k?: string) => (k !== undefined && m.has(k) ? m.get(k)! : m.size)
  return (a: QueueItem, b: QueueItem) =>
    (SEVERITY_RANK[a.severity ?? ""] ?? 3) - (SEVERITY_RANK[b.severity ?? ""] ?? 3) ||
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    at(book, a.book) - at(book, b.book) ||
    at(kind, a.kind) - at(kind, b.kind) ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
}

export type ItemGroup = { id: string; title: string; items: QueueItem[] }

export function groupItems(items: QueueItem[], group: Group, data: Pick<QueueData, "kinds" | "books">): ItemGroup[] {
  const sorted = [...items].sort(order(data))
  if (group === "none") return [{ id: "all", title: "", items: sorted }]
  const keyOf: Record<Exclude<Group, "none">, (i: QueueItem) => string> = {
    severity: (i) => i.severity ?? (i.status === "reading" ? "reading" : "unrated"),
    kind: (i) => i.kind,
    book: (i) => i.book ?? "",
    subject: (i) => i.subject.id,
  }
  const titles = new Map<string, string>([
    ...SEVERITIES.map(([s, t]) => [s, `${t} severity`] as [string, string]),
    ["reading", "Readings"],
    ["unrated", "Not rated"],
    ...data.kinds,
    ...data.books,
    ["", "Book unknown"],
  ])
  const groups = new Map<string, ItemGroup>()
  for (const i of sorted) {
    const id = keyOf[group](i)
    if (!groups.has(id)) groups.set(id, { id, title: group === "subject" ? i.subject.name : (titles.get(id) ?? id), items: [] })
    groups.get(id)!.items.push(i)
  }
  const list = [...groups.values()]
  // Groups follow their first item (so severity, kind and book keep their own
  // order), except people and places: the biggest first.
  return group === "subject" ? list.sort((a, b) => b.items.length - a.items.length || a.title.localeCompare(b.title)) : list
}

// Filters in the page's query string, so a view can be shared ("look at these").
export function toQuery(f: Filters): string {
  const p = new URLSearchParams()
  if (f.status.join() !== DEFAULTS.status.join()) p.set("status", f.status.join(","))
  if (f.severity.length) p.set("severity", f.severity.join(","))
  if (f.kind) p.set("kind", f.kind)
  if (f.book) p.set("book", f.book)
  if (f.q) p.set("q", f.q)
  if (f.group !== DEFAULTS.group) p.set("group", f.group)
  if (f.hide) p.set("hide", "1")
  const s = p.toString()
  return s ? `?${s}` : ""
}

export function fromQuery(search: string): Filters {
  const p = new URLSearchParams(search)
  const list = <T extends string>(name: string, allowed: readonly (readonly [T, string])[], fallback: T[]) => {
    const raw = p.get(name)
    if (raw === null) return fallback
    const ok = new Set(allowed.map(([v]) => v))
    return raw.split(",").filter((v): v is T => ok.has(v as T))
  }
  const group = p.get("group")
  return {
    status: list("status", STATUSES, DEFAULTS.status),
    severity: list("severity", SEVERITIES, []),
    kind: p.get("kind") ?? "",
    book: p.get("book") ?? "",
    q: p.get("q") ?? "",
    group: GROUPS.some(([g]) => g === group) ? (group as Group) : DEFAULTS.group,
    hide: p.get("hide") === "1",
  }
}
