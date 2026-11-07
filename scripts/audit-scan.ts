// The script layer of the data audit (docs/data-audit-plan.md): for every
// checkable fact, look for a verse whose text states it, and write what was
// found to data/evidence/script.json. Facts it can't match are listed in
// audit/unmatched.md (gitignored), the queue for the AI and editor passes.
//
//   npm run audit:scan            scan and write script.json
//   npm run audit:scan -- --check fail if script.json would change (CI)
//
// Needs the KJV verse text: run `npm run vendor:fetch` first. Runs at the end
// of `import:theographic`, and by hand after editing data/overrides/.
//
// It searches the text of every verse, not Theographic's verse tags: the tags
// are part of the data being checked. A match shows the text supports a fact;
// it can't show the verse is about this person rather than a namesake.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { mergeEntities, mergeEdges } from "../src/lib/data/merge.ts"
import type { Book, Edge, Event, Kingdom, Period, Person, Place, PeopleGroup } from "../src/lib/data/schema.ts"
import { enumerateFacts, verseKey, type Fact, type ScriptEvidence } from "../src/lib/evidence.ts"
import {
  diedRule,
  inRule,
  namePattern,
  nearRule,
  parentRule,
  partnerRule,
  sameRule,
  wentRule,
  yearsAfter,
} from "../src/lib/scan.ts"

const root = join(import.meta.dirname, "..")
const check = process.argv.includes("--check")
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"))
const readOpt = (path: string) => (existsSync(join(root, path)) ? read(path) : [])
const merged = <T extends { id: string }>(name: string): T[] => mergeEntities(read(`data/seed/${name}`), readOpt(`data/overrides/${name}`))

// --- Data ---------------------------------------------------------------------

const people = merged<Person>("people.json")
const places = merged<Place>("places.json")
const events = merged<Event>("events.json")
const groups = merged<PeopleGroup>("peopleGroups.json")
const books = merged<Book>("books.json")
const edges: Edge[] = mergeEdges(read("data/seed/edges.json"), readOpt("data/overrides/edges.json"))
const periods: Period[] = readOpt("data/overrides/periods.json")
const kingdoms: Kingdom[] = readOpt("data/overrides/kingdoms.json")
const snapshot = read("data/vendor/theographic/snapshot.json")

const versesPath = "data/vendor/theographic/verses.json"
if (!existsSync(join(root, versesPath))) {
  console.error(`${versesPath} is missing: run \`npm run vendor:fetch\` first.`)
  process.exit(1)
}

// Verse text by key ("gen.25.19"), in canonical order.
const bookByOsis = new Map(books.map((b) => [b.osis, b.id]))
const text = new Map<string, string>()
for (const r of read(versesPath) as { fields: { osisRef: string; verseText: string } }[]) {
  const [osis, chapter, verse] = r.fields.osisRef.split(".")
  const book = bookByOsis.get(osis)
  if (book) text.set(`${book}.${chapter}.${verse}`, r.fields.verseText)
}
const order = new Map([...text.keys()].map((k, i) => [k, i]))
const sortVerses = (keys: Iterable<string>) => [...keys].sort((a, b) => order.get(a)! - order.get(b)!)

