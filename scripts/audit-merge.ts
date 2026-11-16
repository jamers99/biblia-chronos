// Puts the verdicts of a --flagged or --disputed re-check (audit/batches/<name>.json,
// written by the reviewer from `npm run audit:batch -- <name> --flagged …`) back in
// the batch files the facts live in, so each fact still lives in one batch:
//
//   npm run audit:merge -- recheck-places
//
// A fact now agreed with moves to its home file's "agreed"; any other verdict
// replaces its old entry. Keys that aren't in any batch are listed and left
// out. Run `npm run audit:format` after.

import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { EvidenceBatch, type EvidenceEntry } from "../src/lib/data/schema.ts"
import { readBatches, readJson, root } from "./data.ts"

const name = process.argv[2]
if (!name) {
  console.error("usage: npm run audit:merge -- <name>")
  process.exit(1)
}
const result = EvidenceBatch.parse(readJson(`audit/batches/${name}.json`))
const batches = readBatches()
const home = new Map([...batches].flatMap(([file, b]) => [...(b.agreed ?? []), ...Object.keys(b.facts ?? {})].map((key) => [key, file])))

const verdicts: [string, EvidenceEntry | undefined][] = [
  ...(result.agreed ?? []).map((key): [string, undefined] => [key, undefined]), // agreed: no entry
  ...Object.entries(result.facts ?? {}),
]
const changed = new Set<string>()
const skipped: string[] = []
const tally: Record<string, number> = {}
for (const [key, entry] of verdicts) {
  const file = home.get(key)
  if (!file) {
    skipped.push(key)
    continue
  }
  const b = batches.get(file)!
  delete b.facts?.[key]
  const agreed = (b.agreed ?? []).filter((k) => k !== key)
  if (entry) (b.facts ??= {})[key] = entry
  else agreed.push(key)
  b.agreed = agreed.length ? agreed : undefined
  changed.add(file)
  const kind = entry ? (entry.kind ?? "verse") : "agreed"
  tally[kind] = (tally[kind] ?? 0) + 1
}
for (const file of changed) writeFileSync(join(root, "data/evidence", file), JSON.stringify(batches.get(file)) + "\n")
console.log(`Merged ${verdicts.length - skipped.length} verdicts into ${changed.size} files:`, tally)
if (skipped.length) console.log(`Not in any batch (left out): ${skipped.join(", ")}`)
