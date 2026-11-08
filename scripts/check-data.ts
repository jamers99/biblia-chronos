// Build-stage data integrity checker. Reads seed + overrides, merges them
// (overrides win by id), validates the *merged* result against the Zod schemas,
// and runs cross-record integrity checks. Exits non-zero on any error so a bad
// re-import or override fails the build before it reaches the browser.
//
//   npm run check:data      (also runs as the first step of `npm run build`)
//
// Errors block the build (structural problems we own). Warnings are reported
// but don't block (data-quality smells, often inherited from upstream).

import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { z, ZodError } from "zod"
import {
  Person,
  Place,
  Event,
  PeopleGroup,
  Period,
  Kingdom,
  Book,
  Edge,
  Source,
  EvidenceBatch,
  type EdgeType,
  type DateEstimate,
} from "../src/lib/data/schema.ts"
import { staleRemovals } from "../src/lib/data/merge.ts"
import { enumerateFacts, factId, type MatchEvidence } from "../src/lib/evidence.ts"
import { parseVerse } from "../src/lib/scripture.ts"
import { loadData, readJson, readOverride, readSeed, root } from "./data.ts"

const errors: string[] = []
const warnings: string[] = []
const err = (msg: string) => errors.push(msg)
const warn = (msg: string) => warnings.push(msg)

// --- Merge seed + overrides -------------------------------------------------

const sources = readJson("data/sources.json")
const merged = loadData()

// --- 1. Schema validation ---------------------------------------------------

const validate = <T>(label: string, schema: z.ZodType<T>, rows: unknown[]): T[] => {
  try {
    return z.array(schema).parse(rows)
  } catch (e) {
    if (e instanceof ZodError)
      for (const issue of e.issues.slice(0, 20))
        err(`schema [${label}] ${issue.path.join(".")}: ${issue.message}`)
    return []
  }
}

const sourceList = validate("sources", Source, sources)
const people = validate("people", Person, merged.people)
const places = validate("places", Place, merged.places)
const events = validate("events", Event, merged.events)
const peopleGroups = validate("peopleGroups", PeopleGroup, merged.peopleGroups)
const periods = validate("periods", Period, merged.periods)
const kingdoms = validate("kingdoms", Kingdom, merged.kingdoms)
const books = validate("books", Book, merged.books)
const edges = validate("edges", Edge, merged.edges)

// Schema failures make everything below unreliable — report and stop early.
if (errors.length) {
  finish()
}

// --- Index entities ---------------------------------------------------------

type Kind = "person" | "place" | "event" | "peopleGroup" | "period"
const entityKind = new Map<string, Kind>()
const claim = (id: string, kind: Kind) => {
  if (entityKind.has(id)) err(`duplicate entity id "${id}" (${entityKind.get(id)} & ${kind})`)
  else entityKind.set(id, kind)
}
for (const p of people) claim(p.id, "person")
for (const p of places) claim(p.id, "place")
for (const e of events) claim(e.id, "event")
for (const g of peopleGroups) claim(g.id, "peopleGroup")
for (const p of periods) claim(p.id, "period")

const sourceIds = new Set(sourceList.map((s) => s.id))
const bookIds = new Set(books.map((b) => b.id))

// --- 2. Sources resolve -----------------------------------------------------

const allEntities = [...people, ...places, ...events, ...peopleGroups]
const allRecords = [...allEntities, ...periods] // periods have no edges by design
for (const e of allRecords)
  if (!sourceIds.has(e.source)) err(`entity "${e.id}" references unknown source "${e.source}"`)
for (const e of edges)
  if (!sourceIds.has(e.source)) err(`edge ${e.from}->${e.to} references unknown source "${e.source}"`)

// The Theographic source links to the exact snapshot we import from, so a
// re-vendor has to move the link along with it.
const snapshot = readJson("data/vendor/theographic/snapshot.json")
const theographic = sourceList.find((s) => s.id === "theographic")
if (theographic && !theographic.url?.includes(snapshot.commit))
  err(`source "theographic" url should point at the vendored commit ${snapshot.commit} (see snapshot.json)`)

// --- 3. Scripture refs resolve to a known book ------------------------------

for (const e of allRecords)
  for (const ref of e.scriptureRefs ?? [])
    if (!bookIds.has(ref.book))
      err(`entity "${e.id}" has scriptureRef to unknown book "${ref.book}"`)

// --- 4. Edge endpoints resolve, with the right kinds ------------------------

const EDGE_ENDPOINTS: Record<EdgeType, [string, string]> = {
  "parent-of": ["person", "person"],
  "sibling-of": ["person", "person"],
  "half-sibling-of": ["person", "person"],
  "partner-of": ["person", "person"],
  "member-of": ["person", "peopleGroup"],
  "participated-in": ["person", "event"],
  "occurred-at": ["event", "place"],
  "died-at": ["person", "place"],
  "visited": ["person", "place"],
  "part-of": ["place", "place"],
  "near": ["place", "place"],
  "alias-of": ["place", "place"],
}

