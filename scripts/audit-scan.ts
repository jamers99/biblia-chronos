// The text match, the first layer of the data audit (docs/data-audit-plan.md):
// for every checkable fact, look for a verse whose text states it, and write
// what was found to data/evidence/matches.json.
//
//   npm run audit:scan            scan and write matches.json
//   npm run audit:scan -- --check fail if matches.json would change (CI)
//
// Runs at the end of `import:theographic`, and by hand after editing
// data/overrides/. Facts it can't match go to the AI and editor passes (see
// `npm run audit:batch`).
//
// It searches the text of every verse, not Theographic's verse tags: the tags
// are part of the data being checked. A match shows the text supports a fact;
// it can't show the verse is about this person rather than a namesake.

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import type { Event, Person } from "../src/lib/data/schema.ts"
import { enumerateFacts, type Fact, type MatchEvidence } from "../src/lib/evidence.ts"
import { spanOf } from "../src/lib/chronology.ts"
import { verseKey } from "../src/lib/scripture.ts"
import {
  diedRule,
  inRule,
  mentions,
  namePattern,
  nearRule,
  parentRule,
  partnerRule,
  sameRule,
  wentRule,
  yearsAfter,
} from "../src/lib/scan.ts"
import { loadData, loadVerses, readJson, root } from "./data.ts"

const { people, places, events, peopleGroups, books, edges, periods, kingdoms } = loadData()
const text = loadVerses(books)
const keys = [...text.keys()] // canonical order
const order = new Map(keys.map((k, i) => [k, i]))
const sortVerses = (ks: Iterable<string>) => [...ks].sort((a, b) => order.get(a)! - order.get(b)!)

