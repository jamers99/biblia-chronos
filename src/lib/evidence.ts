// The facts the site shows, as stable ids we can attach evidence to, and the
// evidence layers on top: the text match (data/evidence/matches.json), and AI
// and editor reviews (data/evidence/<batch>.json). See
// docs/data-audit-plan.md. Pure: shared by the scan, the checker, and the build.

import type { DateEstimate, Edge, EvidenceBatch, Kingdom, Period, Person } from "./data/schema.ts"

// --- Fact ids ---------------------------------------------------------------

// A fact id says what is claimed ("parent-of:abraham_58>isaac_616"); its hash
// covers the data that claim shows (the date's numbers, a note's text), so a
// review is tied to `id@hash` and goes stale if the data changes underneath it.
export type FactKind =
  | Exclude<Edge["type"], "sibling-of" | "half-sibling-of">
  | "date"
  | "birth"
  | "death"
  | "house"
  | "note"
  | "lede"

export type Fact = {
  id: string // "parent-of:abraham_58>isaac_616"
  key: string // id@hash
  kind: FactKind
  records: string[] // the records whose pages show it
}

// Siblings aren't checked on their own: they follow from shared parents.
const DERIVED: Edge["type"][] = ["sibling-of", "half-sibling-of"]
const SYMMETRIC: Edge["type"][] = ["partner-of"]

// FNV-1a, 32 bits, as 6 hex digits: a change detector, not a security hash.
export function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 6)
}

const dateText = (d: DateEstimate) => JSON.stringify([d.earliest ?? null, d.latest ?? null, d.display ?? null])

const fact = (kind: FactKind, id: string, shown: string, records: string[]): Fact => ({
  id,
  key: `${id}@${hash(shown)}`,
  kind,
  records,
})

export function edgeFactId(e: Pick<Edge, "type" | "from" | "to">): string {
  const [a, b] = SYMMETRIC.includes(e.type) && e.to < e.from ? [e.to, e.from] : [e.from, e.to]
  return `${e.type}:${a}>${b}`
}

// Only what the facts are made of, so callers can pass validated or raw rows.
type Dated = { id: string; date?: DateEstimate }
type Data = {
  people: Pick<Person, "id" | "birth" | "death">[]
  places: Dated[]
  events: Dated[]
  edges: Edge[]
  periods: (Dated & Pick<Period, "lede">)[]
  kingdoms: Pick<Kingdom, "id" | "event" | "reigns">[]
}

// Every checkable fact, in a stable order.
export function enumerateFacts(d: Data): Fact[] {
  const facts: Fact[] = []
  for (const e of d.edges) {
    if (DERIVED.includes(e.type)) continue
    const id = edgeFactId(e)
    facts.push(fact(e.type as FactKind, id, id, [e.from, e.to]))
  }
  for (const r of [...d.events, ...d.places, ...d.periods])
    if (r.date) facts.push(fact("date", `date:${r.id}`, dateText(r.date), [r.id]))
  for (const p of d.people) {
    if (p.birth) facts.push(fact("birth", `birth:${p.id}`, dateText(p.birth), [p.id]))
    if (p.death) facts.push(fact("death", `death:${p.id}`, dateText(p.death), [p.id]))
  }
  for (const k of d.kingdoms)
    for (const r of k.reigns) {
      facts.push(fact("house", `house:${k.id}/${r.event}`, r.house, [r.event, k.event]))
      if (r.note) facts.push(fact("note", `note:${k.id}/${r.event}`, r.note, [r.event]))
    }
  for (const p of d.periods) if (p.lede) facts.push(fact("lede", `lede:${p.id}`, p.lede, [p.id]))
  const seen = new Set<string>()
  return facts.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true))).sort((a, b) => (a.id < b.id ? -1 : 1))
}

export const factId = (key: string) => key.slice(0, key.lastIndexOf("@"))

// The records whose passages tell a fact, most telling first: a child's
// birth tells of the parent, an event of who was there, a town's own verse of
// the region it's in. Used to file a fact under a stretch of Scripture.
export function subjects(f: Fact): string[] {
  const [a, b] = f.records
  switch (f.kind) {
    case "parent-of":
    case "participated-in":
      return [b, a]
    default:
      return f.records
  }
}

// --- Verse refs ---------------------------------------------------------------

// Evidence cites single verses as "gen.25.19": book id, chapter, verse.
export type VerseRef = { book: string; chapter: number; verse: number }

export const verseKey = (r: VerseRef) => `${r.book}.${r.chapter}.${r.verse}`

export function parseVerse(key: string): VerseRef | undefined {
  const m = /^([1-3]?[a-z]+)\.(\d+)\.(\d+)$/.exec(key)
  return m ? { book: m[1], chapter: Number(m[2]), verse: Number(m[3]) } : undefined
}

