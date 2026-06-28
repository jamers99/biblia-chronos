// Importer: Theographic raw export -> our canonical seed files.
//
// Run by hand, reviewing the diff: `npm run import:theographic`
// (run `npm run vendor:fetch` first if verses.json is missing).
//
// Reads only from data/vendor/theographic/, validates every record against the
// Zod schemas in src/lib/data/schema.ts, and writes data/seed/*.json. Output is
// deterministic: same snapshot in => byte-identical files out, so a re-import is
// a clean, reviewable git diff. See docs/data-pipeline-spec.md for the contract.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import {
  Person,
  Place,
  Event,
  PeopleGroup,
  Book,
  Edge,
  Source,
  type DateEstimate,
  type ScriptureRef,
  type EdgeType,
} from "../src/lib/data/schema.ts"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const vendorDir = join(root, "data", "vendor", "theographic")
const seedDir = join(root, "data", "seed")

const SOURCE = "theographic"

// --- Upstream record shape --------------------------------------------------

type Raw = { id: string; createdTime?: string; fields: Record<string, any> }

function readVendor(name: string): Raw[] {
  const path = join(vendorDir, name)
  let text: string
  try {
    text = readFileSync(path, "utf8")
  } catch {
    throw new Error(
      `Missing vendor file ${name}. Run \`npm run vendor:fetch\` to restore the gitignored files.`,
    )
  }
  return JSON.parse(text)
}

// --- Small helpers ----------------------------------------------------------

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// dictText arrives as markdown (with [text](link) refs). We keep the prose and
// drop the link targets, then collapse whitespace.
function stripMarkup(value: unknown): string | undefined {
  const parts = Array.isArray(value) ? value : value == null ? [] : [value]
  const text = parts
    .map((p) => String(p))
    .join("\n\n")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](url) -> text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text.length ? text : undefined
}

function toYear(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

// A single known year fills both ends of the range.
function yearEstimate(value: unknown): DateEstimate | undefined {
  const y = toYear(value)
  return y === undefined ? undefined : { earliest: y, latest: y }
}

function spanEstimate(min: unknown, max: unknown): DateEstimate | undefined {
  const a = toYear(min)
  const b = toYear(max)
  if (a === undefined && b === undefined) return undefined
  const est: DateEstimate = {}
  if (a !== undefined) est.earliest = a
  if (b !== undefined) est.latest = b
  return est
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value : []
}

// --- Slug assignment (rec-id -> canonical id) -------------------------------

// Generated slugs (events, peopleGroups) must be stable across re-imports:
// derive from a stable field, break collisions with a stable upstream id, never
// a running counter. We compute base slugs for everyone, then only the records
// sharing a base slug get the tie-breaker appended — so unique names stay clean.
function assignGeneratedSlugs(
  records: Raw[],
  baseOf: (r: Raw) => string,
  tieIdOf: (r: Raw) => string,
): { map: Map<string, string>; collisions: number } {
  const baseCounts = new Map<string, number>()
  for (const r of records) {
    const base = slugify(baseOf(r)) || slugify(tieIdOf(r))
    baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1)
  }
  const map = new Map<string, string>()
  const used = new Set<string>()
  let collisions = 0
  for (const r of records) {
    const base = slugify(baseOf(r)) || slugify(tieIdOf(r))
    let slug = base
    if ((baseCounts.get(base) ?? 0) > 1) {
      slug = `${base}-${slugify(tieIdOf(r))}`
      collisions++
    }
    if (used.has(slug)) {
      // Defensive: should not happen, since tie ids are unique.
      throw new Error(`Generated slug collision could not be resolved: ${slug}`)
    }
    used.add(slug)
    map.set(r.id, slug)
  }
  return { map, collisions }
}

// --- Main -------------------------------------------------------------------

const report: string[] = []
const log = (line: string) => report.push(line)

// 0. Sources must contain the key we stamp on everything.
const sources: unknown = JSON.parse(
  readFileSync(join(root, "data", "sources.json"), "utf8"),
)
const parsedSources = z.array(Source).parse(sources)
if (!parsedSources.some((s) => s.id === SOURCE)) {
  throw new Error(`data/sources.json is missing the "${SOURCE}" source entry.`)
}

// 1. Read the vendored snapshot.
const rawPeople = readVendor("people.json")
const rawPlaces = readVendor("places.json")
const rawEvents = readVendor("events.json")
const rawGroups = readVendor("peopleGroups.json")
const rawBooks = readVendor("books.json")
const rawVerses = readVendor("verses.json")

