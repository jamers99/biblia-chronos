// Applies a review-mode submission (a GitHub issue's body) to data/reviews.json.
// Deterministic: the same body and data always give the same file. Used by the
// review-apply workflow, and by hand or by an agent:
//
//   npm run review:apply -- --by <github-login> --on 2026-11-12 --issue 42 --body-file body.md
//   npm run review:apply -- --by <github-login> --on 2026-11-12 < body.md
//
// Each verdict must name a fact as the data has it now (its id@hash). A
// verdict on a fact whose data has changed since, or that's gone, is skipped
// and listed, so nobody's verdict lands on data they didn't see. A later
// verdict on a fact replaces an earlier one. Prints a Markdown summary (the
// workflow uses it as the pull request's body); exits 1 if nothing applied.

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { Reviews, type Review } from "../src/lib/data/schema.ts"
import { enumerateFacts, factId } from "../src/lib/evidence.ts"
import { parseSubmission } from "../src/lib/review.ts"
import { loadData, readJson, root } from "./data.ts"

const { values } = parseArgs({
  options: { by: { type: "string" }, on: { type: "string" }, issue: { type: "string" }, "body-file": { type: "string" } },
})
const fail = (msg: string): never => {
  console.error(msg)
  process.exit(1)
}
const by = values.by ?? fail("--by <github-login> is required")
if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(by)) fail(`--by "${by}" isn't a GitHub login`)
const on = values.on ?? new Date().toISOString().slice(0, 10)
if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) fail(`--on "${on}" isn't a date like 2026-11-12`)
const issue = values.issue === undefined ? undefined : Number(values.issue)
if (issue !== undefined && !(Number.isInteger(issue) && issue > 0)) fail(`--issue "${values.issue}" isn't an issue number`)
const body = values["body-file"] ? readFileSync(values["body-file"], "utf8") : readFileSync(0, "utf8")

const data = loadData()
const current = new Map(enumerateFacts(data).map((f) => [f.id, f.key]))
const reviews = Reviews.parse(readJson("data/reviews.json"))

const { reviews: submitted, errors } = parseSubmission(body)
const applied: string[] = []
const skipped: string[] = []
for (const { key, verdict, note } of submitted) {
  const now = current.get(factId(key))
  if (now !== key) {
    skipped.push(`\`${key}\`: ${now ? `the data changed since (now \`${now}\`)` : "no such fact"}`)
    continue
  }
  // One verdict per fact: an earlier one on an older hash of it goes too.
  for (const old of Object.keys(reviews)) if (factId(old) === factId(key)) delete reviews[old]
  const review: Review = { verdict, by, on, ...(issue ? { issue } : {}), ...(note ? { note } : {}) }
  reviews[key] = review
  applied.push(`${verdict} \`${key}\`${note ? `: ${note}` : ""}`)
}

// One verdict per line, so the file's diff stays short.
if (applied.length) {
  const lines = Object.keys(reviews).sort().map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(reviews[k])}`)
  writeFileSync(join(root, "data", "reviews.json"), `{\n${lines.join(",\n")}\n}\n`)
}

const list = (items: string[]) => items.map((s) => `- ${s}`)
console.log(
  [
    `Verdicts by @${by}${issue ? ` from #${issue}` : ""}: ${applied.length} applied, ${skipped.length} skipped, ${errors.length} unreadable.`,
    ...(applied.length ? ["", "**Applied**", ...list(applied)] : []),
    ...(skipped.length ? ["", "**Skipped** (not a fact as the data has it now: review these again)", ...list(skipped)] : []),
    ...(errors.length ? ["", "**Unreadable lines**", ...list(errors)] : []),
    ...(applied.some((s) => s.startsWith("wrong"))
      ? ["", "Facts judged wrong still show until they're fixed in `data/overrides/`; `npm run check:data` lists them."]
      : []),
  ].join("\n"),
)
if (!applied.length) process.exit(1)