let dangling = 0
for (const e of edges) {
  const [wantFrom, wantTo] = EDGE_ENDPOINTS[e.type]
  const fromKind = entityKind.get(e.from)
  const toKind = entityKind.get(e.to)
  if (!fromKind || !toKind) {
    dangling++
    err(`dangling edge ${e.from} -[${e.type}]-> ${e.to} (${!fromKind ? "from" : "to"} not found)`)
  } else if (fromKind !== wantFrom || toKind !== wantTo) {
    err(
      `edge ${e.from} -[${e.type}]-> ${e.to} has wrong kinds: ` +
        `${fromKind}->${toKind}, expected ${wantFrom}->${wantTo}`,
    )
  }
}

// --- 5. Date ranges are ordered (earliest <= latest) ------------------------

const checkDate = (id: string, field: string, d: DateEstimate | undefined) => {
  if (d?.earliest !== undefined && d?.latest !== undefined && d.earliest > d.latest)
    err(`"${id}" ${field} range inverted: earliest ${d.earliest} > latest ${d.latest}`)
}
for (const p of people) {
  checkDate(p.id, "birth", p.birth)
  checkDate(p.id, "death", p.death)
}
for (const p of places) checkDate(p.id, "date", p.date)
for (const e of events) checkDate(e.id, "date", e.date)
for (const p of periods) checkDate(p.id, "date", p.date)

// Periods are sequential eras: sorted by start, each must end before (or as)
// the next begins, so the timeline can draw them as one band.
const byStart = [...periods].sort((a, b) => a.date.earliest - b.date.earliest)
for (let i = 1; i < byStart.length; i++)
  if (byStart[i].date.earliest < byStart[i - 1].date.latest)
    err(`period "${byStart[i].id}" overlaps "${byStart[i - 1].id}"`)

// A period's map chapter names places (which must be locatable), events, and
// people that exist.
const locatable = new Set(places.filter((p) => p.coordinates).map((p) => p.id))
for (const p of periods) {
  const check = (ids: string[] = [], kind: Kind) => {
    for (const id of ids)
      if (entityKind.get(id) !== kind) err(`period "${p.id}" names "${id}", which isn't a known ${kind}`)
      else if (kind === "place" && !locatable.has(id)) err(`period "${p.id}" names place "${id}", which has no coordinates`)
  }
  check(p.places, "place")
  check(p.journey?.places, "place")
  check(p.moments, "event")
  check(p.people, "person")
}

// A kingdom's span and reigns are dated events; each reign falls within the
// kingdom's span and is listed once.
const eventById = new Map(events.map((e) => [e.id, e]))
const reignedIn = new Map<string, string>()
for (const k of kingdoms) {
  if (!sourceIds.has(k.source)) err(`kingdom "${k.id}" references unknown source "${k.source}"`)
  if (k.place && entityKind.get(k.place) !== "place") err(`kingdom "${k.id}" place "${k.place}" isn't a known place`)
  const span = eventById.get(k.event)?.date
  if (span?.earliest === undefined || span.latest === undefined) {
    err(`kingdom "${k.id}" event "${k.event}" isn't a known, dated event`)
    continue
  }
  for (const r of k.reigns) {
    const d = eventById.get(r.event)?.date
    if (d?.earliest === undefined || d.latest === undefined) err(`kingdom "${k.id}" reign "${r.event}" isn't a known, dated event`)
    else if (d.earliest < span.earliest || d.latest > span.latest) err(`kingdom "${k.id}" reign "${r.event}" falls outside the kingdom's span`)
    if (reignedIn.has(r.event)) err(`reign "${r.event}" is listed in both "${reignedIn.get(r.event)}" and "${k.id}"`)
    reignedIn.set(r.event, k.id)
  }
}

// --- 6. Edge tombstones still remove something (warning only) --------------

for (const e of staleRemovals(readSeed("edges.json"), readOverride("edges.json")))
  warn(`override removes ${e.from} -${e.type}-> ${e.to}, but seed has no such edge: the tombstone can go`)

// --- 7. Evidence (data/evidence/) --------------------------------------------
//
// Every review is keyed `id@hash`. A key whose id is gone, or whose hash no
// longer matches the data (an override changed a date, a re-import changed a
// link), is a review of something the site no longer shows: warn, so it gets
// moved or re-checked rather than silently dropped. The text match's file must
// cover exactly the current facts; if not, it's behind.

const evidenceDir = join(root, "data", "evidence")
const evidence = (file: string) => readJson(`data/evidence/${file}`)
const facts = enumerateFacts({ people, places, events, edges, periods, kingdoms })
const factKeys = new Set(facts.map((f) => f.key))
const keyOfId = new Map(facts.map((f) => [f.id, f.key]))
const bookChapters = new Map(books.map((b) => [b.id, b.chapterCount]))
const checkVerse = (where: string, ref: string) => {
  const v = parseVerse(ref)
  const chapters = v && bookChapters.get(v.book)
  if (!v || !chapters) err(`${where}: "${ref}" isn't a verse of a known book`)
  else if (v.chapter > chapters) err(`${where}: "${ref}" — ${v.book} has ${chapters} chapters`)
}
const staleOrGone = (key: string) => {
  const current = keyOfId.get(factId(key))
  return current ? `the data changed since it was reviewed (now ${current})` : "no such fact any more"
}

