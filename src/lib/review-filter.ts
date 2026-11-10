// The review queue's filters, groups and order (ReviewQueue.svelte), kept
// pure so they're tested. The queue's data comes from
// src/lib/data/review-queue.ts as /review/queue.json, already in order.

import type { EvidenceBatch } from "./data/schema.ts"

export type Status = "wrong" | "unsupported" | "reading" // a fact's state (src/lib/evidence.ts)
export type Severity = NonNullable<NonNullable<EvidenceBatch["facts"]>[string]["severity"]>
export type Part = string | { text: string; href?: string }
export type QueueItem = {
  key: string // id@hash
  status: Status
  severity?: Severity // for "wrong" and "unsupported"
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
  ["wrong", "Flagged as wrong"],
  ["unsupported", "No verse found"],
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
export const DEFAULTS: Filters = { status: ["wrong"], severity: [], kind: "", book: "", q: "", group: "severity", hide: false }

// What a search looks through, worked out once per item.
const texts = new WeakMap<QueueItem, string>()
const textOf = (i: QueueItem) => {
  let t = texts.get(i)
  if (t === undefined)
    texts.set(i, (t = [...i.claim.map((p) => (typeof p === "string" ? p : p.text)), i.note, ...i.refs.map((r) => r.label)].join(" ").toLowerCase()))
  return t
}

type Facet = "status" | "severity" | "kind" | "book"
// The facets an item fails, and whether it fails anything else.
function fails(i: QueueItem, f: Filters, words: string[], pending: Set<string>) {
  const out: Facet[] = []
  if (!f.status.includes(i.status)) out.push("status")
  if (f.severity.length && !(i.severity && f.severity.includes(i.severity))) out.push("severity")
  if (f.kind && i.kind !== f.kind) out.push("kind")
  if (f.book && i.book !== f.book) out.push("book")
  const other = (f.hide && pending.has(i.key)) || !words.every((w) => textOf(i).includes(w))
  return { out, other }
}
const wordsOf = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean)

export function filterItems(items: QueueItem[], f: Filters, pending = new Set<string>()) {
  const words = wordsOf(f.q)
  return items.filter((i) => {
    const { out, other } = fails(i, f, words, pending)
    return !out.length && !other
  })
}

// How many items each option of a facet would show, given the other filters:
// an item counts toward a facet if it fails nothing else.
export function facets(items: QueueItem[], f: Filters, pending = new Set<string>()) {
  const words = wordsOf(f.q)
  const counts = { status: new Map<string, number>(), severity: new Map<string, number>(), kind: new Map<string, number>(), book: new Map<string, number>() }
  for (const i of items) {
    const { out, other } = fails(i, f, words, pending)
    if (other || out.length > 1) continue
    for (const facet of ["status", "severity", "kind", "book"] as const) {
      const v = i[facet]
      if (v !== undefined && (!out.length || out[0] === facet)) counts[facet].set(v, (counts[facet].get(v) ?? 0) + 1)
    }
  }
  return counts
}

// Most severe first; then flags before readings, then in Bible order, by kind.
export function order(data: Pick<QueueData, "kinds" | "books">) {
  const rank = (list: readonly (readonly [string, string])[]) => {
    const at = new Map(list.map(([v], n) => [v, n]))
    return (v?: string) => at.get(v ?? "") ?? list.length
  }
  const [severity, status, book, kind] = [rank(SEVERITIES), rank(STATUSES), rank(data.books), rank(data.kinds)]
  return (a: QueueItem, b: QueueItem) =>
    severity(a.severity) - severity(b.severity) ||
    status(a.status) - status(b.status) ||
    book(a.book) - book(b.book) ||
    kind(a.kind) - kind(b.kind) ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
}

export type ItemGroup = { id: string; title: string; items: QueueItem[] }

// Groups of items, which arrive in order (see `order`). Groups follow their
// first item, so severity, kind and book keep their own order; people and
// places go biggest first.
export function groupItems(items: QueueItem[], group: Group, data: Pick<QueueData, "kinds" | "books">): ItemGroup[] {
  if (group === "none") return [{ id: "all", title: "", items }]
  const keyOf: Record<Exclude<Group, "none">, (i: QueueItem) => string> = {
    severity: (i) => i.severity ?? i.status,
    kind: (i) => i.kind,
    book: (i) => i.book ?? "",
    subject: (i) => i.subject.id,
  }
  const titles = new Map<string, string>([
    ...SEVERITIES.map(([s, t]): [string, string] => [s, `${t} severity`]),
    ...STATUSES,
    ...data.kinds,
    ...data.books,
    ["", "Book unknown"],
  ])
  const groups = new Map<string, ItemGroup>()
  for (const i of items) {
    const id = keyOf[group](i)
    if (!groups.has(id)) groups.set(id, { id, title: group === "subject" ? i.subject.name : (titles.get(id) ?? id), items: [] })
    groups.get(id)!.items.push(i)
  }
  const list = [...groups.values()]
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
    return raw === null ? fallback : raw.split(",").filter((v): v is T => allowed.some(([a]) => a === v))
  }
  const group = GROUPS.find(([g]) => g === p.get("group"))?.[0]
  return {
    status: list("status", STATUSES, DEFAULTS.status),
    severity: list("severity", SEVERITIES, []),
    kind: p.get("kind") ?? "",
    book: p.get("book") ?? "",
    q: p.get("q") ?? "",
    group: group ?? DEFAULTS.group,
    hide: p.get("hide") === "1",
  }
}
