// Puts the verdicts of a --flagged or --disputed re-check (audit/batches/<name>.json,
// written by the reviewer from `npm run audit:batch -- <name> --flagged …`) back in
// the batch files the facts live in, so each fact still lives in one batch:
//
//   npm run audit:merge -- recheck-places
//
// A fact now agreed with moves to its home file's "agreed"; any other verdict
// replaces its old entry, matched by fact id, so a stale entry is replaced
// too. A verdict merged into a batch an editor signed off isn't marked read:
// the editor read the old one. Facts in no batch are listed and left out.
// Run `npm run audit:format` after.

import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { EvidenceBatch, type EvidenceEntry } from "../src/lib/data/schema.ts"
import { factId } from "../src/lib/evidence.ts"
import { readBatches, readJson, root } from "./data.ts"

const name = process.argv[2]
if (!name) {
  console.error("usage: npm run audit:merge -- <name>")
  process.exit(1)
}
const result = EvidenceBatch.parse(readJson(`audit/batches/${name}.json`))
const batches = readBatches()
// Each fact's batch, and its key there (perhaps on an older hash).
const home = new Map(
  [...batches].flatMap(([file, b]) => [...(b.agreed ?? []), ...Object.keys(b.facts ?? {})].map((key) => [factId(key), { file, key }])),
)

const verdicts: [string, EvidenceEntry | undefined][] = [
  ...(result.agreed ?? []).map((key): [string, undefined] => [key, undefined]), // agreed: no entry
  ...Object.entries(result.facts ?? {}),
]
const changed = new Set<string>()
const skipped: string[] = []
const tally: Record<string, number> = {}
for (const [key, entry] of verdicts) {
  const found = home.get(factId(key))
  if (!found) {
    skipped.push(key)
    continue
  }
  const { file, key: old } = found
  const b = batches.get(file)!
  // With no read list, an editor read every written entry (and sampled the
  // agreed ones): spell that out, less this fact.
  if (b.editor) b.editor.read = (b.editor.read ?? Object.keys(b.facts ?? {})).filter((k) => k !== old)
  delete b.facts?.[old]
  const agreed = (b.agreed ?? []).filter((k) => k !== old)
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
