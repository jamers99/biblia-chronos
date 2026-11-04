import { test } from "node:test"
import assert from "node:assert/strict"
import { prepare, search, type SearchEntry } from "./search.ts"

const entry = (name: string, weight = 0, extra: Partial<SearchEntry> = {}): SearchEntry => ({
  id: name.toLowerCase().replace(/\W+/g, "-"),
  kind: "person",
  name,
  hint: "",
  weight,
  ...extra,
})
const names = (entries: SearchEntry[], q: string, keep?: (e: SearchEntry) => boolean) =>
  search(prepare(entries), q, 8, keep).map((e) => e.name)

test("whole names, then starts of names, then starts of words, then anywhere", () => {
  const index = [entry("Death of David", 50), entry("Davidic Covenant", 20), entry("David", 1), entry("Ben-hadad", 99)]
  assert.deepEqual(names(index, "david"), ["David", "Davidic Covenant", "Death of David"])
  assert.deepEqual(names(index, "had"), ["Ben-hadad"])
  assert.deepEqual(names(index, "avi"), ["Death of David", "Davidic Covenant", "David"])
})

test("within a tier, records Scripture says more about come first", () => {
  const index = [entry("Joseph (son of Jacob)", 300), entry("Joseph (husband of Mary)", 40), entry("Joshua", 200)]
  assert.deepEqual(names(index, "jos"), ["Joseph (son of Jacob)", "Joshua", "Joseph (husband of Mary)"])
})

test("other names match, a little below a record's own name", () => {
  const index = [entry("Zion", 10), entry("Jerusalem", 500, { kind: "place", also: ["Zion", "Salem"] })]
  assert.deepEqual(names(index, "zion"), ["Zion", "Jerusalem"])
  assert.deepEqual(names(index, "salem"), ["Jerusalem"])
})

test("case and accents don't matter; empty queries find nothing", () => {
  const index = [entry("Bethlehem")]
  assert.deepEqual(names(index, "  BETHLÉHEM "), ["Bethlehem"])
  assert.deepEqual(names(index, " "), [])
})

test("a filter drops records, e.g. drafts", () => {
  const index = [entry("Abel", 1, { draft: true }), entry("Abel-meholah")]
  assert.deepEqual(names(index, "abel", (e) => !e.draft), ["Abel-meholah"])
})
