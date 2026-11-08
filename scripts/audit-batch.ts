// Prepares one AI review batch (docs/data-audit-plan.md, step 3): the facts
// that live in a stretch of Scripture, each with what the text match found,
// and the KJV text, written to audit/batches/<name>.md for the reviewer.
//
//   npm run audit:batch -- esther esth.1-10            facts filed under Esther 1–10
//   npm run audit:batch -- kingdoms --kind house,note  facts of those kinds
//   npm run audit:batch -- esther --stale              esther.json's reviews the data has since changed under
//
// A fact is filed under its first supporting verse: the text match's verse if
// it has one, else the first verse naming both its records (or one of them, in
// a chapter naming the other), else the first verse of the record that tells
// it (the child, the event, the town). Facts reviewed in another batch file
// are left out, so each fact lives in one batch. A stale review comes with its
// old verdict, to re-check and update in place.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { EvidenceBatch, Person } from "../src/lib/data/schema.ts"
import { enumerateFacts, factId, type Fact, type MatchEvidence } from "../src/lib/evidence.ts"
import { RULES } from "../src/lib/scan.ts"
import { verseKey } from "../src/lib/scripture.ts"
import { loadData, loadVerses, readJson, root } from "./data.ts"

const [name, spec = "", kindList] = process.argv.slice(2)
if (!name || !spec) {
  console.error("usage: npm run audit:batch -- <name> <book.chapter-chapter>[,…] | --kind house,note,lede | --stale")
  process.exit(1)
}
const mode = spec === "--kind" ? "kind" : spec === "--stale" ? "stale" : "passage"

const { people, places, events, peopleGroups, books, edges, periods, kingdoms } = loadData()
const text = loadVerses(books)
const matches = readJson("data/evidence/matches.json") as MatchEvidence
const facts = enumerateFacts({ people, places, events, edges, periods, kingdoms })

type Rec = { name: string; displayTitle?: string; scriptureRefs?: { book: string; chapter: number; verse: number }[]; description?: string }
const records = new Map<string, Rec>([...people, ...places, ...events, ...peopleGroups, ...periods].map((r) => [r.id, r]))
const nameOf = (id: string) => `${records.get(id)?.displayTitle ?? records.get(id)?.name ?? "?"} [${id}]`
const refsOf = (id: string) => (records.get(id)?.scriptureRefs ?? []).map(verseKey)

// --- Which facts --------------------------------------------------------------

// The other batches' reviews, and this batch's own (for --stale).
const batchFile = (file: string): EvidenceBatch => readJson(`data/evidence/${file}`)
const keysOf = (b: EvidenceBatch) => [...(b.agreed ?? []), ...Object.keys(b.facts ?? {})]
const others = readdirSync(join(root, "data/evidence")).filter((f) => f.endsWith(".json") && f !== "matches.json" && f !== `${name}.json`)
const reviewedElsewhere = new Set(others.flatMap((f) => keysOf(batchFile(f)).map(factId)))
const own: EvidenceBatch = existsSync(join(root, `data/evidence/${name}.json`)) ? batchFile(`${name}.json`) : { passage: "" }
const ownKey = new Map(keysOf(own).map((k) => [factId(k), k]))

// The record whose verses tell a fact: a parent link is told at the child,
// a part in an event at the event; otherwise the record it's about.
const teller = (f: Fact) => (f.kind === "parent-of" || f.kind === "participated-in" ? [...f.records].reverse() : f.records)
// The first verse naming both records; else the first verse naming the second
// in a chapter that names the first ("we launched" from Adramyttium, in a
// chapter about Paul).
const chapterOf = (k: string) => k.slice(0, k.lastIndexOf("."))
function together([a, b]: string[]) {
  if (b === undefined) return undefined
  const [ra, rb] = [refsOf(a), new Set(refsOf(b))]
  const chapters = new Set(ra.map(chapterOf))
  return ra.find((k) => rb.has(k)) ?? [...rb].find((k) => chapters.has(chapterOf(k)))
}
const home = (f: Fact) => matches.facts[f.key]?.[0] ?? together(f.records) ?? teller(f).map((id) => refsOf(id)[0]).find(Boolean)

// "esth.1-10" → Esther 1 to 10; "neh.12" → Nehemiah 12.
const passages = mode === "passage"
  ? spec.split(",").map((p) => {
      const m = /^([1-3]?[a-z]+)\.(\d+)(?:-(\d+))?$/.exec(p)
      if (!m) throw new Error(`bad passage "${p}": expected e.g. esth.1-10`)
      return { book: m[1], from: Number(m[2]), to: Number(m[3] ?? m[2]) }
    })
  : []
const inPassage = (key: string) => {
  const [book, chapter] = key.split(".")
  return passages.some((p) => p.book === book && Number(chapter) >= p.from && Number(chapter) <= p.to)
}

