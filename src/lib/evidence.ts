// The facts the site shows, as stable ids we can attach evidence to, and the
// evidence layers on top: the text match (data/evidence/matches.json), and AI
// and editor reviews (data/evidence/<batch>.json). See
// docs/data-audit-plan.md. Pure: shared by the scan, the checker, and the build.

import type { DateEstimate, Edge, EvidenceBatch, Kingdom, Period, Person } from "./data/schema.ts"
import { RULES } from "./scan.ts"

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

// The id of a fact about one record: "date:esther-becomes-queen", and for a
// reign in a kingdom, "house:kingdom-of-judah/reign-of-asa".
export const recordFact = (kind: Exclude<FactKind, Edge["type"]>, id: string) => `${kind}:${id}`

// The id of the fact a link shows: "parent-of:abraham_58>isaac_616". A
// symmetric link (a marriage) has one id whichever way round it's named.
export function edgeFact(type: Edge["type"], from: string, to: string): string {
  const [a, b] = SYMMETRIC.includes(type) && to < from ? [to, from] : [from, to]
  return `${type}:${a}>${b}`
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
    const id = edgeFact(e.type, e.from, e.to)
    facts.push(fact(e.type as FactKind, id, id, [e.from, e.to]))
  }
  for (const r of [...d.events, ...d.places, ...d.periods])
    if (r.date) facts.push(fact("date", recordFact("date", r.id), dateText(r.date), [r.id]))
  for (const p of d.people) {
    if (p.birth) facts.push(fact("birth", recordFact("birth", p.id), dateText(p.birth), [p.id]))
    if (p.death) facts.push(fact("death", recordFact("death", p.id), dateText(p.death), [p.id]))
  }
  for (const k of d.kingdoms)
    for (const r of k.reigns) {
      facts.push(fact("house", recordFact("house", `${k.id}/${r.event}`), r.house, [r.event, k.event]))
      if (r.note) facts.push(fact("note", recordFact("note", `${k.id}/${r.event}`), r.note, [r.event]))
    }
  for (const p of d.periods) if (p.lede) facts.push(fact("lede", recordFact("lede", p.id), p.lede, [p.id]))
  const seen = new Set<string>()
  return facts.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true))).sort((a, b) => (a.id < b.id ? -1 : 1))
}

export const factId = (key: string) => key.slice(0, key.lastIndexOf("@"))

// --- Evidence ----------------------------------------------------------------

// The text match: what the scan found for each fact, the verse and the rule
// that matched, [null, rule] for a fact worked out from other data, or [] for
// none (see scripts/audit-scan.ts).
export type MatchEvidence = {
  theographic: string // the upstream commit whose verse text was read
  facts: Record<string, [string | null, string] | []>
}

// Everything known about one fact, for the page that shows it.
export type FactEvidence = {
  key: string
  records: string[] // the records whose pages show the fact
  match?: { ref: string | null; rule: string }
  ai?: { model: string; on: string; agreed: boolean }
  editor?: { by: string; on: string; read: boolean; sampled?: number }
  entry?: NonNullable<EvidenceBatch["facts"]>[string]
}

export function collectEvidence(facts: Fact[], matches: MatchEvidence | undefined, batches: EvidenceBatch[]) {
  const byId = new Map<string, FactEvidence>()
  for (const f of facts) {
    const s = matches?.facts[f.key]
    byId.set(f.id, { key: f.key, records: f.records, ...(s && s.length ? { match: { ref: s[0], rule: s[1] } } : {}) })
  }
  for (const b of batches) {
    const touch = (key: string, agreed: boolean, entry?: FactEvidence["entry"]) => {
      const ev = byId.get(factId(key))
      if (!ev || ev.key !== key) return // stale or unknown: the checker reports it
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

// What a fact's "how we know" says (HowWeKnow.astro): the marker's label, the
// reviewer's note, and one line per layer (undefined where a layer hasn't
// looked yet). `short` labels a verse ("Gen 21:3").
export function explain(ev: FactEvidence, short: (ref: string) => string) {
  const { state, refs } = factStatus(ev)
  const corrected = state === "wrong" && ev.editor?.read
  const month = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
  const rule = ev.match && (RULES[ev.match.rule] ?? ev.match.rule)
  const prefix = { reading: "A reading: ", wrong: corrected ? "Corrected: " : "Flagged as wrong, for an editor to check: " }
  const { editor } = ev
  return {
    state,
    refs,
    label: {
      verse: refs.length ? short(refs[0]) : "verse",
      derived: "worked out",
      reading: "a reading",
      wrong: corrected ? "corrected" : "flagged",
      unchecked: "unchecked",
    }[state],
    note: ev.entry?.note && `${prefix[state as keyof typeof prefix] ?? ""}${ev.entry.note}`,
    match: rule && rule[0].toUpperCase() + rule.slice(1),
    ai: ev.ai && `${ev.ai.agreed ? "Agreed" : "Flagged"} (${ev.ai.model}, ${month(ev.ai.on)})`,
    editor:
      editor &&
      (editor.read
        ? `Read by ${editor.by}, ${month(editor.on)}`
        : `Batch spot-checked by ${editor.by}${editor.sampled ? ` (${Math.round(editor.sampled * 100)}%)` : ""}, ${month(editor.on)}`),
  }
}