// Capitalised words → the verses they appear in, to find candidate verses fast.
const index = new Map<string, Set<string>>()
for (const [key, t] of text)
  for (const word of t.match(/[A-Z][\w’'-]*/g) ?? []) {
    const w = word.replace(/[’']s$/, "")
    if (!index.has(w)) index.set(w, new Set())
    index.get(w)!.add(key)
  }

// --- Names --------------------------------------------------------------------

// People: their name plus upstream's other names for them (Joshua is "Jeshua"
// in Ezra). Places: their name plus the KJV/ESV spellings. Groups: the tribe.
const alsoCalled = new Map<string, string[]>(
  (read("data/vendor/theographic/people.json") as { fields: { personLookup: string; alsoCalled?: string } }[]).map((r) => [
    r.fields.personLookup,
    (r.fields.alsoCalled ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  ]),
)
const namesOf = new Map<string, string[]>()
for (const p of people) namesOf.set(p.id, [p.name, ...(alsoCalled.get(p.id) ?? [])])
for (const p of places) namesOf.set(p.id, [p.name, ...(p.altNames ?? [])])

const pattern = new Map<string, string>()
const patternOf = (id: string) => {
  if (!pattern.has(id)) pattern.set(id, namePattern(namesOf.get(id) ?? []))
  return pattern.get(id)!
}
// Verses that might mention a record: any verse containing the first word of
// one of its names. The rules then check the full name.
const versesOf = (id: string): Set<string> => {
  const out = new Set<string>()
  for (const name of namesOf.get(id) ?? []) for (const k of index.get(name.split(/\s+/)[0]) ?? []) out.add(k)
  return out
}
const both = (a: string, b: string) => {
  const va = versesOf(a)
  return sortVerses([...versesOf(b)].filter((k) => va.has(k)))
}
const firstMatch = (keys: string[], rule: (t: string) => string | undefined): [string, string] | undefined => {
  for (const k of keys) {
    const r = rule(text.get(k)!)
    if (r) return [k, r]
  }
  return undefined
}

// An event's passage: its own verse refs.
const byId = new Map<string, { id: string; name: string; scriptureRefs?: { book: string; chapter: number; verse: number }[] }>(
  [...people, ...places, ...events, ...groups].map((r) => [r.id, r]),
)
const passage = (id: string) => sortVerses((byId.get(id)?.scriptureRefs ?? []).map(verseKey).filter((k) => text.has(k)))

// --- Graph helpers ----------------------------------------------------------------

const parents = new Map<string, string[]>()
for (const e of edges) if (e.type === "parent-of") parents.set(e.to, [...(parents.get(e.to) ?? []), e.from])
const person = new Map(people.map((p) => [p.id, p]))
const childrenOf = (id: string) => edges.filter((e) => e.type === "parent-of" && e.from === id).map((e) => e.to)
const childNamed = (parent: string, name: string) => childrenOf(parent).find((id) => person.get(id)?.name === name)

// Each group's founder (tribes: Jacob's sons; the line of Cain: Cain), and the
// passages that list a group's members.
const jacob = "israel_682"
const FOUNDERS: Record<string, string | undefined> = { "line-of-cain": childNamed("adam_77", "Cain") }
for (const g of groups) {
  const m = /^Tribe of (\w+)$/.exec(g.name)
  if (m) FOUNDERS[g.id] = childNamed(jacob, m[1])
}
const range = (book: string, chapter: number, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${book}.${chapter}.${from + i}`)
const APOSTLE_LISTS = [...range("matt", 10, 2, 4), ...range("mark", 3, 16, 19), ...range("luke", 6, 14, 16), "acts.1.13"]
const LISTS: Record<string, string[]> = {
  "genealogy-of-jesus": [...range("matt", 1, 1, 16), ...range("luke", 3, 23, 38)],
  apostles: APOSTLE_LISTS,
  "apostles-the-eleven": ["acts.1.13"],
  "apostles-post-ascension": ["acts.1.13", "acts.1.26"],
}

function descends(id: string, founder: string): boolean {
  const seen = new Set<string>()
  const queue = [id]
  while (queue.length) {
    const p = queue.shift()!
    if (p === founder) return true
    if (seen.has(p)) continue
    seen.add(p)
    queue.push(...(parents.get(p) ?? []))
  }
  return false
}

// --- Tribal territories --------------------------------------------------------------

// A town in a tribe's land: Joshua 15–19 (and 1 Chr 6) list them under a
// heading ("the cities of the tribe of the children of Judah … were Kabzeel,
// and Eder"), often many verses before the town. Walk back from a verse naming
// the town to the nearest heading naming a tribe; it must be this one.
const TRIBES = ["Judah", "Benjamin", "Asher", "Naphtali", "Dan", "Reuben", "Gad", "Ephraim", "Manasseh", "Zebulun", "Issachar", "Simeon", "Levi"]
const tribeOfPlace = (id: string) => TRIBES.find((t) => new RegExp(`(?:^|\\s)${t}(?:\\s|$)`).test(byId.get(id)?.name ?? ""))
const HEADING = new RegExp(
  `\\b(?:tribe|children|lot|inheritance|cities|border|coast)\\s+of\\s+(?:the\\s+)?(?:tribe\\s+of\\s+)?(?:the\\s+)?(?:children\\s+of\\s+)?(${TRIBES.join("|")})\\b`,
  "g",
)
const keyList = [...text.keys()]
function territory(place: string, region: string): Found | undefined {
  const tribe = tribeOfPlace(region)
  if (!tribe) return undefined
  const name = new RegExp(patternOf(place))
  for (const k of sortVerses(versesOf(place))) {
    if (!/^(?:josh|1chr)\./.test(k)) continue
    const at = name.exec(text.get(k)!)
    if (!at) continue
    const chapter = k.slice(0, k.lastIndexOf("."))
    for (let i = order.get(k)!, n = 0; i >= 0 && n < 60; i--, n++) {
      const v = keyList[i]
      if (!v.startsWith(chapter + ".")) break
      const t = v === k ? text.get(v)!.slice(0, at.index) : text.get(v)!
      const heads = [...t.matchAll(HEADING)].map((m) => m[1])
      if (heads.length) {
        if (heads.at(-1) === tribe) return [k, "territory-list"]
        break
      }
    }
  }
  return undefined
}

// --- Dates --------------------------------------------------------------------------

const years = (d?: { earliest?: number; latest?: number }) => (d?.earliest ?? d?.latest)
type Found = [string | null, string]
const notes = new Map<string, string>() // why a fact is unmatched, when there's something to say

function reignLength(f: Fact, e: Event): Found | undefined {
  const span = e.date && e.date.latest !== undefined && e.date.earliest !== undefined ? e.date.latest - e.date.earliest : undefined
  if (span === undefined) return undefined
  const king = e.name.replace(/^Reign of /, "").replace(/\s*\(.*\)$/, "")
  const kingIds = edges.filter((x) => x.type === "participated-in" && x.to === e.id).map((x) => x.from)
  const names = namePattern([king, ...kingIds.flatMap((id) => namesOf.get(id) ?? [])])
  const said: number[] = []
  for (const k of passage(e.id)) {
    const t = text.get(k)!
    if (!new RegExp(names).test(t) && !/\bhe\b/.test(t)) continue
    for (const n of yearsAfter(t, "reigned")) {
      said.push(n)
      if (Math.abs(n - span) <= 1) return [k, "reign-length"]
    }
  }
  if (said.length) notes.set(f.id, `Text gives a reign of ${[...new Set(said)].join(" or ")} years; the dates span ${span}.`)
  return undefined
}

function ageAtFatherhood(child: Person): Found | undefined {
  const born = years(child.birth)
  if (born === undefined) return undefined
  for (const pid of parents.get(child.id) ?? []) {
    const parentBorn = years(person.get(pid)?.birth)
    if (parentBorn === undefined) continue
    const age = born - parentBorn
    const hit = firstMatch(both(pid, child.id), (t) =>
      [...yearsAfter(t, "lived"), ...yearsAfter(t, "was"), ...yearsAfter(t, "being")].some((n) => n === age) ? "age-at-fatherhood" : undefined,
    )
    if (hit) return hit
  }
  return undefined
}

function ageAtDeath(p: Person): Found | undefined {
  const born = years(p.birth)
  const died = years(p.death)
  if (born === undefined || died === undefined) return undefined
  const age = died - born
  const keys = sortVerses(versesOf(p.id))
  return firstMatch(keys, (t) =>
    new RegExp(patternOf(p.id)).test(t) &&
    /\b(?:died|dead|death)\b/.test(t) &&
    [...yearsAfter(t, "were"), ...yearsAfter(t, "being"), ...yearsAfter(t, "was"), ...yearsAfter(t, "lived"), ...yearsAfter(t, "of")].some(
      (n) => Math.abs(n - age) <= 1,
    )
      ? "age-at-death"
      : undefined,
  )
}

// --- Scan -------------------------------------------------------------------------

const facts = enumerateFacts({ people, places, events, edges, periods, kingdoms })
const eventById = new Map(events.map((e) => [e.id, e]))

function scan(f: Fact): Found | undefined {
  const [a, b] = f.id.slice(f.id.indexOf(":") + 1).split(">")
  switch (f.kind) {
    case "parent-of":
      return firstMatch(both(a, b), (t) => parentRule(t, patternOf(a), patternOf(b)))
    case "partner-of":
      return firstMatch(both(a, b), (t) => partnerRule(t, patternOf(a), patternOf(b)))
    case "member-of": {
      const list = LISTS[b]
      if (list) return firstMatch(list.filter((k) => text.has(k)), (t) => (new RegExp(patternOf(a)).test(t) ? "listed" : undefined))
      const founder = FOUNDERS[b]
      const tribe = /^Tribe of (\w+)$/.exec(byId.get(b)?.name ?? "")?.[1]
      if (tribe) {
        const hit = firstMatch(sortVerses(versesOf(a)), (t) =>
          new RegExp(`${patternOf(a)}[^.;:]*\\btribe\\s+of\\s+${tribe}\\b|\\btribe\\s+of\\s+${tribe}\\b[^.;:]*${patternOf(a)}`).test(t) ? "tribe-of" : undefined,
        )
        if (hit) return hit
      }
      if (founder && descends(a, founder)) return [null, "descent"]
      return undefined
    }
    case "participated-in":
      return firstMatch(passage(b), (t) => (new RegExp(patternOf(a)).test(t) ? "in-passage" : undefined))
    case "occurred-at":
      return firstMatch(passage(a), (t) => (new RegExp(patternOf(b)).test(t) ? "in-passage" : undefined))
    case "visited":
      return firstMatch(both(a, b), (t) => wentRule(t, patternOf(a), patternOf(b)))
    case "died-at":
      return firstMatch(both(a, b), (t) => diedRule(t, patternOf(a), patternOf(b)))
    case "alias-of":
      return firstMatch(both(a, b), (t) => sameRule(t, patternOf(a), patternOf(b)))
    case "part-of":
      return firstMatch(both(a, b), (t) => inRule(t, patternOf(a), patternOf(b))) ?? territory(a, b)
    case "near":
      return firstMatch(both(a, b), (t) => nearRule(t, patternOf(a), patternOf(b)) ?? inRule(t, patternOf(a), patternOf(b)))
    case "date": {
      const e = eventById.get(a)
      return e && /^reign-of-/.test(e.id) ? reignLength(f, e) : undefined
    }
    case "birth":
      return ageAtFatherhood(person.get(a)!)
    case "death":
      return ageAtDeath(person.get(a)!)
    default:
      return undefined // house, note, lede: editorial prose, for the AI and editor passes
  }
}

const results = new Map<string, Found | undefined>(facts.map((f) => [f.key, scan(f)]))

// --- Self-test: made-up wrong parents must not pass ------------------------------------

// Grandparents, uncles, and children recorded as parents. A rule loose enough
// to pass these would pass real errors too.
const isParent = new Set(edges.filter((e) => e.type === "parent-of").map((e) => `${e.from}>${e.to}`))
const fakes = new Set<string>()
for (const [child, ps] of parents)
  for (const p of ps) {
    for (const gp of parents.get(p) ?? []) fakes.add(`${gp}>${child}`) // grandparent
    fakes.add(`${child}>${p}`) // reversed
    for (const gp of parents.get(p) ?? []) for (const uncle of childrenOf(gp)) if (uncle !== p) fakes.add(`${uncle}>${child}`)
  }
let fakeTotal = 0
const fakePass: Record<string, number> = {}
for (const pair of fakes) {
  if (isParent.has(pair)) continue
  const [a, b] = pair.split(">")
  if (!person.has(a) || !person.has(b)) continue
  fakeTotal++
  const hit = firstMatch(both(a, b), (t) => parentRule(t, patternOf(a), patternOf(b)))
  if (hit) {
    fakePass[hit[1]] = (fakePass[hit[1]] ?? 0) + 1
    if (process.env.AUDIT_DEBUG) console.log("made-up link passed:", `${a} > ${b}`, hit, text.get(hit[0]!))
  }
}
const fakePassed = Object.values(fakePass).reduce((x, y) => x + y, 0)
const FAKE_LIMIT = 0.05

// --- Output -----------------------------------------------------------------------

const out: ScriptEvidence = {
  theographic: snapshot.commit,
  facts: Object.fromEntries(facts.map((f) => [f.key, results.get(f.key) ?? []])),
}
// One fact per line, so a re-scan diffs cleanly.
const body =
  `{\n  "theographic": ${JSON.stringify(out.theographic)},\n  "facts": {\n` +
  facts.map((f) => `    ${JSON.stringify(f.key)}: ${JSON.stringify(out.facts[f.key])}`).join(",\n") +
  `\n  }\n}\n`

const outPath = join(root, "data", "evidence", "script.json")

// Unmatched, grouped by where in Scripture they sit (the fact's first record's
// first verse), for the AI passes.
const bookName = new Map(books.map((b) => [b.id, b.name]))
const bookOrder = new Map(books.map((b) => [b.id, b.order]))
const where = (f: Fact) => {
  for (const id of [...f.records].reverse()) {
    const ref = byId.get(id)?.scriptureRefs?.[0]
    if (ref) return ref
  }
  return undefined
}
const unmatched = facts.filter((f) => !results.get(f.key))
const groupsOut = new Map<string, Fact[]>()
for (const f of unmatched) {
  const r = where(f)
  const g = r ? `${r.book}.${r.chapter}` : "~"
  groupsOut.set(g, [...(groupsOut.get(g) ?? []), f])
}
const groupKeys = [...groupsOut.keys()].sort((a, b) => {
  const [ba, ca] = a.split(".")
  const [bb, cb] = b.split(".")
  return (bookOrder.get(ba) ?? 999) - (bookOrder.get(bb) ?? 999) || Number(ca) - Number(cb)
})
const md = [
  "# Facts the script couldn't match",
  "",
  `Generated by \`npm run audit:scan\`. ${unmatched.length} of ${facts.length} facts, grouped by the chapter where the fact's record first appears.`,
  "",
  ...groupKeys.flatMap((g) => {
    const [b, c] = g.split(".")
    return [
      `## ${g === "~" ? "No verse refs" : `${bookName.get(b)} ${c}`}`,
      "",
      ...groupsOut.get(g)!.map((f) => `- \`${f.key}\`${notes.has(f.id) ? ` — ${notes.get(f.id)}` : ""}`),
      "",
    ]
  }),
].join("\n")

// --- Report -------------------------------------------------------------------------

const byKind = new Map<string, [number, number]>()
for (const f of facts) {
  const [m, n] = byKind.get(f.kind) ?? [0, 0]
  byKind.set(f.kind, [m + (results.get(f.key) ? 1 : 0), n + 1])
}
const byRule = new Map<string, number>()
for (const r of results.values()) if (r) byRule.set(r[1], (byRule.get(r[1]) ?? 0) + 1)

const lines = ["Biblia Chronos — evidence scan", "=============================="]
lines.push(`Facts: ${facts.length}, matched ${facts.length - unmatched.length}`)
for (const [kind, [m, n]] of [...byKind].sort()) lines.push(`  ${kind.padEnd(16)}${String(m).padStart(5)} / ${n}`)
lines.push("Rules:")
for (const [rule, n] of [...byRule].sort((a, b) => b[1] - a[1])) lines.push(`  ${rule.padEnd(18)}${n}`)
lines.push(
  `Self-test: ${fakePassed} of ${fakeTotal} made-up wrong parent links passed ` +
    `(${((100 * fakePassed) / Math.max(1, fakeTotal)).toFixed(1)}%, limit ${FAKE_LIMIT * 100}%)` +
    (fakePassed ? `: ${Object.entries(fakePass).map(([r, n]) => `${r} ${n}`).join(", ")}` : ""),
)

let failed = false
if (fakePassed / Math.max(1, fakeTotal) > FAKE_LIMIT) {
  lines.push("✗ The parent rules are too loose: they pass made-up grandparents, uncles, or reversed links.")
  failed = true
}

if (check) {
  const current = existsSync(outPath) ? readFileSync(outPath, "utf8") : ""
  if (current !== body) {
    const old = new Map<string, string>(
      current
        .split("\n")
        .map((l) => /^\s+("[^"]+"): (.*?),?$/.exec(l))
        .filter((m): m is RegExpExecArray => !!m && m[1] !== '"theographic"')
        .map((m) => [JSON.parse(m[1]), m[2]]),
    )
    const now = new Map(facts.map((f) => [f.key, JSON.stringify(out.facts[f.key])]))
    const added = [...now.keys()].filter((k) => !old.has(k))
    const removed = [...old.keys()].filter((k) => !now.has(k))
    const changed = [...now.keys()].filter((k) => old.has(k) && old.get(k) !== now.get(k))
    lines.push(`\n✗ data/evidence/script.json is out of date: ${added.length} new, ${removed.length} gone, ${changed.length} changed.`)
    for (const k of [...added.slice(0, 10).map((k) => `+ ${k}`), ...removed.slice(0, 10).map((k) => `- ${k}`), ...changed.slice(0, 10).map((k) => `~ ${k}`)])
      lines.push(`  ${k}`)
    lines.push("Run `npm run audit:scan` and commit the result.")
    failed = true
  } else lines.push("\n✓ data/evidence/script.json is up to date.")
} else {
  mkdirSync(join(root, "data", "evidence"), { recursive: true })
  writeFileSync(outPath, body)
  mkdirSync(join(root, "audit"), { recursive: true })
  writeFileSync(join(root, "audit", "unmatched.md"), md)
  lines.push(`\nWrote data/evidence/script.json, and audit/unmatched.md (${unmatched.length} unmatched).`)
}

console.log(lines.join("\n"))
if (failed) process.exit(1)
