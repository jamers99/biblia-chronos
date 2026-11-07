// Prepares one AI review batch (docs/data-audit-plan.md, step 3): the KJV text
// of a passage and every fact that lives there, each with what the text match
// found, written to audit/batches/<name>.md for the reviewer to work from.
//
//   npm run audit:batch -- <name> <passage>[,<passage>…]
//   npm run audit:batch -- esther esth.1-10
//   npm run audit:batch -- kingdoms --kind house,note
//   npm run audit:batch -- esther --stale
//
// A fact lives in the passage of its first supporting verse: the text match's
// match if it has one, else the first verse of the record it's about (the
// child, the event, the reign). Facts already reviewed in another batch file
// are left out, so each fact lives in one batch.
//
// --stale lists the reviews in data/evidence/<name>.json that no longer match
// the data (a re-import or an override changed what the fact shows), with the
// old verdict, for re-checking in place: the reviewer replaces each old key
// with the new one and updates the entry.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { mergeEntities, mergeEdges } from "../src/lib/data/merge.ts"
import type { Book, Edge, Event, Kingdom, Period, Person, Place, PeopleGroup } from "../src/lib/data/schema.ts"
import { enumerateFacts, factId, subjects, verseKey, RULES, type Fact, type MatchEvidence } from "../src/lib/evidence.ts"

const root = join(import.meta.dirname, "..")
const [name, spec = "", ...rest] = process.argv.slice(2)
const kindFlag = rest[0] === "--kind" ? rest[1] : spec === "--kind" ? rest[0] : undefined
const staleMode = spec === "--stale"
if (!name) {
  console.error("usage: audit:batch -- <name> <book.chapter-chapter>[,…] | --kind house,note,lede")
  process.exit(1)
}
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"))
const readOpt = (path: string) => (existsSync(join(root, path)) ? read(path) : [])
const merged = <T extends { id: string }>(n: string): T[] => mergeEntities(read(`data/seed/${n}`), readOpt(`data/overrides/${n}`))

const people = merged<Person>("people.json")
const places = merged<Place>("places.json")
const events = merged<Event>("events.json")
const groups = merged<PeopleGroup>("peopleGroups.json")
const books = merged<Book>("books.json")
const edges: Edge[] = mergeEdges(read("data/seed/edges.json"), readOpt("data/overrides/edges.json"))
const periods: Period[] = readOpt("data/overrides/periods.json")
const kingdoms: Kingdom[] = readOpt("data/overrides/kingdoms.json")
const matches = read("data/evidence/matches.json") as MatchEvidence

const bookByOsis = new Map(books.map((b) => [b.osis, b]))
const text = new Map<string, string>()
for (const r of read("data/vendor/theographic/verses.json") as { fields: { osisRef: string; verseText: string } }[]) {
  const [osis, c, v] = r.fields.osisRef.split(".")
  const b = bookByOsis.get(osis)
  if (b) text.set(`${b.id}.${c}.${v}`, r.fields.verseText)
}

type Rec = { id: string; name: string; kind?: string; displayTitle?: string; scriptureRefs?: { book: string; chapter: number; verse: number }[]; date?: unknown; description?: string }
const byId = new Map<string, Rec>([...people, ...places, ...events, ...groups, ...periods].map((r) => [r.id, r as Rec]))
const nameOf = (id: string) => {
  const r = byId.get(id)
  return r ? `${r.displayTitle ?? r.name} [${id}]` : id
}

// "esth.1-10" → book esth, chapters 1..10. "neh.12" → just chapter 12.
const passages = spec && !spec.startsWith("--") ? spec.split(",").map((p) => {
  const m = /^([1-3]?[a-z]+)\.(\d+)(?:-(\d+))?$/.exec(p)
  if (!m) throw new Error(`bad passage "${p}"`)
  return { book: m[1], from: Number(m[2]), to: Number(m[3] ?? m[2]) }
}) : []
const inPassage = (key: string) => {
  const [b, c] = key.split(".")
  return passages.some((p) => p.book === b && Number(c) >= p.from && Number(c) <= p.to)
}

// Already reviewed elsewhere.
const evidenceDir = join(root, "data", "evidence")
const reviewed = new Set<string>()
for (const f of readdirSync(evidenceDir).filter((f) => f.endsWith(".json") && f !== "matches.json" && f !== `${name}.json`)) {
  const b = JSON.parse(readFileSync(join(evidenceDir, f), "utf8"))
  for (const k of [...(b.agreed ?? []), ...Object.keys(b.facts ?? {})]) reviewed.add(factId(k))
}

const facts = enumerateFacts({ people, places, events, edges, periods, kingdoms })
const home = (f: Fact): string | undefined => {
  const s = matches.facts[f.key]
  if (s?.[0]) return s[0]
  for (const id of subjects(f)) {
    const ref = byId.get(id)?.scriptureRefs?.[0]
    if (ref) return verseKey(ref)
  }
  return undefined
}
const kinds = kindFlag?.split(",")
// --stale: this batch's reviews whose key no longer matches the fact.
const own: { agreed?: string[]; facts?: Record<string, { refs?: string[]; note?: string; kind?: string }> } =
  existsSync(join(evidenceDir, `${name}.json`)) ? JSON.parse(readFileSync(join(evidenceDir, `${name}.json`), "utf8")) : {}
