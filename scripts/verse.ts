// Print KJV verses from Theographic's verses.json, for reviewing evidence.
//
//   npm run verse -- gen.25.19 2kgs.25.1-10 esth.2
//
// A key is book.chapter.verse ("gen.25.19"), a range ("2kgs.25.1-10"), or a
// whole chapter ("esth.2"). Book ids are those in data/seed/books.json.

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dirname, "..")
const versesPath = join(root, "data/vendor/theographic/verses.json")
if (!existsSync(versesPath)) {
  console.error("verses.json is missing: run `npm run vendor:fetch` first.")
  process.exit(1)
}
const books = JSON.parse(readFileSync(join(root, "data/seed/books.json"), "utf8")) as { id: string; osis: string }[]
const idOf = new Map(books.map((b) => [b.osis, b.id]))
const text = new Map<string, string>()
for (const r of JSON.parse(readFileSync(versesPath, "utf8")) as { fields: { osisRef: string; verseText: string } }[]) {
  const [osis, c, v] = r.fields.osisRef.split(".")
  text.set(`${idOf.get(osis)}.${c}.${v}`, r.fields.verseText)
}

for (const arg of process.argv.slice(2)) {
  const m = /^([1-3]?[a-z]+)\.(\d+)(?:\.(\d+)(?:-(\d+))?)?$/.exec(arg)
  if (!m) {
    console.log(`? ${arg}: expected book.chapter[.verse[-verse]]`)
    continue
  }
  const [, book, chapter, from, to] = m
  const first = from ? Number(from) : 1
  const last = to ? Number(to) : from ? Number(from) : 200
  let found = false
  for (let v = first; v <= last; v++) {
    const key = `${book}.${chapter}.${v}`
    if (!text.has(key)) {
      if (!from) break
      continue
    }
    console.log(`${key} ${text.get(key)}`)
    found = true
  }
  if (!found) console.log(`? ${arg}: no such verse`)
}
