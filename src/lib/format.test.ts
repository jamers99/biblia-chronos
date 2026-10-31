import { test } from "node:test"
import assert from "node:assert/strict"
import { formatSpan, formatEstimate, summarize } from "./format.ts"

test("formatSpan reads naturally within and across eras", () => {
  assert.equal(formatSpan(-1996, -1706), "1996–1706 BC")
  assert.equal(formatSpan(30, 96), "AD 30–96")
  assert.equal(formatSpan(-4, 30), "4 BC – AD 30")
  assert.equal(formatSpan(-1490, -1490), "1490 BC")
})

test("formatEstimate prefers display, then the range, then a single year", () => {
  assert.equal(formatEstimate({ earliest: -1010, latest: -970, display: "c. 1010 BC" }), "c. 1010 BC")
  assert.equal(formatEstimate({ earliest: -1094, latest: -1054 }), "1094–1054 BC")
  assert.equal(formatEstimate({ latest: 30 }), "AD 30")
  assert.equal(formatEstimate(undefined), "—")
})

test("summarize keeps the first sentence and trims long ones at a word", () => {
  assert.equal(summarize("Beloved, the son of Jesse. He was a shepherd."), "Beloved, the son of Jesse.")
  assert.equal(summarize("a ".repeat(200), 20), "a a a a a a a a a a…")
  assert.equal(summarize(undefined), undefined)
  assert.equal(
    summarize("Father of a multitude, named (Gen. 11:27) before Nahor. He was born in Ur."),
    "Father of a multitude, named (Gen. 11:27) before Nahor.",
  )
})
