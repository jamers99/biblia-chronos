// The facts the site shows, as stable ids we can attach evidence to, and the
// evidence layers on top: the text match (data/evidence/matches.json), and AI
// reviews (data/evidence/<batch>.json), and editors' verdicts (data/reviews.json). See
// docs/data-audit-plan.md. Pure: shared by the scan, the checker, and the build.

import type { DateEstimate, Edge, EvidenceBatch, Kingdom, Period, Person, Review, Reviews } from "./data/schema.ts"
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

// --- A fact in words ----------------------------------------------------------

// A fact as a sentence a reviewer can check, for the AI's batch file
// (scripts/audit-batch.ts) and the review queue. Each record it names is left
// as { id } for the caller to render, and `when` gives a date's words.
export type Phrase = (string | { id: string })[]
export type DateKind = "date" | "birth" | "death"
export function describe(
  f: Pick<Fact, "id" | "kind">,
  d: { kingdoms: Pick<Kingdom, "id" | "name" | "reigns">[]; periods: Pick<Period, "id" | "lede">[] },
  when: (id: string, kind: DateKind) => string,
): Phrase {
  const body = f.id.slice(f.id.indexOf(":") + 1)
  const [a, b] = body.split(">").map((id) => ({ id }))
  const reign = () => {
    const [kingdom, event] = body.split("/")
    const k = d.kingdoms.find((k) => k.id === kingdom)!
    return { k, r: k.reigns.find((r) => r.event === event)! }
  }
  switch (f.kind) {
    case "parent-of": return [a, " is a parent of ", b]
    case "partner-of": return [a, " and ", b, " were married"]
    case "member-of": return [a, " belongs to the group ", b]
    case "participated-in": return [a, " took part in the event ", b]
    case "occurred-at": return ["the event ", a, " happened at ", b]
    case "visited": return [a, " was at (visited) ", b]
    case "died-at": return [a, " died at ", b]
    case "alias-of": return ["the place ", a, " is the same place as ", b]
    case "part-of": return ["the place ", a, " is within ", b]
    case "near": return ["the place ", a, " is near ", b]
    case "date": return [{ id: body }, ` is dated ${when(body, "date")}`]
    case "birth": return [{ id: body }, ` was born in ${when(body, "birth")}`]
    case "death": return [{ id: body }, ` died in ${when(body, "death")}`]
    case "house": { const { k, r } = reign(); return [`in ${k.name}, the reign `, { id: r.event }, ` belongs to the ruling house "${r.house}"`] }
    case "note": { const { k, r } = reign(); return ["the note on ", { id: r.event }, ` in ${k.name}: "${r.note}"`] }
    case "lede": return ["the summary of the era ", { id: body }, `: "${d.periods.find((p) => p.id === body)!.lede}"`]
  }
}

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
  kind: FactKind
  records: string[] // the records whose pages show the fact
  match?: { ref: string | null; rule: string }
  ai?: { model: string; on: string; agreed: boolean }
  editor?: { by: string; on: string; read: boolean; sampled?: number }
  entry?: NonNullable<EvidenceBatch["facts"]>[string]
  review?: Review // an editor's verdict on this fact itself
}

export function collectEvidence(facts: Fact[], matches: MatchEvidence | undefined, batches: EvidenceBatch[], reviews: Reviews = {}) {
  const byId = new Map<string, FactEvidence>()
  for (const f of facts) {
    const s = matches?.facts[f.key]
    byId.set(f.id, { key: f.key, kind: f.kind, records: f.records, ...(s && s.length ? { match: { ref: s[0], rule: s[1] } } : {}) })
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
    for (const [key, entry] of Object.entries(b.facts ?? {})) touch(key, entry.kind !== "wrong" && entry.kind !== "unsupported", entry)
  }
  // An editor's own verdict on a fact is a read, whatever the batch says.
  for (const [key, review] of Object.entries(reviews)) {
    const ev = byId.get(factId(key))
    if (!ev || ev.key !== key) continue // stale or unknown: the checker reports it
    ev.review = review
    ev.editor = { by: review.by, on: review.on, read: true }
  }
  return byId
}

// --- For display ------------------------------------------------------------------

export type FactState = "verse" | "derived" | "reading" | "wrong" | "unsupported" | "unchecked" | "confirmed"

// Where a fact stands, and the verses that support it: a reviewer's own refs
// first, else the text match. An editor's verdict wins over the AI's: "wrong"
// marks it wrong, and "right" clears a flag (or "no verse found", or
// "unchecked") to "confirmed". "unsure" changes nothing.
export function factStatus(ev: FactEvidence | undefined): { state: FactState; refs: string[] } {
  const base = aiStatus(ev)
  const verdict = ev?.review?.verdict
  if (verdict === "wrong") return { state: "wrong", refs: base.refs }
  if (verdict === "right" && (base.state === "wrong" || base.state === "unsupported" || base.state === "unchecked"))
    return { state: "confirmed", refs: base.state === "wrong" ? [] : base.refs }
  return base
}

function aiStatus(ev: FactEvidence | undefined): { state: FactState; refs: string[] } {
  const entry = ev?.entry
  if (entry?.kind === "unsupported") return { state: "unsupported", refs: [] }
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
  const { review } = ev
  // A batch an editor read whose "wrong" stands was fixed in the overrides. A
  // verdict of "wrong" on the fact itself is still waiting for that fix.
  const corrected = state === "wrong" && ev.editor?.read && !review
  const month = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
  const rule = ev.match && (RULES[ev.match.rule] ?? ev.match.rule)
  const prefix = {
    reading: "A reading: ",
    wrong: corrected
      ? "Corrected: "
      : review
        ? ""
        : `Flagged as wrong${ev.entry?.severity ? ` (${ev.entry.severity} severity)` : ""}, for an editor to check: `,
    confirmed: "The AI said: ",
  }
  const { editor } = ev
  return {
    state,
    refs,
    label: {
      verse: refs.length ? short(refs[0]) : "verse",
      derived: "worked out",
      reading: "a reading",
      wrong: corrected ? "corrected" : review ? "wrong" : "flagged",
      unsupported: "no verse found",
      unchecked: "unchecked",
      confirmed: "confirmed",
    }[state],
    note: ev.entry?.note && `${prefix[state as keyof typeof prefix] ?? ""}${ev.entry.note}`,
    reviewNote: review?.note && `${review.by}: ${review.note}`,
    match: rule && rule[0].toUpperCase() + rule.slice(1),
    ai: ev.ai && `${ev.ai.agreed ? "Agreed" : "Flagged"} (${ev.ai.model}, ${month(ev.ai.on)})`,
    editor: review
      ? `${{ right: "Confirmed", wrong: "Judged wrong", unsure: "Not sure" }[review.verdict]} by ${review.by}, ${month(review.on)}`
      : editor &&
      (editor.read
        ? `Read by ${editor.by}, ${month(editor.on)}`
        : `Batch spot-checked by ${editor.by}${editor.sampled ? ` (${Math.round(editor.sampled * 100)}%)` : ""}, ${month(editor.on)}`),
  }
}