if (existsSync(join(evidenceDir, "matches.json"))) {
  const matches = evidence("matches.json") as MatchEvidence
  const scanned = Object.keys(matches.facts)
  const unseen = facts.filter((f) => !(f.key in matches.facts))
  const gone = scanned.filter((k) => !factKeys.has(k))
  if (unseen.length || gone.length)
    warn(
      `data/evidence/matches.json is behind the data (${unseen.length} new or changed facts, ${gone.length} gone, ` +
        `e.g. ${[...unseen.map((f) => f.key), ...gone].slice(0, 2).join(", ")}): run \`npm run audit:scan\``,
    )
  if (matches.theographic !== snapshot.commit)
    warn(`data/evidence/matches.json read Theographic ${matches.theographic.slice(0, 7)}, but the snapshot is ${snapshot.commit.slice(0, 7)}: run \`npm run audit:scan\``)
  for (const [key, found] of Object.entries(matches.facts)) if (found[0]) checkVerse(`matches.json ${key}`, found[0])
} else warn("data/evidence/matches.json is missing: run `npm run audit:scan`")

const batchFiles = existsSync(evidenceDir) ? readdirSync(evidenceDir).filter((f) => f.endsWith(".json") && f !== "matches.json") : []
const reviewedIn = new Map<string, string>()
for (const file of batchFiles.sort()) {
  const where = `evidence/${file}`
  const parsed = EvidenceBatch.safeParse(evidence(file))
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 5)) err(`${where} ${issue.path.join(".")}: ${issue.message}`)
    continue
  }
  const batch = parsed.data
  if (!batch.ai && !batch.editor) err(`${where}: says neither who (ai) nor which editor reviewed it`)
  const keys = [...(batch.agreed ?? []), ...Object.keys(batch.facts ?? {})]
  for (const key of keys) {
    if (reviewedIn.has(factId(key))) err(`${where}: ${factId(key)} is also reviewed in ${reviewedIn.get(factId(key))}; each fact lives in one batch`)
    reviewedIn.set(factId(key), file)
    if (!factKeys.has(key)) warn(`${where}: ${key} — ${staleOrGone(key)}`)
  }
  for (const key of batch.editor?.read ?? []) if (!keys.includes(key)) err(`${where}: editor.read lists ${key}, which isn't in this batch`)
  for (const [key, entry] of Object.entries(batch.facts ?? {})) {
    if ((entry.kind === undefined || entry.kind === "verse" || entry.kind === "reading") && !entry.refs?.length && !entry.sources?.length)
      err(`${where}: ${key} has no verse or source; a "${entry.kind ?? "verse"}" entry needs one`)
    if (entry.kind === "reading" && !entry.note) err(`${where}: ${key} is a reading, so it needs a note saying which and why`)
    for (const ref of entry.refs ?? []) checkVerse(`${where} ${key}`, ref)
    for (const src of entry.sources ?? []) if (!sourceIds.has(src)) err(`${where}: ${key} cites unknown source "${src}"`)
  }
}

// --- 8. Orphans (warning only) ----------------------------------------------

const connected = new Set<string>()
for (const e of edges) {
  connected.add(e.from)
  connected.add(e.to)
}
const orphans = allEntities.filter((e) => !connected.has(e.id))
if (orphans.length)
  warn(
    `${orphans.length} of ${allEntities.length} entities have no edges ` +
      `(e.g. ${orphans.slice(0, 3).map((o) => o.id).join(", ")})`,
  )

// --- Report -----------------------------------------------------------------

finish()

function finish(): never {
  const lines: string[] = []
  lines.push("Biblia Chronos — data integrity check")
  lines.push("======================================")
  lines.push(
    `Records: ${people.length} people · ${places.length} places · ${events.length} events · ` +
      `${peopleGroups.length} groups · ${periods.length} periods · ${kingdoms.length} kingdoms · ${books.length} books · ` +
      `${edges.length} edges`,
  )
  if (warnings.length) {
    lines.push(`\nWarnings (${warnings.length}):`)
    for (const w of warnings.slice(0, 30)) lines.push(`  ⚠ ${w}`)
    if (warnings.length > 30) lines.push(`  … and ${warnings.length - 30} more`)
  }
  if (errors.length) {
    lines.push(`\nErrors (${errors.length}):`)
    for (const e of errors.slice(0, 50)) lines.push(`  ✗ ${e}`)
    if (errors.length > 50) lines.push(`  … and ${errors.length - 50} more`)
    lines.push("\nFAILED — fix the errors above before building.")
    console.error(lines.join("\n"))
    process.exit(1)
  }
  lines.push("\n✓ All integrity checks passed.")
  console.log(lines.join("\n"))
  process.exit(0)
}
