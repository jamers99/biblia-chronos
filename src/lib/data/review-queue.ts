// The review queue (src/pages/review/): every fact that needs a person, most
// severe first, as one list the page filters and groups in the browser (see
// src/lib/review-filter.ts). That's the facts the AI flagged as wrong, those
// it found no verse for, and its readings (interpretations the text doesn't
// state outright). A fact an editor has already given a verdict on
// (data/reviews.json) leaves the queue. Build time only; served as
// /review/queue.json.

import { allEvidence, books, kingdoms, periods, record } from "./load.ts"
import { describe, factId, factStatus, type FactEvidence, type FactKind } from "../evidence.ts"
import { parseVerse, verse } from "../scripture.ts"
import { entityUrl } from "../url.ts"
import { formatEstimate, label } from "../format.ts"
import { STATUSES, order, type Part, type QueueData, type QueueItem, type Status } from "../review-filter.ts"
import type { DateEstimate } from "./schema.ts"

// Kinds of fact, in the order the queue lists them, with a heading each.
const KINDS: Record<FactKind, string> = {
  "parent-of": "Parents",
  "partner-of": "Marriages",
  "member-of": "Tribes and groups",
  "participated-in": "People at events",
  "occurred-at": "Where events happened",
  visited: "Places people went",
  "died-at": "Where people died",
  "part-of": "Places within places",
  "alias-of": "Other names for places",
  near: "Places near each other",
  date: "Dates",
  birth: "Births",
  death: "Deaths",
  house: "Ruling houses",
  note: "Notes on reigns",
  lede: "Era summaries",
}

const nameOf = (id: string) => {
  const e = record(id)
  return { text: e ? label(e) : (periods.find((p) => p.id === id)?.name ?? id), href: e && entityUrl(e) }
}
type Dates = Partial<Record<"date" | "birth" | "death", DateEstimate>>
const dateOf = (id: string, kind: keyof Dates) => formatEstimate(((record(id) ?? periods.find((p) => p.id === id)) as Dates | undefined)?.[kind])

// The fact in words, records linked, starting with a capital.
function claim(ev: FactEvidence): Part[] {
  const parts = describe({ id: factId(ev.key), kind: ev.kind }, { kingdoms, periods }, dateOf).map((p) =>
    typeof p === "string" ? p : nameOf(p.id),
  )
  if (typeof parts[0] === "string") parts[0] = parts[0][0].toUpperCase() + parts[0].slice(1)
  return parts
}

// The book a fact is told in: its first verse, else the record's first verse.
function bookOf(refs: string[], records: string[]) {
  const first = (id: string) => (record(id) as { scriptureRefs?: { book: string }[] } | undefined)?.scriptureRefs?.[0]?.book
  return refs.map(parseVerse).find(Boolean)?.book ?? records.map(first).find(Boolean)
}

const queued = new Set<string>(STATUSES.map(([s]) => s))

export function reviewQueue(): QueueData {
  const evs = [...allEvidence().values()]
  const items: QueueItem[] = []
  for (const ev of evs) {
    const { state, refs } = factStatus(ev)
    if (ev.review || !queued.has(state)) continue
    items.push({
      key: ev.key,
      status: state as Status,
      severity: ev.entry?.severity,
      kind: ev.kind,
      claim: claim(ev),
      note: ev.entry?.note,
      refs: refs.map((r) => verse(r, books)).filter((v) => v !== undefined).map((v) => ({ label: v.long, url: v.url })),
      book: bookOf(refs, ev.records),
      subject: { id: ev.records[0], name: nameOf(ev.records[0]).text },
    })
  }
  const used = new Set(items.map((i) => i.book))
  const data = {
    kinds: Object.entries(KINDS).filter(([k]) => items.some((i) => i.kind === k)),
    books: [...books].sort((a, b) => a.order - b.order).filter((b) => used.has(b.id)).map((b): [string, string] => [b.id, b.name]),
  }
  return { ...data, items: items.sort(order(data)), reviewed: evs.filter((ev) => ev.review).length }
}
