// Rewrites the review batches in data/evidence/ one entry per line, so a
// batch reads as a list and its diff stays short. Content is unchanged.
//
//   npm run audit:format

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { root } from "./data.ts"

const dir = join(root, "data/evidence")
const str = JSON.stringify
const list = (items: string[], open: string, close: string) => `${open}\n${items.map((s) => `    ${s}`).join(",\n")}\n  ${close}`

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "matches.json")) {
  const path = join(dir, file)
  const before = readFileSync(path, "utf8")
  const { agreed, facts, ...head } = JSON.parse(before)
  const fields = [
    ...Object.entries(head).map(([k, v]) => `${str(k)}: ${str(v)}`),
    ...(agreed?.length ? [`"agreed": ${list(agreed.map(str), "[", "]")}`] : []),
    ...(facts && Object.keys(facts).length ? [`"facts": ${list(Object.entries(facts).map(([k, e]) => `${str(k)}: ${str(e)}`), "{", "}")}`] : []),
  ]
  const after = `{\n${fields.map((f) => `  ${f}`).join(",\n")}\n}\n`
  if (after !== before) writeFileSync(path, after)
}