// 2. rec-id -> canonical id maps.
const personId = new Map<string, string>()
for (const r of rawPeople) personId.set(r.id, String(r.fields.personLookup))

const placeId = new Map<string, string>()
for (const r of rawPlaces)
  placeId.set(r.id, String(r.fields.placeLookup ?? r.fields.slug))

const bookId = new Map<string, string>() // rec-id -> "gen"
const bookOrder = new Map<string, number>() // canonical id -> bookOrder
for (const r of rawBooks) {
  const id = String(r.fields.osisName).toLowerCase()
  bookId.set(r.id, id)
  bookOrder.set(id, Number(r.fields.bookOrder))
}

const { map: eventId, collisions: eventCollisions } = assignGeneratedSlugs(
  rawEvents,
  (r) => String(r.fields.title ?? ""),
  (r) => String(r.fields.eventID ?? r.id),
)
const { map: groupId, collisions: groupCollisions } = assignGeneratedSlugs(
  rawGroups,
  (r) => String(r.fields.groupName ?? ""),
  (r) => r.id, // no numeric id upstream; Airtable rec-id is stable per snapshot
)

// 3. verse rec-id -> ScriptureRef, built from osisRef ("Gen.1.1").
const verseRef = new Map<string, ScriptureRef>()
let verseSkipped = 0
for (const r of rawVerses) {
  const osisRef = r.fields.osisRef as string | undefined
  const parts = osisRef ? osisRef.split(".") : []
  if (parts.length !== 3) {
    verseSkipped++
    continue
  }
  const book = parts[0].toLowerCase()
  const chapter = Number(parts[1])
  const verse = Number(parts[2])
  if (!bookOrder.has(book) || !Number.isInteger(chapter) || !Number.isInteger(verse)) {
    verseSkipped++
    continue
  }
  verseRef.set(r.id, { book, chapter, verse })
}

// Resolve a `verses` array of rec-ids into sorted, de-duplicated ScriptureRefs.
let unresolvedVerseRefs = 0
function resolveScriptureRefs(verses: unknown): ScriptureRef[] | undefined {
  const ids = asArray(verses)
  const seen = new Set<string>()
  const refs: ScriptureRef[] = []
  for (const id of ids) {
    const ref = verseRef.get(id)
    if (!ref) {
      unresolvedVerseRefs++
      continue
    }
    const key = `${ref.book}|${ref.chapter}|${ref.verse}`
    if (seen.has(key)) continue
    seen.add(key)
    refs.push(ref)
  }
  if (!refs.length) return undefined
  refs.sort(
    (a, b) =>
      (bookOrder.get(a.book)! - bookOrder.get(b.book)!) ||
      a.chapter - b.chapter ||
      a.verse - b.verse,
  )
  return refs
}

const mapStatus = (s: unknown): "published" | "draft" =>
  s === "wip" ? "draft" : "published"

// Set of canonical person ids, for fields that already carry our slugs rather
// than Airtable rec-ids (e.g. places.hasBeenHere is a comma-joined string of
// personLookups, not a linked-record array like the other relationship fields).
const personCanonical = new Set(personId.values())

// --- Edge accumulation ------------------------------------------------------

type RawEdge = { from: string; to: string; type: EdgeType }
const directional: RawEdge[] = []
const symmetric: RawEdge[] = []
const dropped = new Map<EdgeType, number>()
const SYMMETRIC = new Set<EdgeType>(["sibling-of", "half-sibling-of", "partner-of"])

// resolvers per endpoint type
function add(
  type: EdgeType,
  fromRec: string | undefined,
  toRec: string | undefined,
  fromMap: Map<string, string>,
  toMap: Map<string, string>,
) {
  const from = fromRec ? fromMap.get(fromRec) : undefined
  const to = toRec ? toMap.get(toRec) : undefined
  if (!from || !to || from === to) {
    if (!from || !to) dropped.set(type, (dropped.get(type) ?? 0) + 1)
    return
  }
  ;(SYMMETRIC.has(type) ? symmetric : directional).push({ from, to, type })
}

// --- Transform entities (and emit their edges) ------------------------------

