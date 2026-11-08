// Print KJV verses, for reviewing evidence.
//
//   npm run verse -- gen.25.19 2kgs.25.1-10 esth.2
//
// A key is book.chapter.verse ("gen.25.19"), a range ("2kgs.25.1-10"), or a
// whole chapter ("esth.2"). Book ids are those in data/seed/books.json.

import { loadData, loadVerses } from "./data.ts"

const { books } = loadData()
const text = loadVerses(books)
const bookIds = books.map((b) => b.id)

for (const arg of process.argv.slice(2)) {
  const m = /^([1-3]?[a-z]+)\.(\d+)(?:\.(\d+)(?:-(\d+))?)?$/.exec(arg)
  if (!m) {
    console.log(`? ${arg}: expected book.chapter[.verse[-verse]]`)
    continue
  }
  const [, book, chapter, from, to] = m
  if (!bookIds.includes(book)) {
    console.log(`? ${arg}: no book "${book}"; the book ids are ${bookIds.join(" ")}`)
    continue
  }
  const prefix = `${book}.${chapter}.`
  const inRange = (v: number) => !from || (v >= Number(from) && v <= Number(to ?? from))
  const found = [...text].filter(([key]) => key.startsWith(prefix) && inRange(Number(key.slice(prefix.length))))
  if (!found.length) console.log(`? ${arg}: no such verse`)
  for (const [key, verse] of found) console.log(`${key} ${verse}`)
}
