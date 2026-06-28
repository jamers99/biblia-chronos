// Build-stage data integrity checker. Reads seed + overrides, merges them
// (overrides win by id), validates the *merged* result against the Zod schemas,
// and runs cross-record integrity checks. Exits non-zero on any error so a bad
// re-import or override fails the build before it reaches the browser.
//
//   npm run check:data      (also runs as the first step of `npm run build`)
//
// Errors block the build (structural problems we own). Warnings are reported
// but don't block (data-quality smells, often inherited from upstream).

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { z, ZodError } from "zod"
import {
  Person,
  Place,
  Event,
  PeopleGroup,
  Book,
  Edge,
  Source,
  type EdgeType,
  type DateEstimate,
} from "../src/lib/data/schema.ts"
import { mergeEntities, mergeEdges } from "../src/lib/data/merge.ts"

const root = join(import.meta.dirname, "..")
const seedDir = join(root, "data", "seed")
const overrideDir = join(root, "data", "overrides")

const readJson = (path: string): any[] => JSON.parse(readFileSync(path, "utf8"))
const readSeed = (name: string) => readJson(join(seedDir, name))
const readOverride = (name: string): any[] => {
  const path = join(overrideDir, name)
  return existsSync(path) ? readJson(path) : []
}

const errors: string[] = []
const warnings: string[] = []
const err = (msg: string) => errors.push(msg)
const warn = (msg: string) => warnings.push(msg)

// --- Merge seed + overrides -------------------------------------------------

const sources = readJson(join(root, "data", "sources.json"))
const merged = {
  people: mergeEntities(readSeed("people.json"), readOverride("people.json")),
  places: mergeEntities(readSeed("places.json"), readOverride("places.json")),
  events: mergeEntities(readSeed("events.json"), readOverride("events.json")),
  peopleGroups: mergeEntities(readSeed("peopleGroups.json"), readOverride("peopleGroups.json")),
  books: mergeEntities(readSeed("books.json"), readOverride("books.json")),
  edges: mergeEdges(readSeed("edges.json"), readOverride("edges.json")),
}

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
const books = validate("books", Book, merged.books)
const edges = validate("edges", Edge, merged.edges)

// Schema failures make everything below unreliable — report and stop early.
if (errors.length) {
  finish()
}

// --- Index entities ---------------------------------------------------------

const entityKind = new Map<string, "person" | "place" | "event" | "peopleGroup">()
const claim = (id: string, kind: "person" | "place" | "event" | "peopleGroup") => {
  if (entityKind.has(id)) err(`duplicate entity id "${id}" (${entityKind.get(id)} & ${kind})`)
  else entityKind.set(id, kind)
}
for (const p of people) claim(p.id, "person")
for (const p of places) claim(p.id, "place")
for (const e of events) claim(e.id, "event")
for (const g of peopleGroups) claim(g.id, "peopleGroup")

const sourceIds = new Set(sourceList.map((s) => s.id))
const bookIds = new Set(books.map((b) => b.id))

// --- 2. Sources resolve -----------------------------------------------------

const allEntities = [...people, ...places, ...events, ...peopleGroups]
for (const e of allEntities)
  if (!sourceIds.has(e.source)) err(`entity "${e.id}" references unknown source "${e.source}"`)
for (const e of edges)
  if (!sourceIds.has(e.source)) err(`edge ${e.from}->${e.to} references unknown source "${e.source}"`)

// --- 3. Scripture refs resolve to a known book ------------------------------

for (const e of allEntities)
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
  checkDate(p.id, "lived", p.lived)
}
for (const e of events) checkDate(e.id, "date", e.date)

// --- 6. Orphans (warning only) ----------------------------------------------

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
      `${peopleGroups.length} groups · ${books.length} books · ${edges.length} edges`,
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