const people = rawPeople.map((r) => {
  const f = r.fields
  const id = personId.get(r.id)!
  const gender =
    typeof f.gender === "string"
      ? (f.gender.toLowerCase() as "male" | "female")
      : undefined

  // relationships -> edges
  for (const fatherRec of asArray(f.father))
    add("parent-of", fatherRec, r.id, personId, personId)
  for (const motherRec of asArray(f.mother))
    add("parent-of", motherRec, r.id, personId, personId)
  for (const childRec of asArray(f.children))
    add("parent-of", r.id, childRec, personId, personId)
  for (const sibRec of asArray(f.siblings))
    add("sibling-of", r.id, sibRec, personId, personId)
  for (const sibRec of asArray(f.halfSiblingsSameMother))
    add("half-sibling-of", r.id, sibRec, personId, personId)
  for (const sibRec of asArray(f.halfSiblingsSameFather))
    add("half-sibling-of", r.id, sibRec, personId, personId)
  for (const partnerRec of asArray(f.partners))
    add("partner-of", r.id, partnerRec, personId, personId)
  for (const groupRec of asArray(f.memberOf))
    add("member-of", r.id, groupRec, personId, groupId)

  return {
    kind: "person" as const,
    id,
    name: String(f.name ?? id),
    status: mapStatus(f.status),
    source: SOURCE,
    description: stripMarkup(f.dictText),
    displayTitle: f.displayTitle ? String(f.displayTitle) : undefined,
    isProperName: typeof f.isProperName === "boolean" ? f.isProperName : undefined,
    gender,
    birth: yearEstimate(f.birthYear),
    death: yearEstimate(f.deathYear),
    lived: spanEstimate(f.minYear, f.maxYear),
    scriptureRefs: resolveScriptureRefs(f.verses),
  }
})

const places = rawPlaces.map((r) => {
  const f = r.fields
  const id = placeId.get(r.id)!

  // coordinates: prefer curated, then OpenBible, then Recogito.
  let coordinates: { lat: number; lng: number } | undefined
  const pairs: [unknown, unknown][] = [
    [f.latitude, f.longitude],
    [f.openBibleLat, f.openBibleLong],
    [f.recogitoLat, f.recogitoLon],
  ]
  for (const [latRaw, lngRaw] of pairs) {
    const lat = Number(latRaw)
    const lng = Number(lngRaw)
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      coordinates = { lat, lng }
      break
    }
  }

  const altNames = [f.esvName, f.kjvName]
    .filter((n): n is string => typeof n === "string" && n.length > 0)
    .filter((n, i, a) => a.indexOf(n) === i)

  // relationships -> edges
  for (const eventRec of asArray(f.eventsHere))
    add("occurred-at", eventRec, r.id, eventId, placeId)
  for (const personRec of asArray(f.peopleDied))
    add("died-at", personRec, r.id, personId, placeId)
  // hasBeenHere is a comma-joined string of canonical personLookups, not rec-ids.
  if (typeof f.hasBeenHere === "string") {
    for (const lookup of f.hasBeenHere.split(",").map((s: string) => s.trim())) {
      if (!lookup) continue
      if (personCanonical.has(lookup))
        directional.push({ from: lookup, to: id, type: "visited" })
      else dropped.set("visited", (dropped.get("visited") ?? 0) + 1)
    }
  }

  return {
    kind: "place" as const,
    id,
    name: String(f.esvName ?? f.kjvName ?? id),
    status: mapStatus(f.status),
    source: SOURCE,
    description: stripMarkup(f.dictText),
    coordinates,
    featureType: f.featureType ? String(f.featureType) : undefined,
    featureSubType: f.featureSubType ? String(f.featureSubType) : undefined,
    altNames: altNames.length ? altNames : undefined,
    scriptureRefs: resolveScriptureRefs(f.verses),
  }
})

const events = rawEvents.map((r) => {
  const f = r.fields
  const id = eventId.get(r.id)!

  // date: earliest from startDate; latest from startDate + duration.
  let date: DateEstimate | undefined
  const start = toYear(f.startDate)
  if (start !== undefined) {
    let latest = start
    const m = /^(\d+(?:\.\d+)?)\s*([YyDd])$/.exec(String(f.duration ?? ""))
    if (m && m[2].toUpperCase() === "Y") latest = start + Math.round(Number(m[1]))
    date = { earliest: start, latest }
  }

  for (const personRec of asArray(f.participants))
    add("participated-in", personRec, r.id, personId, eventId)
  for (const placeRec of asArray(f.locations))
    add("occurred-at", r.id, placeRec, eventId, placeId)

  return {
    kind: "event" as const,
    id,
    name: String(f.title ?? id),
    status: "published" as const,
    source: SOURCE,
    date,
    scriptureRefs: resolveScriptureRefs(f.verses),
  }
})

