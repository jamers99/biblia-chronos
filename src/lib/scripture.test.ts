import { test } from "node:test"
import assert from "node:assert/strict"
import { citeRefs } from "./scripture.ts"
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
