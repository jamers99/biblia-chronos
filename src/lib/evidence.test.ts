import { test } from "node:test"
import assert from "node:assert/strict"
import { collectEvidence, edgeFact, enumerateFacts, explain, factStatus, hash, tally } from "./evidence.ts"
import type { Edge, Event, Kingdom, Person } from "./data/schema.ts"

const person = (id: string): Person => ({ id, name: id, kind: "person", status: "published", source: "t" })
const edge = (type: Edge["type"], from: string, to: string): Edge => ({ type, from, to, source: "t" })
const ev: Event = { id: "e", name: "E", kind: "event", status: "published", source: "t", date: { earliest: -478, latest: -478 } }
const kingdom: Kingdom = { id: "k", name: "K", source: "t", event: "e", reigns: [{ event: "e", house: "House of K", note: "Rival" }] }

const data = {
  people: [person("abraham"), person("isaac"), person("sarah")],
  places: [],
  events: [ev],
  edges: [edge("parent-of", "abraham", "isaac"), edge("partner-of", "sarah", "abraham"), edge("sibling-of", "isaac", "x")],
  periods: [],
  kingdoms: [kingdom],
}

test("enumerateFacts gives stable ids, skips siblings, and sorts symmetric edges", () => {
  const ids = enumerateFacts(data).map((f) => f.id)
  assert.deepEqual(ids, ["date:e", "house:k/e", "note:k/e", "parent-of:abraham>isaac", "partner-of:abraham>sarah"])
  assert.equal(edgeFact("partner-of", "sarah", "abraham"), "partner-of:abraham>sarah")
})

test("a fact's hash follows the data it shows", () => {
  const before = enumerateFacts(data).find((f) => f.id === "date:e")!.key
  const after = enumerateFacts({ ...data, events: [{ ...ev, date: { earliest: -477, latest: -477 } }] }).find((f) => f.id === "date:e")!.key
  assert.notEqual(before, after)
  assert.equal(hash("x").length, 6)
})

test("collectEvidence layers the text match, the AI, and the editor, and ignores stale keys", () => {
  const facts = enumerateFacts(data)
  const key = (id: string) => facts.find((f) => f.id === id)!.key
  const evs = collectEvidence(facts, { theographic: "c", facts: { [key("parent-of:abraham>isaac")]: ["gen.25.19", "possessive"] } }, [
    {
      passage: "gen",
      ai: { model: "haiku", on: "2026-11-10" },
      editor: { by: "ed", on: "2026-11-12", sampled: 0.1 },
      agreed: [key("parent-of:abraham>isaac")],
      facts: {
        [key("date:e")]: { refs: ["esth.2.16"], note: "seventh year", kind: "reading" },
        "note:k/e@000000": { refs: ["gen.1.1"] }, // stale: ignored
      },
    },
  ])
  const parent = evs.get("parent-of:abraham>isaac")!
  assert.deepEqual(parent.match, { ref: "gen.25.19", rule: "possessive" })
  assert.equal(parent.ai?.agreed, true)
  assert.equal(parent.editor?.read, false) // agreed facts are only sampled
  assert.equal(evs.get("date:e")!.editor?.read, true) // written entries are read
  assert.equal(evs.get("note:k/e")!.entry, undefined)
  assert.deepEqual(factStatus(parent), { state: "verse", refs: ["gen.25.19"] })
  assert.deepEqual(factStatus(evs.get("note:k/e")), { state: "unchecked", refs: [] })
  assert.deepEqual(tally([...evs.values()]), { facts: 5, matched: 1, ai: 2, editor: 1, unchecked: 3 })

  // What the "how we know" popover says, layer by layer
  const short = (ref: string) => ref.toUpperCase()
  assert.deepEqual(explain(parent, short), {
    state: "verse",
    refs: ["gen.25.19"],
    label: "GEN.25.19",
    note: undefined,
    match: "The verse calls one the other's son or daughter",
    ai: "Agreed (haiku, Nov 2026)",
    editor: "Batch spot-checked by ed (10%), Nov 2026",
  })
  const date = explain(evs.get("date:e")!, short)
  assert.equal(date.label, "a reading")
  assert.equal(date.note, "A reading: seventh year")
  assert.equal(date.match, undefined)
  assert.equal(date.editor, "Read by ed, Nov 2026")
})