const ownKeys = new Map([...(own.agreed ?? []), ...Object.keys(own.facts ?? {})].map((k) => [factId(k), k]))
const staleOld = new Map<string, string>() // fact id -> the old key reviewed
for (const f of facts) if (ownKeys.has(f.id) && ownKeys.get(f.id) !== f.key) staleOld.set(f.id, ownKeys.get(f.id)!)
const gone = [...ownKeys].filter(([id]) => !facts.some((f) => f.id === id)).map(([, k]) => k)
const chosen = staleMode ? facts.filter((f) => staleOld.has(f.id)) : facts.filter((f) => !reviewed.has(f.id) && (kinds ? kinds.includes(f.kind) : (() => {
  const h = home(f)
  return h !== undefined && inPassage(h)
})()))

// A fact as a sentence a reviewer can check.
const kingdomOf = new Map<string, { k: Kingdom; r: Kingdom["reigns"][number] }>(
  kingdoms.flatMap((k) => k.reigns.map((r) => [`${k.id}/${r.event}`, { k, r }] as const)),
)
function describe(f: Fact): string {
  const body = f.id.slice(f.id.indexOf(":") + 1)
  const [a, b] = body.split(">")
  const date = (id: string) => JSON.stringify((byId.get(id) as { date?: unknown })?.date ?? null)
  switch (f.kind) {
    case "parent-of": return `${nameOf(a)} is a parent of ${nameOf(b)}`
    case "partner-of": return `${nameOf(a)} and ${nameOf(b)} were married`
    case "member-of": return `${nameOf(a)} belongs to the group ${nameOf(b)}`
    case "participated-in": return `${nameOf(a)} took part in the event ${nameOf(b)}`
    case "occurred-at": return `the event ${nameOf(a)} happened at ${nameOf(b)}`
    case "visited": return `${nameOf(a)} was at (visited) ${nameOf(b)}`
    case "died-at": return `${nameOf(a)} died at ${nameOf(b)}`
    case "alias-of": return `the place ${nameOf(a)} is the same place as ${nameOf(b)}`
    case "part-of": return `the place ${nameOf(a)} is within ${nameOf(b)}`
    case "near": return `the place ${nameOf(a)} is near ${nameOf(b)}`
    case "date": return `${nameOf(body)} is dated ${date(body)} (astronomical years: -478 is 479 BC)${byId.get(body)?.description ? `; its description says: "${byId.get(body)!.description}"` : ""}`
    case "birth": return `${nameOf(body)} was born in ${JSON.stringify((byId.get(body) as Person).birth)} (astronomical years)`
    case "death": return `${nameOf(body)} died in ${JSON.stringify((byId.get(body) as Person).death)} (astronomical years)`
    case "house": { const x = kingdomOf.get(body)!; return `in ${x.k.name}, the reign ${nameOf(x.r.event)} belongs to the ruling house "${x.r.house}"` }
    case "note": { const x = kingdomOf.get(body)!; return `the note on ${nameOf(x.r.event)} in ${x.k.name}: "${x.r.note}"` }
    case "lede": return `the summary of the era ${nameOf(body)}: "${periods.find((p) => p.id === body)!.lede}"`
  }
}

const lines: string[] = []
lines.push(`# Review batch: ${name}`, "")
lines.push(
  staleMode
    ? `Stale reviews in data/evidence/${name}.json: ${chosen.length} facts whose data changed since they were reviewed. ` +
        "Re-check each, then in that file replace the old key with the new one and update the entry (or move it between agreed and facts)."
    : `Passage: ${spec || `facts of kind ${kindFlag}`}. ${chosen.length} facts.`,
  "",
)
if (staleMode && gone.length)
  lines.push(`Reviews of facts that no longer exist (delete them from the file): ${gone.map((k) => `\`${k}\``).join(", ")}`, "")
lines.push("## Facts", "")
lines.push("Each line: the key (copy it exactly), the claim, and what the automatic text match found.", "")
for (const f of chosen) {
  const s = matches.facts[f.key]
  const found = s && s.length ? (s[0] ? `text match: ${s[0]} (${RULES[s[1]] ?? s[1]})` : `text match: ${RULES[s[1]] ?? s[1]}`) : "text match: none"
  const old = staleOld.get(f.id)
  const was = old
    ? ` Was reviewed as \`${old}\`: ${own.facts?.[old] ? `${own.facts[old].kind ?? "verse"}, ${(own.facts[old].refs ?? []).join(", ")}${own.facts[old].note ? ` — "${own.facts[old].note}"` : ""}` : "agreed with the text match"}.`
    : ""
  lines.push(`- \`${f.key}\` — ${describe(f)}. ${found}.${was}`)
}
lines.push("", "## Text (KJV)", "")
// For a --kind batch (kingdoms, eras): the opening verses of each record it
// touches (a reign's accession formula), and for an era, of its key moments.
const opening = (id: string, n = 8) => (byId.get(id)?.scriptureRefs ?? []).slice(0, n).map(verseKey)
const verses = passages.length
  ? [...text.keys()].filter(inPassage)
  : [
      ...new Set(
        chosen.flatMap((f) =>
          [
            ...f.records.flatMap((id) => [...opening(id), ...(periods.find((p) => p.id === id)?.moments ?? []).flatMap((m) => opening(m, 4))]),
            ...(own.facts?.[staleOld.get(f.id) ?? ""]?.refs ?? []), // the verses the old review cited
          ],
        ),
      ),
    ].filter((k) => text.has(k))
for (const k of verses) lines.push(`${k} ${text.get(k)}`)

mkdirSync(join(root, "audit", "batches"), { recursive: true })
const out = join(root, "audit", "batches", `${name}.md`)
writeFileSync(out, lines.join("\n") + "\n")
console.log(`Wrote ${out}: ${chosen.length} facts, ${verses.length} verses.`)
