import { test } from "node:test"
import assert from "node:assert/strict"
import { DEFAULTS, facets, filterItems, fromQuery, groupItems, order, toQuery, type QueueItem } from "./review-filter.ts"

const it = (key: string, over: Partial<QueueItem>): QueueItem => ({
  key,
  status: "wrong",
  kind: "parent-of",
  claim: ["Hur is a parent of ", { text: "Salma", href: "/people/salma/" }],
  refs: [],
  subject: { id: "hur", name: "Hur" },
  ...over,
})
const items = [
  it("a@000001", { severity: "low", book: "acts", kind: "visited", subject: { id: "paul", name: "Paul" } }),
  it("b@000002", { severity: "high", book: "1chr" }),
  it("c@000003", { severity: "medium", book: "gen", status: "unsupported" }),
  it("d@000004", { status: "reading", kind: "date", book: "gen", note: "Year from Ussher" }),
]
const data = { kinds: [["parent-of", "Parents"], ["visited", "Places people went"], ["date", "Dates"]] as [string, string][], books: [["gen", "Genesis"], ["1chr", "1 Chronicles"], ["acts", "Acts"]] as [string, string][] }
const keys = (xs: QueueItem[]) => xs.map((x) => x.key)

test("filters combine, and the severity filter leaves out what has none", () => {
  assert.deepEqual(keys(filterItems(items, DEFAULTS)), ["a@000001", "b@000002"])
  const all = { ...DEFAULTS, status: ["wrong", "unsupported", "reading"] as const }
  assert.deepEqual(keys(filterItems(items, { ...all, status: [...all.status], severity: ["high", "medium"] })), ["b@000002", "c@000003"])
  assert.deepEqual(keys(filterItems(items, { ...all, status: [...all.status], book: "gen" })), ["c@000003", "d@000004"])
  assert.deepEqual(keys(filterItems(items, { ...all, status: [...all.status], q: "ussher" })), ["d@000004"])
  assert.deepEqual(keys(filterItems(items, { ...DEFAULTS, hide: true }, new Set(["a@000001"]))), ["b@000002"])
})

test("a facet's counts ignore its own filter, but not the others", () => {
  const f = facets(items, { ...DEFAULTS, book: "gen" })
  assert.equal(f.status.get("unsupported"), 1) // counted though the status filter is "wrong"
  assert.equal(f.status.get("wrong"), undefined) // no fact flagged wrong in Genesis
  assert.equal(f.book.get("acts"), 1)
})

test("groups sort most severe first, then by Bible book", () => {
  const all = filterItems([...items].sort(order(data)), { ...DEFAULTS, status: ["wrong", "unsupported", "reading"] })
  assert.deepEqual(groupItems(all, "severity", data).map((g) => g.title), ["High severity", "Medium severity", "Low severity", "Readings"])
  assert.deepEqual(groupItems(all, "book", data).map((g) => g.title), ["1 Chronicles", "Genesis", "Acts"]) // groups follow their most severe item
  assert.deepEqual(keys(groupItems(all, "none", data)[0].items), ["b@000002", "c@000003", "a@000001", "d@000004"])
  assert.deepEqual(groupItems(all, "subject", data).map((g) => [g.title, g.items.length]), [["Hur", 3], ["Paul", 1]])
})

test("filters survive the query string, and junk falls back to the defaults", () => {
  const f = { ...DEFAULTS, status: ["wrong", "reading"] as ("wrong" | "reading")[], severity: ["high" as const], book: "gen", q: "hur", group: "kind" as const, hide: true }
  assert.deepEqual(fromQuery(toQuery(f)), f)
  assert.equal(toQuery(DEFAULTS), "")
  assert.deepEqual(fromQuery("?status=bogus&group=nope&severity=high,x"), { ...DEFAULTS, status: [], severity: ["high"] })
})
