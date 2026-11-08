// Finds the scripture citations in Easton's prose and links each to read on
// Bible.com, as the rest of the site's verses are. Easton's cites in its own
// abbreviations ("Ex. 4:14, 27-30", "1 Chr. 2:10") and, once a book is named,
// leaves it off the citations that follow it: "(2:1, 4; 7:7)" two sentences
// after "Ex. 6:20" is still Exodus. So the book carries forward through the
// entry until another is named.

import type { Book } from "./data/schema.ts"
import { chapterUrl, passageUrl } from "./scripture.ts"

export type Segment = { text: string; url?: string }

// Easton's abbreviations, and spellings it slips into, beyond each book's own
// name and OSIS code (see bookIndex). Keys are lowercased, without the period.
const ALIASES: Record<string, string> = {
  ge: "gen", ex: "exod", exod: "exod", lev: "lev", num: "num", deut: "deut", josh: "josh",
  judg: "judg", judge: "judg", "1 sam": "1sam", "2 sam": "2sam", "1 kings": "1kgs", "2 kings": "2kgs",
  "2 king": "2kgs", "1 chr": "1chr", "2 chr": "2chr", esth: "esth", psalm: "ps", psalms: "ps", prov: "prov",
  eccl: "eccl", eccles: "eccl", cant: "song", isa: "isa", jer: "jer", lam: "lam", ezek: "ezek", exek: "ezek",
  dan: "dan", hos: "hos", obad: "obad", mic: "mic", nah: "nah", hab: "hab", zeph: "zeph", hag: "hag",
  zech: "zech", mal: "mal", mat: "matt", matt: "matt", rom: "rom", "1 cor": "1cor", "2 cor": "2cor",
  gal: "gal", eph: "eph", phil: "phil", col: "col", "1 thess": "1thess", "1 thes": "1thess",
  "2 thess": "2thess", "2 thes": "2thess", "1 tim": "1tim", "2 tim": "2tim", philem: "phlm",
  heb: "heb", "1 pet": "1pet", "2 pet": "2pet", rev: "rev",
}

const key = (s: string) => s.replace(/\.$/, "").replace(/\s+/g, " ").trim().toLowerCase()

function bookIndex(books: Book[]) {
  const byId = new Map(books.map((b) => [b.id, b]))
  const index = new Map<string, Book>()
  for (const b of books) {
    index.set(key(b.name), b)
    index.set(key(b.osis.replace(/^(\d)/, "$1 ")), b)
  }
  for (const [alias, id] of Object.entries(ALIASES)) {
    const b = byId.get(id)
    if (b) index.set(alias, b)
  }
  return index
}

// A book name ("1 Chr.", "Gen.", "John") then a chapter and maybe verses; or,
// with the book left off, a bare "7:7". A citation can't start mid-number or
// mid-word, so "B.C. 459" and "Hezekiah 2" don't count.
const RANGE = String.raw`(?:\s?[-–]\s?(\d+))?`
const CITE = new RegExp(
  String.raw`(?<![\w.:])(?:((?:[1-3] ?)?[A-Z][a-z]+)\.? (\d+)(?::(\d+)${RANGE})?|(\d+):(\d+)${RANGE})(?!\d|:\d)`,
  "g",
)
// More verses in the same chapter: the ", 4" and ", 27-30" in "7:1, 4, 27-30".
// Not the "1" of a following "1 Chr.", which starts a citation of its own.
const MORE = new RegExp(String.raw`,\s?(\d+)${RANGE}(?![\d:]|\s?[A-Z][a-z]*\.? \d)`, "y")

export function linkCitations(paragraphs: string[], books: Book[]): Segment[][] {
  const index = bookIndex(books)
  const byName = new Map(books.map((b) => [b.name, b]))
  let book: Book | undefined

  return paragraphs.map((text) => {
    const out: Segment[] = []
    let at = 0
    const emit = (from: number, to: number, url?: string) => {
      if (from > at) out.push({ text: text.slice(at, from) })
      out.push(url ? { text: text.slice(from, to), url } : { text: text.slice(from, to) })
      at = to
    }
    const inBook = (b: Book | undefined, chapter: number) => b && chapter >= 1 && chapter <= b.chapterCount
    const verses = (b: Book, chapter: number, start: number, end?: string) => {
      const last = end ? Math.max(start, Number(end)) : start
      return passageUrl(b, { chapter, start, end: last, label: "" })
    }

    CITE.lastIndex = 0
    for (let m = CITE.exec(text); m; m = CITE.exec(text)) {
      const [whole, name, ch, v, vEnd, bareCh, bareV, bareEnd] = m
      let chapter: number
      let url: string
      let verse: boolean
      if (name !== undefined) {
        const named = index.get(key(name))
        chapter = Number(ch)
        // Not a book after all ("In 1 Sam. 9:1"): look again just past it.
        if (!named || !inBook(named, chapter)) {
          CITE.lastIndex = m.index + 1
          continue
        }
        book = named
        verse = v !== undefined
        url = verse ? verses(book, chapter, Number(v), vEnd) : chapterUrl(book, chapter)
      } else {
        chapter = Number(bareCh)
        // "the prophet Jeremiah (32:12)": a book named in the prose just before.
        const before = /((?:[1-3] )?[A-Z][a-z]+) \($/.exec(text.slice(0, m.index))?.[1]
        const prose = before && byName.get(before)
        if (prose && inBook(prose, chapter)) book = prose
        if (!book || !inBook(book, chapter)) continue
        verse = true
        url = verses(book, chapter, Number(bareV), bareEnd)
      }
      emit(m.index, m.index + whole.length, url)

      // ", 4, 27-30": each further run of verses links on its own.
      if (!verse) continue
      MORE.lastIndex = at
      for (let more = MORE.exec(text); more; MORE.lastIndex = at, more = MORE.exec(text)) {
        const start = more.index + more[0].indexOf(more[1], 1)
        emit(start, more.index + more[0].length, verses(book, chapter, Number(more[1]), more[2]))
      }
      CITE.lastIndex = at
    }
    if (at < text.length) out.push({ text: text.slice(at) })
    return out
  })
}
