// Turns per-verse scripture refs into readable citations. Theographic stores one
// ref per verse, so "Genesis 12:1–3; 13:5" arrives as four refs; we group them
// by book (in canonical order) and collapse consecutive verses into ranges.

import type { Book, ScriptureRef } from "./data/schema.ts"

export type BookCitation = { book: Book; text: string; count: number }

export function citeRefs(refs: ScriptureRef[], books: Book[]): BookCitation[] {
  const bookById = new Map(books.map((b) => [b.id, b]))
  const byBook = new Map<string, ScriptureRef[]>()
  for (const r of refs) {
    if (!byBook.has(r.book)) byBook.set(r.book, [])
    byBook.get(r.book)!.push(r)
  }

  return [...byBook.entries()]
    .filter(([id]) => bookById.has(id))
    .map(([id, rs]) => ({ book: bookById.get(id)!, text: citeChapters(rs), count: rs.length }))
    .sort((a, b) => a.book.order - b.book.order)
}

// "12:1–3, 5; 13:2" — chapters separated by "; ", verse runs by ", ".
function citeChapters(refs: ScriptureRef[]): string {
  const sorted = [...refs].sort((a, b) => a.chapter - b.chapter || a.verse - b.verse)
  const chapters: string[] = []
  let chapter = -1
  let runs: string[] = []
  let start = 0
  let end = 0

  const closeRun = () => runs.push(start === end ? `${start}` : `${start}–${end}`)
  const closeChapter = () => {
    closeRun()
    chapters.push(`${chapter}:${runs.join(", ")}`)
  }

  for (const r of sorted) {
    const last = r.verseEnd ?? r.verse
    if (r.chapter !== chapter) {
      if (chapter !== -1) closeChapter()
      chapter = r.chapter
      runs = []
      ;[start, end] = [r.verse, last]
    } else if (r.verse <= end + 1) {
      end = Math.max(end, last)
    } else {
      closeRun()
      ;[start, end] = [r.verse, last]
    }
  }
  if (chapter !== -1) closeChapter()
  return chapters.join("; ")
}