// Capitalised words → the verses they appear in, to find candidate verses fast.
const index = new Map<string, Set<string>>()
for (const [key, t] of text)
  for (const word of t.match(/[A-Z][\w’'-]*/g) ?? []) {
    const w = word.replace(/[’']s$/, "")
    index.set(w, (index.get(w) ?? new Set()).add(key))
  }

// --- Names and verses ---------------------------------------------------------

// People: their name plus upstream's surname and other names for them (Simon
// is "Peter"; Joshua is "Jeshua" in Ezra). Places: their name plus the KJV/ESV
// spellings. Upstream's other names include plain nouns ("mother", "hen") and
// titles ("Lord", "King"): a title the KJV also uses as an ordinary word names
// no one in particular, except God's ("the LORD said").
const GOD = "god_1324"
const lowercase = new Set([...text.values()].flatMap((t) => t.match(/(?<![\w-])[a-z][a-z]+(?![\w-])/g) ?? []))
const isName = (name: string, id: string) =>
  /^[A-Z]/.test(name) && (id === GOD || name.includes(" ") || !lowercase.has(name.toLowerCase()))
type Upstream = { personLookup: string; surname?: string; alsoCalled?: string }
const alsoCalled = new Map<string, string[]>(
  (readJson("data/vendor/theographic/people.json") as { fields: Upstream }[]).map(({ fields: f }) => [
    f.personLookup,
    [f.surname ?? "", ...(f.alsoCalled ?? "").split(",")].map((s) => s.trim()).filter((s) => isName(s, f.personLookup)),
  ]),
)
const namesOf = new Map<string, string[]>([
  ...people.map((p): [string, string[]] => [p.id, [p.name, ...(alsoCalled.get(p.id) ?? [])]]),
  ...places.map((p): [string, string[]] => [p.id, [p.name, ...(p.altNames ?? [])]]),
])
const patterns = new Map<string, string>()
const pattern = (id: string) => {
  if (!patterns.has(id)) patterns.set(id, namePattern(namesOf.get(id) ?? []))
  return patterns.get(id)!
}

// Verses that might mention a record (they contain the first word of one of
// its names; the rules then check the whole name), and those naming both.
function versesOf(id: string): Set<string> {
  const out = new Set<string>()
  for (const name of namesOf.get(id) ?? []) for (const k of index.get(name.split(/\s+/)[0]) ?? []) out.add(k)
  return out
}
function both(a: string, b: string): string[] {
  const va = versesOf(a)
  return sortVerses([...versesOf(b)].filter((k) => va.has(k)))
}

// A record's own verse refs, in order.
const refsOf = new Map([...people, ...places, ...events, ...peopleGroups].map((r) => [r.id, r.scriptureRefs ?? []]))
const passage = (id: string) => sortVerses((refsOf.get(id) ?? []).map(verseKey).filter((k) => text.has(k)))

type Found = [string | null, string] // [verse, rule], or [null, rule] for a fact worked out from other data
function firstMatch(verses: string[], rule: (t: string) => string | undefined): Found | undefined {
  for (const k of verses) {
    const r = rule(text.get(k)!)
    if (r) return [k, r]
  }
  return undefined
}
const named = (id: string) => (t: string) => (mentions(t, pattern(id)) ? "in-passage" : undefined)

// --- Groups -------------------------------------------------------------------

const parents = new Map<string, string[]>()
for (const e of edges) if (e.type === "parent-of") parents.set(e.to, [...(parents.get(e.to) ?? []), e.from])
const childrenOf = (id: string) => edges.filter((e) => e.type === "parent-of" && e.from === id).map((e) => e.to)
const person = new Map(people.map((p) => [p.id, p]))

// A tribe's founder is the son of Jacob it's named for; the line of Cain's is Cain.
const JACOB = "israel_682"
const tribeOf = (groupName: string) => /^Tribe of (\w+)$/.exec(groupName)?.[1]
const founders = new Map<string, string | undefined>([
  ["line-of-cain", "cain_533"],
  ...peopleGroups.flatMap((g) => {
    const tribe = tribeOf(g.name)
    return tribe ? [[g.id, childrenOf(JACOB).find((id) => person.get(id)?.name === tribe)] as const] : []
  }),
])
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

// Groups whose members are listed in one passage.
const verses = (book: string, chapter: number, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${book}.${chapter}.${from + i}`)
const MEMBER_LISTS: Record<string, string[]> = {
  "genealogy-of-jesus": [...verses("matt", 1, 1, 16), ...verses("luke", 3, 23, 38)],
  apostles: [...verses("matt", 10, 2, 4), ...verses("mark", 3, 16, 19), ...verses("luke", 6, 14, 16), "acts.1.13"],
  "apostles-the-eleven": ["acts.1.13"],
  "apostles-post-ascension": ["acts.1.13", "acts.1.26"],
}

function membership(personId: string, groupId: string): Found | undefined {
  if (MEMBER_LISTS[groupId]) return firstMatch(MEMBER_LISTS[groupId], (t) => (mentions(t, pattern(personId)) ? "listed" : undefined))
  const tribe = tribeOf(peopleGroups.find((g) => g.id === groupId)?.name ?? "")
  const P = pattern(personId)
  const T = `\\btribe\\s+of\\s+${tribe}\\b`
  const stated = tribe && firstMatch(sortVerses(versesOf(personId)), (t) => (new RegExp(`${P}[^.;:]*${T}|${T}[^.;:]*${P}`).test(t) ? "tribe-of" : undefined))
  if (stated) return stated
  const founder = founders.get(groupId)
  return founder && descends(personId, founder) ? [null, "descent"] : undefined
}

// --- Tribal territories ---------------------------------------------------------

// A town in a tribe's land: Joshua 15–19 (and 1 Chr 6) list them under a
// heading ("the cities of the tribe of the children of Judah … were Kabzeel,
// and Eder"), often many verses before the town. Walk back from a verse naming
// the town to the nearest heading naming a tribe; it must be this one.
const TRIBES = ["Judah", "Benjamin", "Asher", "Naphtali", "Dan", "Reuben", "Gad", "Ephraim", "Manasseh", "Zebulun", "Issachar", "Simeon", "Levi"]
const HEADING = new RegExp(
  `\\b(?:tribe|children|lot|inheritance|cities|border|coast)\\s+of\\s+(?:the\\s+)?(?:tribe\\s+of\\s+)?(?:the\\s+)?(?:children\\s+of\\s+)?(${TRIBES.join("|")})\\b`,
  "g",
)
const placeName = new Map(places.map((p) => [p.id, p.name]))
function territory(town: string, region: string): Found | undefined {
  const tribe = TRIBES.find((t) => new RegExp(`(?:^|\\s)${t}(?:\\s|$)`).test(placeName.get(region) ?? ""))
  if (!tribe) return undefined
  for (const k of sortVerses(versesOf(town))) {
    const at = /^(?:josh|1chr)\./.test(k) ? new RegExp(pattern(town)).exec(text.get(k)!) : null
    if (!at) continue
    const chapter = k.slice(0, k.lastIndexOf(".") + 1)
    for (let i = order.get(k)!; i >= 0 && order.get(k)! - i < 60 && keys[i].startsWith(chapter); i--) {
      const before = keys[i] === k ? text.get(k)!.slice(0, at.index) : text.get(keys[i])!
      const heading = [...before.matchAll(HEADING)].at(-1)?.[1]
      if (heading) {
        if (heading === tribe) return [k, "territory-list"]
        break
      }
    }
  }
  return undefined
}

// --- Dates ----------------------------------------------------------------------

const mismatches: string[] = [] // dates the text gives different numbers for

function reignLength(e: Event): Found | undefined {
  const span = spanOf(e.date)
  if (!span) return undefined
  const years = span.end - span.start
  const kings = edges.filter((x) => x.type === "participated-in" && x.to === e.id).map((x) => x.from)
  const names = namePattern([e.name.replace(/^Reign of /, "").replace(/\s*\(.*\)$/, ""), ...kings.flatMap((id) => namesOf.get(id) ?? [])])
  const said = new Set<number>()
  for (const k of passage(e.id)) {
    const t = text.get(k)!
    if (!mentions(t, names) && !/\bhe\b/.test(t)) continue
    for (const n of yearsAfter(t, "reigned")) {
      if (Math.abs(n - years) <= 1) return [k, "reign-length"]
      said.add(n)
    }
  }
  if (said.size) mismatches.push(`${e.id}: the text gives a reign of ${[...said].join(" or ")} years; the dates span ${years}`)
  return undefined
}

function ageAtFatherhood(child: Person): Found | undefined {
  const born = spanOf(child.birth)?.start
  for (const parent of parents.get(child.id) ?? []) {
    const parentBorn = spanOf(person.get(parent)?.birth)?.start
    if (born === undefined || parentBorn === undefined) continue
    const hit = firstMatch(both(parent, child.id), (t) =>
      yearsAfter(t, "lived", "was", "being").includes(born - parentBorn) ? "age-at-fatherhood" : undefined,
    )
    if (hit) return hit
  }
  return undefined
}

function ageAtDeath(p: Person): Found | undefined {
  const [born, died] = [spanOf(p.birth)?.start, spanOf(p.death)?.start]
  if (born === undefined || died === undefined) return undefined
  // "and he died", or "the days of Isaac were an hundred and fourscore years"
  return firstMatch(sortVerses(versesOf(p.id)), (t) =>
    mentions(t, pattern(p.id)) &&
    /\b(?:died|dead|death|days\s+of)\b/.test(t) &&
    yearsAfter(t, "were", "being", "was", "lived", "of").some((n) => Math.abs(n - (died - born)) <= 1)
      ? "age-at-death"
      : undefined,
  )
}

// --- Scan -----------------------------------------------------------------------

const event = new Map(events.map((e) => [e.id, e]))

function scan(f: Fact): Found | undefined {
  const [a, b] = f.id.slice(f.id.indexOf(":") + 1).split(">")
  const pair = (rule: (t: string, x: string, y: string) => string | undefined) =>
    firstMatch(both(a, b), (t) => rule(t, pattern(a), pattern(b)))
  switch (f.kind) {
    case "parent-of": return pair(parentRule)
    case "partner-of": return pair(partnerRule)
    case "member-of": return membership(a, b)
    case "participated-in": return firstMatch(passage(b), named(a))
    case "occurred-at": return firstMatch(passage(a), named(b))
    case "visited": return pair(wentRule)
    case "died-at": return pair(diedRule)
    case "alias-of": return pair(sameRule)
    case "part-of": return pair(inRule) ?? territory(a, b)
    case "near": return pair(nearRule) ?? pair(inRule)
    case "date": return a.startsWith("reign-of-") && event.has(a) ? reignLength(event.get(a)!) : undefined
    case "birth": return ageAtFatherhood(person.get(a)!)
    case "death": return ageAtDeath(person.get(a)!)
    default: return undefined // house, note, lede: editorial prose, for the AI and editor passes
  }
}

const facts = enumerateFacts({ people, places, events, edges, periods, kingdoms })
const found = new Map(facts.map((f) => [f.key, scan(f)]))

// --- Self-test: made-up wrong parents must not pass ------------------------------

// Grandparents, uncles, and children recorded as parents. A rule loose enough
// to pass these would pass real errors too.
const real = new Set(edges.filter((e) => e.type === "parent-of").map((e) => `${e.from}>${e.to}`))
const fakes = new Set<string>()
for (const [child, ps] of parents)
  for (const p of ps) {
    fakes.add(`${child}>${p}`) // reversed
    for (const gp of parents.get(p) ?? []) {
      fakes.add(`${gp}>${child}`) // grandparent
      for (const uncle of childrenOf(gp)) if (uncle !== p) fakes.add(`${uncle}>${child}`)
    }
  }
const tested = [...fakes].filter((pair) => !real.has(pair) && pair.split(">").every((id) => person.has(id)))
const passed: Record<string, number> = {}
for (const pair of tested) {
  const [a, b] = pair.split(">")
  const hit = firstMatch(both(a, b), (t) => parentRule(t, pattern(a), pattern(b)))
  if (hit) passed[hit[1]] = (passed[hit[1]] ?? 0) + 1
}
const passedCount = Object.values(passed).reduce((x, y) => x + y, 0)
const FAKE_LIMIT = 0.05

// --- Output and report ------------------------------------------------------------

const out: MatchEvidence = {
  theographic: readJson("data/vendor/theographic/snapshot.json").commit,
  facts: Object.fromEntries(facts.map((f) => [f.key, found.get(f.key) ?? []])),
}
// One fact per line, so a re-scan diffs cleanly.
const body =
  `{\n  "theographic": ${JSON.stringify(out.theographic)},\n  "facts": {\n` +
  facts.map((f) => `    ${JSON.stringify(f.key)}: ${JSON.stringify(out.facts[f.key])}`).join(",\n") +
  `\n  }\n}\n`

const count = <T>(items: T[], key: (item: T) => string | undefined) => {
  const m = new Map<string, number>()
  for (const item of items) {
    const k = key(item)
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}
const matched = facts.filter((f) => found.get(f.key))
const matchedByKind = count(matched, (f) => f.kind)
const lines = ["Biblia Chronos — text match", "===========================", `Facts: ${facts.length}, matched ${matched.length}`]
for (const [kind, n] of [...count(facts, (f) => f.kind)].sort())
  lines.push(`  ${kind.padEnd(16)}${String(matchedByKind.get(kind) ?? 0).padStart(5)} / ${n}`)
lines.push("Rules:")
for (const [rule, n] of [...count(matched, (f) => found.get(f.key)![1])].sort((a, b) => b[1] - a[1])) lines.push(`  ${rule.padEnd(18)}${n}`)
if (mismatches.length) lines.push("Dates the text disagrees with:", ...mismatches.map((m) => `  ${m}`))
const rate = passedCount / Math.max(1, tested.length)
lines.push(
  `Self-test: ${passedCount} of ${tested.length} made-up wrong parent links passed (${(100 * rate).toFixed(1)}%, limit ${FAKE_LIMIT * 100}%)` +
    (passedCount ? `: ${Object.entries(passed).map(([r, n]) => `${r} ${n}`).join(", ")}` : ""),
)

let failed = rate > FAKE_LIMIT
if (failed) lines.push("✗ The parent rules are too loose: they pass made-up grandparents, uncles, or reversed links.")

const outPath = join(root, "data", "evidence", "matches.json")
if (process.argv.includes("--check")) {
  const current = existsSync(outPath) ? readFileSync(outPath, "utf8") : ""
  if (current === body) lines.push("\n✓ data/evidence/matches.json is up to date.")
  else {
    const before = new Map(Object.entries<unknown>(current ? JSON.parse(current).facts : {}).map(([k, v]) => [k, JSON.stringify(v)]))
    const after = new Map(Object.entries(out.facts).map(([k, v]) => [k, JSON.stringify(v)]))
    const diff = [
      ...[...after.keys()].filter((k) => !before.has(k)).map((k) => `+ ${k}`),
      ...[...before.keys()].filter((k) => !after.has(k)).map((k) => `- ${k}`),
      ...[...after.keys()].filter((k) => before.has(k) && before.get(k) !== after.get(k)).map((k) => `~ ${k}`),
    ]
    lines.push(`\n✗ data/evidence/matches.json is out of date (${diff.length} facts differ):`, ...diff.slice(0, 20).map((d) => `  ${d}`))
    lines.push("Run `npm run audit:scan` and commit the result.")
    failed = true
  }
} else {
  writeFileSync(outPath, body)
  lines.push(`\nWrote data/evidence/matches.json (${facts.length - matched.length} facts unmatched).`)
}

console.log(lines.join("\n"))
if (failed) process.exit(1)
