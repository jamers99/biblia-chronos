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
        [key("partner-of:abraham>sarah")]: { note: "No verse says they married.", kind: "unsupported" },
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
  assert.deepEqual(tally([...evs.values()]), { facts: 5, matched: 1, ai: 3, editor: 2, unchecked: 2 })

  // What the "how we know" popover says, layer by layer
  const short = (ref: string) => ref.toUpperCase()
  assert.deepEqual(explain(parent, short), {
    state: "verse",
    refs: ["gen.25.19"],
    label: "GEN.25.19",
    note: undefined,
    reviewNote: undefined,
    match: "The verse calls one the other's son or daughter",
    ai: "Agreed (haiku, Nov 2026)",
    editor: "Batch spot-checked by ed (10%), Nov 2026",
  })
  const date = explain(evs.get("date:e")!, short)
  assert.equal(date.label, "a reading")
  assert.equal(date.note, "A reading: seventh year")
  assert.equal(date.match, undefined)
  assert.equal(date.editor, "Read by ed, Nov 2026")
  const partners = explain(evs.get("partner-of:abraham>sarah")!, short)
  assert.deepEqual([partners.label, partners.note, partners.ai], ["no verse found", "No verse says they married.", "Flagged (haiku, Nov 2026)"])
})

test("an editor's verdict wins over the AI's, and stale verdicts are ignored", () => {
  const facts = enumerateFacts(data)
  const key = (id: string) => facts.find((f) => f.id === id)!.key
  const batch = {
    passage: "gen",
    ai: { model: "haiku", on: "2026-11-10" },
    facts: {
      [key("parent-of:abraham>isaac")]: { refs: ["gen.25.19"], note: "Abraham is the grandfather here.", kind: "wrong" as const },
      [key("partner-of:abraham>sarah")]: { note: "No verse says they married.", kind: "unsupported" as const },
      [key("date:e")]: { refs: ["esth.2.16"], note: "seventh year", kind: "reading" as const },
    },
  }
  const evs = collectEvidence(facts, undefined, [batch], {
    [key("parent-of:abraham>isaac")]: { verdict: "right", by: "ed", on: "2026-11-12", note: "Gen 25:19 says son." },
    [key("partner-of:abraham>sarah")]: { verdict: "wrong", by: "ed", on: "2026-11-12" },
    [key("date:e")]: { verdict: "unsure", by: "ed", on: "2026-11-12" },
    "note:k/e@000000": { verdict: "wrong", by: "ed", on: "2026-11-12" }, // stale: ignored
  })
  const short = (ref: string) => ref
  const parent = explain(evs.get("parent-of:abraham>isaac")!, short)
  assert.deepEqual([parent.state, parent.label, parent.refs], ["confirmed", "confirmed", []])
  assert.equal(parent.note, "The AI said: Abraham is the grandfather here.")
  assert.equal(parent.reviewNote, "ed: Gen 25:19 says son.")
  assert.equal(parent.editor, "Confirmed by ed, Nov 2026")
  const partners = explain(evs.get("partner-of:abraham>sarah")!, short)
  assert.deepEqual([partners.state, partners.label, partners.editor], ["wrong", "wrong", "Judged wrong by ed, Nov 2026"])
  const date = explain(evs.get("date:e")!, short)
  assert.deepEqual([date.state, date.editor], ["reading", "Not sure by ed, Nov 2026"])
  assert.equal(evs.get("note:k/e")!.review, undefined)
  assert.equal(tally([...evs.values()]).editor, 3)
})
