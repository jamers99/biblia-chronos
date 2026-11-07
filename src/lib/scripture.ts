// Turns per-verse scripture refs into readable citations. Theographic stores one
// ref per verse, so "Genesis 12:1–3; 13:5" arrives as four refs; we group them
// by book (in canonical order) and collapse consecutive verses into ranges.

import type { Book, ScriptureRef } from "./data/schema.ts"

// A run of consecutive verses in one chapter: "12:1–3" or just "5" after the first.
export type VerseRun = { chapter: number; start: number; end: number; label: string }
export type BookCitation = { book: Book; chapters: VerseRun[][]; text: string; count: number }

export function citeRefs(refs: ScriptureRef[], books: Book[]): BookCitation[] {
  const bookById = new Map(books.map((b) => [b.id, b]))
  return [...Map.groupBy(refs, (r) => r.book)]
    .filter(([id]) => bookById.has(id))
    .map(([id, rs]) => {
      const chapters = citeChapters(rs)
      return { book: bookById.get(id)!, chapters, text: joinChapters(chapters), count: rs.length }
    })
    .sort((a, b) => a.book.order - b.book.order)
}

// "12:1–3, 5; 13:2" — chapters separated by "; ", verse runs by ", ".
export const joinChapters = (chapters: VerseRun[][]) =>
  chapters.map((runs) => runs.map((r) => r.label).join(", ")).join("; ")

function citeChapters(refs: ScriptureRef[]): VerseRun[][] {
  const sorted = [...refs].sort((a, b) => a.chapter - b.chapter || a.verse - b.verse)
  const chapters: VerseRun[][] = []
  let chapter = -1
  let runs: VerseRun[] = []
  let start = 0
  let end = 0

  const closeRun = () => {
    const verses = start === end ? `${start}` : `${start}–${end}`
    runs.push({ chapter, start, end, label: runs.length ? verses : `${chapter}:${verses}` })
  }
  const closeChapter = () => {
    closeRun()
    chapters.push(runs)
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
  return chapters
}

// Where a passage opens to read. Bible.com (YouVersion) is ad-free and lets the
// reader switch translations; we start them in the ESV, which our quotes follow.
const BIBLE_COM_VERSION = { id: 59, code: "ESV" }

// Bible.com addresses books by USFM code, which differs from OSIS for these.
const USFM: Record<string, string> = {
  Exod: "EXO", Deut: "DEU", Josh: "JOS", Judg: "JDG", Ruth: "RUT", "1Sam": "1SA", "2Sam": "2SA",
  "1Kgs": "1KI", "2Kgs": "2KI", "1Chr": "1CH", "2Chr": "2CH", Esth: "EST", Ps: "PSA", Prov: "PRO",
  Eccl: "ECC", Song: "SNG", Ezek: "EZK", Joel: "JOL", Amos: "AMO", Obad: "OBA", Nah: "NAM",
  Zeph: "ZEP", Zech: "ZEC", Matt: "MAT", Mark: "MRK", Luke: "LUK", John: "JHN", Acts: "ACT",
  "1Cor": "1CO", "2Cor": "2CO", Phil: "PHP", "1Thess": "1TH", "2Thess": "2TH", "1Tim": "1TI",
  "2Tim": "2TI", Phlm: "PHM", Jas: "JAS", "1Pet": "1PE", "2Pet": "2PE", "1John": "1JN",
  "2John": "2JN", "3John": "3JN", Jude: "JUD",
}
export const usfm = (book: Book) => USFM[book.osis] ?? book.osis.slice(0, 3).toUpperCase()

export function passageUrl(book: Book, run: VerseRun) {
  const verses = run.start === run.end ? `${run.start}` : `${run.start}-${run.end}`
  const { id, code } = BIBLE_COM_VERSION
  return `https://www.bible.com/bible/${id}/${usfm(book)}.${run.chapter}.${verses}.${code}`
}

// One cited verse ("gen.25.19", as evidence cites them): a short label
// ("Gen 25:19", "1 Kgs 16:15"), a long one ("Genesis 25:19"), and a link to
// read it.
export function verse(key: string, books: Book[]) {
  const m = /^([1-3]?[a-z]+)\.(\d+)\.(\d+)$/.exec(key)
  const book = m && books.find((b) => b.id === m[1])
  if (!m || !book) return undefined
  const [chapter, v] = [Number(m[2]), Number(m[3])]
  const at = `${chapter}:${v}`
  return {
    short: `${book.osis.replace(/^(\d)/, "$1 ")} ${at}`,
    long: `${book.name} ${at}`,
    url: passageUrl(book, { chapter, start: v, end: v, label: at }),
  }
}