const peopleGroups = rawGroups.map((r) => {
  const f = r.fields
  const id = groupId.get(r.id)!

  for (const personRec of asArray(f.members))
    add("member-of", personRec, r.id, personId, groupId)

  return {
    kind: "peopleGroup" as const,
    id,
    name: String(f.groupName ?? id),
    status: "published" as const,
    source: SOURCE,
    scriptureRefs: resolveScriptureRefs(f.verses),
  }
})

const books = rawBooks.map((r) => {
  const f = r.fields
  return {
    id: bookId.get(r.id)!,
    name: String(f.bookName),
    shortName: f.shortName ? String(f.shortName) : undefined,
    osis: String(f.osisName),
    order: Number(f.bookOrder),
    chapterCount: Number(f.chapterCount),
    testament: f.testament as "Old Testament" | "New Testament",
    division: f.bookDiv ? String(f.bookDiv) : undefined,
  }
})

// --- Finalize edges: normalize symmetric, dedupe, merge ---------------------

for (const e of symmetric) {
  if (e.from > e.to) {
    const t = e.from
    e.from = e.to
    e.to = t
  }
}
const allEdges = [...directional, ...symmetric]
const edgeSeen = new Set<string>()
const edges: z.infer<typeof Edge>[] = []
for (const e of allEdges) {
  const key = `${e.from}|${e.to}|${e.type}`
  if (edgeSeen.has(key)) continue
  edgeSeen.add(key)
  edges.push({ from: e.from, to: e.to, type: e.type, source: SOURCE })
}

// --- Validate ---------------------------------------------------------------

const validated = {
  people: z.array(Person).parse(people),
  places: z.array(Place).parse(places),
  events: z.array(Event).parse(events),
  peopleGroups: z.array(PeopleGroup).parse(peopleGroups),
  books: z.array(Book).parse(books),
  edges: z.array(Edge).parse(edges),
}

// --- Sort for deterministic output ------------------------------------------

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
validated.people.sort(byId)
validated.places.sort(byId)
validated.events.sort(byId)
validated.peopleGroups.sort(byId)
validated.books.sort(byId)
validated.edges.sort(
  (a, b) =>
    (a.from < b.from ? -1 : a.from > b.from ? 1 : 0) ||
    (a.to < b.to ? -1 : a.to > b.to ? 1 : 0) ||
    (a.type < b.type ? -1 : a.type > b.type ? 1 : 0),
)

// --- Write ------------------------------------------------------------------

mkdirSync(seedDir, { recursive: true })
const writeJson = (name: string, data: unknown) =>
  writeFileSync(join(seedDir, name), JSON.stringify(data, null, 2) + "\n")

writeJson("people.json", validated.people)
writeJson("places.json", validated.places)
writeJson("events.json", validated.events)
writeJson("peopleGroups.json", validated.peopleGroups)
writeJson("books.json", validated.books)
writeJson("edges.json", validated.edges)

// --- Report -----------------------------------------------------------------

const edgeCounts = new Map<string, number>()
for (const e of validated.edges)
  edgeCounts.set(e.type, (edgeCounts.get(e.type) ?? 0) + 1)

log("Biblia Chronos — Theographic import")
log("====================================")
log("Entities:")
log(`  people        ${validated.people.length}`)
log(`  places        ${validated.places.length}`)
log(`  events        ${validated.events.length}`)
log(`  peopleGroups  ${validated.peopleGroups.length}`)
log(`  books         ${validated.books.length}`)
log("Edges:")
for (const type of [
  "parent-of",
  "sibling-of",
  "half-sibling-of",
  "partner-of",
  "member-of",
  "participated-in",
  "occurred-at",
  "died-at",
  "visited",
])
  log(`  ${type.padEnd(16)}${edgeCounts.get(type) ?? 0}`)
log(`  ${"TOTAL".padEnd(16)}${validated.edges.length}`)
log("Dropped (dangling) edges:")
const droppedTotal = [...dropped.values()].reduce((a, b) => a + b, 0)
if (droppedTotal === 0) log("  (none)")
else for (const [type, n] of [...dropped].sort()) log(`  ${type.padEnd(16)}${n}`)
log(`  ${"TOTAL".padEnd(16)}${droppedTotal}`)
log("Other:")
log(`  unresolved verse refs   ${unresolvedVerseRefs}`)
log(`  verses skipped (no/bad osisRef)  ${verseSkipped}`)
log(`  generated-slug collisions: events ${eventCollisions}, peopleGroups ${groupCollisions}`)

console.log(report.join("\n"))
