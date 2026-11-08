import { test } from "node:test"
import assert from "node:assert/strict"
import { linkCitations } from "./citations.ts"
import { readFileSync } from "node:fs"
import type { Book } from "./data/schema.ts"

const books: Book[] = JSON.parse(readFileSync(new URL("../../data/seed/books.json", import.meta.url), "utf8"))

const links = (...paragraphs: string[]) =>
  linkCitations(paragraphs, books).map((p) => p.filter((s) => s.url).map((s) => [s.text, s.url!.replace("https://www.bible.com/bible/59/", "")]))

test("links Easton's abbreviated citations, and verses that follow them", () => {
  assert.deepEqual(links("sent by God (Ex. 4:14, 27-30) to meet"), [[
    ["Ex. 4:14", "EXO.4.14.ESV"],
    ["27-30", "EXO.4.27-30.ESV"],
  ]])
})

test("carries the book forward to bare citations, across paragraphs", () => {
  assert.deepEqual(links("(Ex. 6:20). Born (2:1, 4; 7:7).", "married (6:23; 1 Chr. 2:10), then (17:8-13)"), [
    [["Ex. 6:20", "EXO.6.20.ESV"], ["2:1", "EXO.2.1.ESV"], ["4", "EXO.2.4.ESV"], ["7:7", "EXO.7.7.ESV"]],
    [["6:23", "EXO.6.23.ESV"], ["1 Chr. 2:10", "1CH.2.10.ESV"], ["17:8-13", "1CH.17.8-13.ESV"]],
  ])
})

test("links a chapter named without verses", () => {
  assert.deepEqual(links("implied, however, in Gen. 12. While"), [[["Gen. 12", "GEN.12.ESV"]]])
})

test("keeps the text intact and leaves dates, names, and unknown books alone", () => {
  const text = "In B.C. 459 Hezekiah 2 went (ver. 3); see Ant. 1:2 and (Rev. 99:1)."
  const [segments] = linkCitations([text], books)
  assert.equal(segments.map((s) => s.text).join(""), text)
  assert.deepEqual(segments.filter((s) => s.url), [])
})

test("doesn't take the number of the next book as a verse", () => {
  assert.deepEqual(links("(2 Sam. 5:4, 1 Kings 2:11)"), [[
    ["2 Sam. 5:4", "2SA.5.4.ESV"],
    ["1 Kings 2:11", "1KI.2.11.ESV"],
  ]])
})

test("finds citations after a capitalized word, and books named in the prose", () => {
  assert.deepEqual(links("In 1 Sam. 9:1 he is. Comp. 13:8. By Jeremiah (20:2). Acts 15:2: “x”"), [[
    ["1 Sam. 9:1", "1SA.9.1.ESV"],
    ["13:8", "1SA.13.8.ESV"],
    ["20:2", "JER.20.2.ESV"],
    ["Acts 15:2", "ACT.15.2.ESV"],
  ]])
})