// --- Evidence ----------------------------------------------------------------

// The text match: what the scan found for each fact, the verse and the rule
// that matched, [null, rule] for a fact worked out from other data, or [] for
// none (see scripts/audit-scan.ts).
export type MatchEvidence = {
  theographic: string // the upstream commit whose verse text was read
  facts: Record<string, [string | null, string] | []>
}

// One AI/editor batch file (schema in data/schema.ts).
export type BatchEvidence = EvidenceBatch

// Everything known about one fact, for the page that shows it.
export type FactEvidence = {
  key: string
  match?: { ref: string | null; rule: string }
  ai?: { model: string; on: string; agreed: boolean }
  editor?: { by: string; on: string; read: boolean; sampled?: number }
  entry?: NonNullable<BatchEvidence["facts"]>[string]
  batch?: string
}

export function collectEvidence(facts: Fact[], matches: MatchEvidence | undefined, batches: [string, BatchEvidence][]) {
  const byId = new Map<string, FactEvidence>()
  for (const f of facts) {
    const s = matches?.facts[f.key]
    byId.set(f.id, { key: f.key, ...(s && s.length ? { match: { ref: s[0], rule: s[1] } } : {}) })
  }
  for (const [name, b] of batches) {
    const touch = (key: string, agreed: boolean, entry?: FactEvidence["entry"]) => {
      const ev = byId.get(factId(key))
      if (!ev || ev.key !== key) return // stale or unknown: the checker reports it
      ev.batch = name
      if (b.ai) ev.ai = { ...b.ai, agreed }
      if (entry) ev.entry = entry
      if (b.editor) {
        const read = entry ? !b.editor.read || b.editor.read.includes(key) : (b.editor.read?.includes(key) ?? false)
        ev.editor = { by: b.editor.by, on: b.editor.on, read, sampled: b.editor.sampled }
      }
    }
    for (const key of b.agreed ?? []) touch(key, true)
    for (const [key, entry] of Object.entries(b.facts ?? {})) touch(key, entry.kind !== "wrong", entry)
  }
  return byId
}

// How a rule reads to a person, for the "how we know" note.
export const RULES: Record<string, string> = {
  "son-of": "the verse calls one the son or daughter of the other",
  possessive: "the verse calls one the other's son or daughter",
  begat: "the verse says one begat the other",
  bare: "the verse says she bare him",
  "named-child": "the verse names the child at birth",
  "mother-named": "the verse names his mother",
  "sons-of-list": "the verse lists the child among the sons of the parent",
  wife: "the verse calls her his wife",
  "took-to-wife": "the verse says he took her to wife",
  "tribe-of": "the verse names the tribe",
  descent: "worked out from recorded parents back to the tribe's founder",
  listed: "named in the passage that lists them",
  "in-passage": "named in the event's passage (not necessarily as taking part)",
  went: "the verse has them going to or staying at the place",
  died: "the verse has them dying or buried there",
  "same-place": "the verse says one place is the other",
  "place-in": "the verse places one within the other",
  "place-near": "the verse puts one place near the other",
  "territory-list": "listed under the tribe's heading in the list of its towns",
  "born-to": "the verse says the child was born to the parent",
  "son-chain": "the verse's chain of names makes the child the son of the one before",
  "reign-length": "the verse gives the length of the reign, matching the dates",
  "age-at-fatherhood": "the verse gives the father's age at the birth, matching the dates",
  "age-at-death": "the verse gives the age at death, matching the dates",
}

// --- For display ------------------------------------------------------------------

export type FactState = "verse" | "derived" | "reading" | "wrong" | "unchecked"

// Where a fact stands, and the verses that support it: a reviewer's own refs
// first, else the text match.
export function factStatus(ev: FactEvidence | undefined): { state: FactState; refs: string[] } {
  const entry = ev?.entry
  const refs = entry?.refs?.length ? entry.refs : ev?.match?.ref ? [ev.match.ref] : []
  if (entry?.kind === "wrong") return { state: "wrong", refs }
  if (entry?.kind === "reading") return { state: "reading", refs }
  if (refs.length) return { state: "verse", refs }
  if (ev?.match || entry?.sources?.length) return { state: "derived", refs }
  return { state: "unchecked", refs }
}

// A record's facts by layer, kept apart: an AI check never counts as a person's.
export function tally(evs: (FactEvidence | undefined)[]) {
  const t = { facts: evs.length, matched: 0, ai: 0, editor: 0, unchecked: 0 }
  for (const ev of evs) {
    if (ev?.match) t.matched++
    if (ev?.ai) t.ai++
    if (ev?.editor?.read) t.editor++
    if (!ev?.match && !ev?.ai && !ev?.editor) t.unchecked++
  }
  return t
}