const chosen = facts.filter((f) => {
  if (mode === "stale") return ownKey.has(f.id) && ownKey.get(f.id) !== f.key
  if (reviewedElsewhere.has(f.id)) return false
  if (mode === "kind") return kindList?.split(",").includes(f.kind)
  const h = home(f)
  return h !== undefined && inPassage(h)
})
const gone = [...ownKey].filter(([id]) => !facts.some((f) => f.id === id)).map(([, key]) => key)

// --- The batch file -------------------------------------------------------------

// A fact as a sentence a reviewer can check.
const reign = (body: string) => {
  const [kingdomId, event] = body.split("/")
  const k = kingdoms.find((k) => k.id === kingdomId)!
  return { k, r: k.reigns.find((r) => r.event === event)! }
}
function describe(f: Fact): string {
  const body = f.id.slice(f.id.indexOf(":") + 1)
  const [a, b] = body.split(">")
  const years = "(years are astronomical: a negative year is BC, one off, so -478 is 479 BC and 30 is AD 30)"
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
    case "date": {
      const r = [...events, ...places, ...periods].find((r) => r.id === body)!
      return `${nameOf(body)} is dated ${JSON.stringify(r.date)} ${years}${r.description ? `; its description says: "${r.description}"` : ""}`
    }
    case "birth": return `${nameOf(body)} was born in ${JSON.stringify((records.get(body) as Person).birth)} ${years}`
    case "death": return `${nameOf(body)} died in ${JSON.stringify((records.get(body) as Person).death)} ${years}`
    case "house": { const { k, r } = reign(body); return `in ${k.name}, the reign ${nameOf(r.event)} belongs to the ruling house "${r.house}"` }
    case "note": { const { k, r } = reign(body); return `the note on ${nameOf(r.event)} in ${k.name}: "${r.note}"` }
    case "lede": return `the summary of the era ${nameOf(body)}: "${periods.find((p) => p.id === body)!.lede}"`
  }
}

function matchSays(f: Fact) {
  const [ref, rule] = matches.facts[f.key] ?? []
  return rule ? `text match: ${ref ? `${ref} ` : ""}(${RULES[rule] ?? rule})` : "text match: none"
}
function previously(f: Fact) {
  const old = mode === "stale" && ownKey.get(f.id)
  if (!old) return ""
  const entry = own.facts?.[old]
  const verdict = entry ? `${entry.kind ?? "verse"}, ${(entry.refs ?? []).join(", ")}${entry.note ? ` — "${entry.note}"` : ""}` : "agreed with the text match"
  return ` Was reviewed as \`${old}\`: ${verdict}.`
}

// The text: the passage itself; or, for a --kind or --stale batch, the opening
// verses of each record it touches (a reign's accession formula; for an era,
// its key moments) and any verses an old review cited.
const opening = (id: string, n = 8) => refsOf(id).slice(0, n)
const verses = passages.length
  ? [...text.keys()].filter(inPassage)
  : [
      ...new Set(
        chosen.flatMap((f) => [
          ...f.records.flatMap((id) => [...opening(id), ...(periods.find((p) => p.id === id)?.moments ?? []).flatMap((m) => opening(m, 4))]),
          ...(mode === "stale" ? (own.facts?.[ownKey.get(f.id)!]?.refs ?? []) : []),
        ]),
      ),
    ].filter((k) => text.has(k))

const intro =
  mode === "stale"
    ? `Stale reviews in data/evidence/${name}.json: ${chosen.length} facts whose data changed since they were reviewed. ` +
      "Re-check each, then in that file replace the old key with the new one and update the entry (or move it between agreed and facts)."
    : `${mode === "kind" ? `Facts of kind ${kindList}` : `Passage: ${spec}`}. ${chosen.length} facts.`
const lines = [
  `# Review batch: ${name}`,
  "",
  intro,
  "",
  ...(gone.length ? [`Reviews of facts that no longer exist (delete them from the file): ${gone.map((k) => `\`${k}\``).join(", ")}`, ""] : []),
  "## Facts",
  "",
  "Each line: the key (copy it exactly), the claim, and what the automatic text match found.",
  "",
  ...chosen.map((f) => `- \`${f.key}\` — ${describe(f)}. ${matchSays(f)}.${previously(f)}`),
  "",
  "## Text (KJV)",
  "",
  ...verses.map((k) => `${k} ${text.get(k)}`),
]

mkdirSync(join(root, "audit/batches"), { recursive: true })
const out = join(root, `audit/batches/${name}.md`)
writeFileSync(out, lines.join("\n") + "\n")
console.log(`Wrote ${out}: ${chosen.length} facts, ${verses.length} verses.`)
