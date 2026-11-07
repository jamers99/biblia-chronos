import { test } from "node:test"
import assert from "node:assert/strict"
import { citeRefs, passageUrl } from "./scripture.ts"
import type { Book } from "./data/schema.ts"

const book = (id: string, name: string, order: number): Book => ({
  id, name, osis: id, order, chapterCount: 50, testament: "Old Testament",
})
const books = [book("gen", "Genesis", 1), book("exod", "Exodus", 2)]
const ref = (b: string, chapter: number, verse: number) => ({ book: b, chapter, verse })

test("citeRefs groups by book in canonical order and collapses verse runs", () => {
  const refs = [ref("exod", 2, 1), ref("gen", 13, 2), ref("gen", 12, 3), ref("gen", 12, 1), ref("gen", 12, 2), ref("gen", 12, 5)]
  const cited = citeRefs(refs, books)
  assert.deepEqual(cited.map((c) => [c.book.name, c.text, c.count]), [
    ["Genesis", "12:1–3, 5; 13:2", 5],
    ["Exodus", "2:1", 1],
  ])
})

test("citeRefs honours verseEnd and ignores unknown books", () => {
  const cited = citeRefs([{ book: "gen", chapter: 1, verse: 1, verseEnd: 3 }, ref("gen", 1, 4), ref("zzz", 1, 1)], books)
  assert.deepEqual(cited.map((c) => c.text), ["1:1–4"])
})

test("citeRefs keeps each verse run, for linking", () => {
  const [gen] = citeRefs([ref("gen", 12, 1), ref("gen", 12, 2), ref("gen", 12, 5), ref("gen", 13, 2)], books)
  assert.deepEqual(gen.chapters.map((runs) => runs.map((r) => r.label)), [["12:1–2", "5"], ["13:2"]])
})

test("passageUrl opens the run on bible.com in the ESV, by USFM code", () => {
  const ps: Book = { id: "ps", name: "Psalms", osis: "Ps", order: 19, chapterCount: 150, testament: "Old Testament" }
  const [cited] = citeRefs([ref("ps", 23, 1), ref("ps", 23, 2), ref("ps", 23, 4)], [ps])
  assert.deepEqual(cited.chapters[0].map((r) => passageUrl(ps, r)), [
    "https://www.bible.com/bible/59/PSA.23.1-2.ESV",
    "https://www.bible.com/bible/59/PSA.23.4.ESV",
  ])
})

test("verse labels and links a single cited verse", async () => {
  const { verse } = await import("./scripture.ts")
  const kings = { id: "1kgs", name: "1 Kings", osis: "1Kgs", order: 11, chapterCount: 22, testament: "Old Testament" as const }
  assert.deepEqual(verse("1kgs.16.15", [kings]), {
    short: "1 Kgs 16:15",
    long: "1 Kings 16:15",
    url: "https://www.bible.com/bible/59/1KI.16.15.ESV",
  })
  assert.equal(verse("nope.1.1", [kings]), undefined)
})
