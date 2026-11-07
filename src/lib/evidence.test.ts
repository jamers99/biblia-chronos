import { test } from "node:test"
import assert from "node:assert/strict"
import { collectEvidence, edgeFactId, enumerateFacts, factStatus, hash, tally } from "./evidence.ts"
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
  assert.equal(edgeFactId(edge("partner-of", "sarah", "abraham")), "partner-of:abraham>sarah")
})

test("a fact's hash follows the data it shows", () => {
  const before = enumerateFacts(data).find((f) => f.id === "date:e")!.key
  const after = enumerateFacts({ ...data, events: [{ ...ev, date: { earliest: -477, latest: -477 } }] }).find((f) => f.id === "date:e")!.key
  assert.notEqual(before, after)
  assert.equal(hash("x").length, 6)
})

test("collectEvidence layers the script, the AI, and the editor, and ignores stale keys", () => {
  const facts = enumerateFacts(data)
  const key = (id: string) => facts.find((f) => f.id === id)!.key
  const evs = collectEvidence(facts, { theographic: "c", facts: { [key("parent-of:abraham>isaac")]: ["gen.25.19", "possessive"] } }, [
    [
      "batch",
      {
        passage: "gen",
        ai: { model: "haiku", on: "2026-11-10" },
        editor: { by: "ed", on: "2026-11-12", sampled: 0.1 },
        agreed: [key("parent-of:abraham>isaac")],
        facts: {
          [key("date:e")]: { refs: ["esth.2.16"], note: "seventh year" },
          "note:k/e@000000": { refs: ["gen.1.1"] }, // stale: ignored
        },
      },
    ],
  ])
  const parent = evs.get("parent-of:abraham>isaac")!
  assert.deepEqual(parent.script, { ref: "gen.25.19", rule: "possessive" })
  assert.equal(parent.ai?.agreed, true)
  assert.equal(parent.editor?.read, false) // agreed facts are only sampled
  assert.equal(evs.get("date:e")!.editor?.read, true) // written entries are read
  assert.equal(evs.get("note:k/e")!.entry, undefined)
  assert.deepEqual(factStatus(parent), { state: "verse", refs: ["gen.25.19"] })
  assert.deepEqual(factStatus(evs.get("note:k/e")), { state: "unchecked", refs: [] })
  assert.deepEqual(tally([...evs.values()]), { facts: 5, script: 1, ai: 2, editor: 1, unchecked: 3 })
})
