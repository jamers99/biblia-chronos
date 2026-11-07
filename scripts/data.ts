// Reading the data from disk, for the scripts (the site reads it through Vite,
// in src/lib/data/load.ts). Seed and overrides are merged the same way in both.

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { mergeEntities, mergeEdges } from "../src/lib/data/merge.ts"
import type { Book, Edge, Event, Kingdom, PeopleGroup, Period, Person, Place } from "../src/lib/data/schema.ts"

export const root = join(import.meta.dirname, "..")

export const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"))
export const readSeed = (name: string) => readJson(`data/seed/${name}`)
export const readOverride = (name: string): any[] =>
  existsSync(join(root, "data/overrides", name)) ? readJson(`data/overrides/${name}`) : []

// Seed + overrides, merged (overrides win by id), not yet validated.
export function loadData() {
  const merged = <T extends { id: string }>(name: string): T[] => mergeEntities(readSeed(name), readOverride(name))
  return {
    people: merged<Person>("people.json"),
    places: merged<Place>("places.json"),
    events: merged<Event>("events.json"),
    peopleGroups: merged<PeopleGroup>("peopleGroups.json"),
    books: merged<Book>("books.json"),
    periods: readOverride("periods.json") as Period[], // hand-authored only, no seed
    kingdoms: readOverride("kingdoms.json") as Kingdom[], // hand-authored only, no seed
    edges: mergeEdges(readSeed("edges.json"), readOverride("edges.json")) as Edge[],
  }
}

// The KJV text by verse key ("gen.25.19"), in canonical order, from
// Theographic's verses.json (gitignored: `npm run vendor:fetch` restores it).
export function loadVerses(books: Book[]): Map<string, string> {
  const path = "data/vendor/theographic/verses.json"
  if (!existsSync(join(root, path))) {
    console.error(`${path} is missing: run \`npm run vendor:fetch\` first.`)
    process.exit(1)
  }
  const idOf = new Map(books.map((b) => [b.osis, b.id]))
  const text = new Map<string, string>()
  for (const { fields } of readJson(path) as { fields: { osisRef: string; verseText: string } }[]) {
    const [osis, chapter, verse] = fields.osisRef.split(".")
    if (idOf.has(osis)) text.set(`${idOf.get(osis)}.${chapter}.${verse}`, fields.verseText)
  }
  return text
}
