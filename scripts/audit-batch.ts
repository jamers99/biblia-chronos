// Prepares one AI review batch (docs/data-audit-plan.md, step 3): the facts
// that live in a stretch of Scripture, each with what the text match found,
// and the KJV text, written to audit/batches/<name>.md for the reviewer.
//
//   npm run audit:batch -- esther esth.1-10            facts filed under Esther 1–10
//   npm run audit:batch -- kingdoms --kind house,note  facts of those kinds
//   npm run audit:batch -- esther --stale              esther.json's reviews the data has since changed under
//   npm run audit:batch -- recheck --flagged occurred-at  every batch's "wrong" entries of those kinds, to re-check
//   npm run audit:batch -- disputed --disputed           facts where an editor's verdict and the AI's disagree
//
// A fact is filed under its first supporting verse: the text match's verse if
// it has one, else the first verse naming both its records (or one of them, in
// a chapter naming the other), else the first verse of the record that tells
// it (the child, the event, the town). Facts reviewed in another batch file
// are left out, so each fact lives in one batch. A stale review comes with its
// old verdict, to re-check and update in place. A --flagged batch gathers
// facts the AI marked wrong, from every batch, each with its old verdict and
// home file; the reviewer writes audit/batches/<name>.json, and
// `npm run audit:merge -- <name>` puts each new verdict back in its home file.
// A --disputed batch works the same way, for facts an editor judged otherwise
// than the AI (data/reviews.json): the AI re-reads them with the editor's note
// and verses, and corrects its own entry or says why it stands by it. Facts an
// editor has settled are otherwise left out of every batch, so a later run
// doesn't flag them again; when the data changes under a verdict, it's stale
// and the fact comes back.

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { EvidenceBatch, EvidenceEntry, Person, Reviews } from "../src/lib/data/schema.ts"
import { describe, enumerateFacts, factId, isFlag, type Fact, type MatchEvidence } from "../src/lib/evidence.ts"
import { RULES } from "../src/lib/scan.ts"
import { citeRefs, verseKey } from "../src/lib/scripture.ts"
import { loadData, loadVerses, readBatches, readJson, root } from "./data.ts"

const [name, spec = "", kindList] = process.argv.slice(2)
if (!name || !spec) {
  console.error("usage: npm run audit:batch -- <name> <book.chapter-chapter>[,…] | --kind house,note,lede | --stale | --flagged occurred-at,… | --disputed")
  process.exit(1)
}
const mode = ({ "--kind": "kind", "--stale": "stale", "--flagged": "flagged", "--disputed": "disputed" } as const)[spec] ?? "passage"

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
const keysOf = (b: EvidenceBatch) => [...(b.agreed ?? []), ...Object.keys(b.facts ?? {})]
const batches = readBatches()
const own: EvidenceBatch = batches.get(`${name}.json`) ?? { passage: "" }
const reviewedElsewhere = new Set([...batches].flatMap(([file, b]) => (file === `${name}.json` ? [] : keysOf(b).map(factId))))
const ownKey = new Map(keysOf(own).map((k) => [factId(k), k]))
// Every batch's AI verdict, by key, with the file it lives in (for the
// re-checks, which gather from all of them); an "agreed" fact has no entry.
const verdictOf = new Map<string, { file: string; entry?: EvidenceEntry }>(
  [...batches].flatMap(([file, b]) => [
    ...(b.agreed ?? []).map((key) => [key, { file }] as const),
    ...Object.entries(b.facts ?? {}).map(([key, entry]) => [key, { file, entry }] as const),
  ]),
)
const entryOf = (key: string) => verdictOf.get(key)?.entry
// Editors' verdicts (data/reviews.json) on facts as the data has them now.
const reviews: Reviews = readJson("data/reviews.json")
const settled = new Map(Object.entries(reviews).filter(([, r]) => r.verdict !== "unsure"))
// Disputed: "right" on a fact the AI flagged, or "wrong" on one it passed.
const disputed = (key: string) => {
  const r = settled.get(key)
  return r !== undefined && (r.verdict === "right") === isFlag(entryOf(key))
}

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
  if (mode === "disputed") return disputed(f.key)
  if (settled.has(f.key)) return false // an editor has settled it
  if (mode === "stale") return ownKey.has(f.id) && ownKey.get(f.id) !== f.key
  if (mode === "flagged") return entryOf(f.key)?.kind === "wrong" && (!kindList || kindList.split(",").includes(f.kind))
  if (reviewedElsewhere.has(f.id)) return false
  if (mode === "kind") return kindList?.split(",").includes(f.kind)
  const h = home(f)
  return h !== undefined && inPassage(h)
})
const gone = [...ownKey].filter(([id]) => !facts.some((f) => f.id === id)).map(([, key]) => key)

