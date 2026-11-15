// Puts the verdicts of a --flagged re-check (audit/batches/<name>.json, written
// by the reviewer from `npm run audit:batch -- <name> --flagged …`) back in the
// batch files the facts live in, so each fact still lives in one batch:
//
//   npm run audit:merge -- recheck-places
//
// A fact now agreed with moves to its home file's "agreed"; any other verdict
// replaces its old entry. Keys that aren't in any batch, or that the data has
// changed under since, are listed and left out. Run `npm run audit:format` after.

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { EvidenceBatch } from "../src/lib/data/schema.ts"
import { root } from "./data.ts"

const name = process.argv[2]
if (!name) {
  console.error("usage: npm run audit:merge -- <name>")
  process.exit(1)
}
const result = EvidenceBatch.parse(JSON.parse(readFileSync(join(root, `audit/batches/${name}.json`), "utf8")))
const dir = join(root, "data/evidence")
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "matches.json")
const batches = new Map(files.map((f) => [f, JSON.parse(readFileSync(join(dir, f), "utf8")) as EvidenceBatch]))
const home = (key: string) => [...batches].find(([, b]) => b.facts?.[key] || b.agreed?.includes(key))?.[0]

const changed = new Set<string>()
const skipped: string[] = []
const verdicts: [string, EvidenceBatch["facts"] extends Record<string, infer E> | undefined ? E | "agreed" : never][] = [
  ...(result.agreed ?? []).map((k) => [k, "agreed"] as [string, "agreed"]),
  ...Object.entries(result.facts ?? {}),
]
const tally: Record<string, number> = {}
for (const [key, verdict] of verdicts) {
  const file = home(key)
  if (!file) {
    skipped.push(key)
    continue
  }
  const b = batches.get(file)!
  delete b.facts?.[key]
  b.agreed = (b.agreed ?? []).filter((k) => k !== key)
  if (verdict === "agreed") b.agreed.push(key)
  else (b.facts ??= {})[key] = verdict
  if (!b.agreed.length) delete b.agreed
  changed.add(file)
  const kind = verdict === "agreed" ? "agreed" : (verdict.kind ?? "verse")
  tally[kind] = (tally[kind] ?? 0) + 1
}
for (const file of changed) writeFileSync(join(dir, file), JSON.stringify(batches.get(file)) + "\n")
console.log(`Merged ${verdicts.length - skipped.length} verdicts into ${changed.size} files:`, tally)
if (skipped.length) console.log(`Not in any batch (left out): ${skipped.join(", ")}`)
