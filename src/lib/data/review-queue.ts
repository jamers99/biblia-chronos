// The review queue (src/pages/review/): every fact that needs a person, as one
// flat list the page filters, groups and sorts in the browser (see
// src/lib/review-filter.ts). That's the facts the AI flagged as wrong, those it
// found no verse for, and its readings (interpretations the text doesn't state
// outright). A fact an editor has already given a verdict on
// (data/reviews.json) leaves the queue. Build time only; served as
// /review/queue.json.

import { allEvidence, books, kingdoms, periods, record } from "./load.ts"
import { explain, factId, type FactEvidence, type FactKind } from "../evidence.ts"
import { parseVerse, verse } from "../scripture.ts"
import { entityUrl } from "../url.ts"
import { formatEstimate, label } from "../format.ts"
import type { QueueData, QueueItem, Part, Status } from "../review-filter.ts"
import type { Person } from "./schema.ts"

// Kinds of fact, in the order the queue lists them, with a heading each.
const KINDS: [FactKind, string][] = [
  ["parent-of", "Parents"],
  ["partner-of", "Marriages"],
  ["member-of", "Tribes and groups"],
  ["participated-in", "People at events"],
  ["occurred-at", "Where events happened"],
  ["visited", "Places people went"],
  ["died-at", "Where people died"],
  ["part-of", "Places within places"],
  ["alias-of", "Other names for places"],
  ["near", "Places near each other"],
  ["date", "Dates"],
  ["birth", "Births"],
  ["death", "Deaths"],
  ["house", "Ruling houses"],
  ["note", "Notes on reigns"],
  ["lede", "Era summaries"],
]

const nameOf = (id: string) => {
  const e = record(id)
  return e ? label(e) : (periods.find((p) => p.id === id)?.name ?? kingdoms.find((k) => k.id === id)?.name ?? id)
}
function name(id: string): Part {
  const e = record(id)
  return e ? { text: label(e), href: entityUrl(e) } : { text: nameOf(id) }
}

// The fact as a sentence, with its records linked.
function claim(id: string, kind: FactKind): Part[] {
  const body = id.slice(id.indexOf(":") + 1)
  const [a, b] = body.split(">")
  const reign = () => {
    const [k, event] = body.split("/")
    const kingdom = kingdoms.find((x) => x.id === k)
    return { kingdom, reign: kingdom?.reigns.find((r) => r.event === event), event }
  }
  const dated = (rid: string) => (record(rid) ?? periods.find((p) => p.id === rid)) as { date?: Person["birth"] } | undefined
  switch (kind) {
    case "parent-of": return [name(a), " is a parent of ", name(b)]
    case "partner-of": return [name(a), " and ", name(b), " were married"]
    case "member-of": return [name(a), " belongs to ", name(b)]
    case "participated-in": return [name(a), " took part in ", name(b)]
    case "occurred-at": return [name(a), " happened at ", name(b)]
    case "visited": return [name(a), " was at ", name(b)]
    case "died-at": return [name(a), " died at ", name(b)]
    case "part-of": return [name(a), " is within ", name(b)]
    case "alias-of": return [name(a), " is another name for ", name(b)]
    case "near": return [name(a), " is near ", name(b)]
    case "date": return [name(body), `: ${formatEstimate(dated(body)?.date)}`]
    case "birth": return [name(body), ` was born ${formatEstimate((record(body) as Person)?.birth)}`]
    case "death": return [name(body), ` died ${formatEstimate((record(body) as Person)?.death)}`]
    case "house": { const r = reign(); return [name(r.event), ` belongs to the ${r.reign?.house ?? "?"} in ${r.kingdom?.name ?? "?"}`] }
    case "note": { const r = reign(); return [name(r.event), `: “${r.reign?.note ?? ""}”`] }
    case "lede": return [name(body), `: “${periods.find((p) => p.id === body)?.lede ?? ""}”`]
  }
}

// The book a fact is told in: its first verse, else the first verse of the
// record it's about.
function bookOf(refs: string[], records: string[]): string | undefined {
  const fromRef = refs.map(parseVerse).find(Boolean)?.book
  if (fromRef) return fromRef
  for (const id of records) {
    const refs = (record(id) as { scriptureRefs?: { book: string }[] } | undefined)?.scriptureRefs
    if (refs?.length) return refs[0].book
  }
}

const STATUS: Partial<Record<string, Status>> = { wrong: "flagged", unsupported: "no-verse", reading: "reading" }

function item(ev: FactEvidence, status: Status): QueueItem {
  const id = factId(ev.key)
  const kind = id.slice(0, id.indexOf(":")) as FactKind
  const how = explain(ev, (r) => r)
  // The record the fact is about: the person, the event, or the place first named.
  const subject = ev.records[0]
  return {
    key: ev.key,
    status,
    ...(ev.entry?.severity ? { severity: ev.entry.severity } : {}),
    kind,
    claim: claim(id, kind),
    ...(ev.entry?.note ? { note: ev.entry.note } : {}),
    refs: how.refs.map((r) => verse(r, books)).filter((v) => v !== undefined).map((v) => ({ label: v.long, url: v.url })),
    ...(bookOf(how.refs, ev.records) ? { book: bookOf(how.refs, ev.records) } : {}),
    subject: { id: subject, name: nameOf(subject) },
  }
}

let built: QueueData | undefined
export function reviewQueue(): QueueData {
  if (built) return built
  const evs = [...allEvidence().values()]
  const items: QueueItem[] = []
  for (const ev of evs) {
    const status = !ev.review && STATUS[ev.entry?.kind ?? "verse"]
    if (status) items.push(item(ev, status))
  }
  const used = new Set(items.map((i) => i.book))
  built = {
    items,
    kinds: KINDS.filter(([k]) => items.some((i) => i.kind === k)),
    books: [...books].sort((a, b) => a.order - b.order).filter((b) => used.has(b.id)).map((b) => [b.id, b.name]),
    reviewed: evs.filter((ev) => ev.review).length,
  }
  return built
}