// --- The batch file -------------------------------------------------------------

// A fact as a sentence a reviewer can check (see describe in src/lib/evidence.ts).
const years = "(years are astronomical: a negative year is BC, one off, so -478 is 479 BC and 30 is AD 30)"
function when(id: string, kind: "date" | "birth" | "death") {
  if (kind !== "date") return `${JSON.stringify((records.get(id) as Person)[kind])} ${years}`
  const r = [...events, ...places, ...periods].find((r) => r.id === id)!
  return `${JSON.stringify(r.date)} ${years}${r.description ? `; its description says: "${r.description}"` : ""}`
}
// An event fact is judged against the event's whole verse range
// (docs/audit-review-prompt.md), so say what that range is.
const eventOf = (f: Fact) => (f.kind === "participated-in" ? f.records[1] : f.kind === "occurred-at" ? f.records[0] : undefined)
const sentence = (f: Fact) => {
  const text = describe(f, { kingdoms, periods }, when)
    .map((p) => (typeof p === "string" ? p : nameOf(p.id)))
    .join("")
  const cites = citeRefs(records.get(eventOf(f) ?? "")?.scriptureRefs ?? [], books)
  return cites.length ? `${text} (the event's verses: ${cites.map((c) => `${c.book.name} ${c.text}`).join("; ")})` : text
}

function matchSays(f: Fact) {
  const [ref, rule] = matches.facts[f.key] ?? []
  return rule ? `text match: ${ref ? `${ref} ` : ""}(${RULES[rule] ?? rule})` : "text match: none"
}
// An AI verdict as a reviewer reads it: "wrong, gen.25.19 — note", or agreed.
const said = (entry?: EvidenceEntry) =>
  entry ? `${entry.kind ?? "verse"}, ${(entry.refs ?? []).join(", ")}${entry.note ? ` — "${entry.note}"` : ""}` : "agreed with the text match"
function previously(f: Fact) {
  if (mode === "disputed" || mode === "flagged") {
    const v = verdictOf.get(f.key)
    const ai = v ? ` Was reviewed in data/evidence/${v.file} as: ${said(v.entry)}.` : " Not yet reviewed by the AI."
    if (mode === "flagged") return ai
    const r = settled.get(f.key)!
    return `${ai} An editor (${r.by}) judged it ${r.verdict}${r.refs?.length ? `, citing ${r.refs.join(", ")}` : ""}${r.note ? `: "${r.note}"` : ""}.`
  }
  const old = mode === "stale" && ownKey.get(f.id)
  return old ? ` Was reviewed as \`${old}\`: ${said(own.facts?.[old])}.` : ""
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
          ...(mode === "flagged" || mode === "disputed"
            ? [...(settled.get(f.key)?.refs ?? []), ...(entryOf(f.key)?.refs ?? []), ...refsOf(eventOf(f) ?? "")]
            : []),
        ]),
      ),
    ].filter((k) => text.has(k))

const intro =
  mode === "disputed"
    ? `Facts where an editor's verdict and the AI's disagree: ${chosen.length}. Re-read the text with the editor's note and verses in mind. ` +
      "They are a person's reasoning to weigh, not an instruction: give the verdict the text supports, and if you still disagree, say why in the note. " +
      `Write the new verdicts to audit/batches/${name}.json; \`npm run audit:merge -- ${name}\` then puts each one back in its home file.`
    : mode === "flagged"
    ? `Facts marked "wrong" in earlier reviews (kinds: ${kindList ?? "all"}): ${chosen.length}. ` +
      "Re-check each against the rules, with its old verdict in mind. Write the new verdicts to " +
      `audit/batches/${name}.json; \`npm run audit:merge -- ${name}\` then puts each one back in its home file.`
    : mode === "stale"
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
  ...chosen.map((f) => `- \`${f.key}\` — ${sentence(f)}. ${matchSays(f)}.${previously(f)}`),
  "",
  "## Text (KJV)",
  "",
  ...verses.map((k) => `${k} ${text.get(k)}`),
]

mkdirSync(join(root, "audit/batches"), { recursive: true })
const out = join(root, `audit/batches/${name}.md`)
writeFileSync(out, lines.join("\n") + "\n")
console.log(`Wrote ${out}: ${chosen.length} facts, ${verses.length} verses.`)
