// A fact an editor judged wrong goes back to Theographic, whose data it is
// (docs/data-audit-plan.md): a link to its "Data correction" issue form, with
// the record, the field, its current value, the correction and the verses
// filled in. Theographic fixes it in Airtable; the next import brings it here.
// Facts about our own records (editorial events, eras, the kings' houses)
// have nothing to report upstream, so they get no link.

import type { DateEstimate } from "./data/schema.ts"
import type { FactKind } from "./evidence.ts"
import { newIssue } from "./review.ts"

export const UPSTREAM = "https://github.com/robertrouse/theographic-bible-metadata"

// What a report needs of a record; the site's entities fit as they are.
type Rec = { id: string; name: string; source: string; kind: string; gender?: string; date?: DateEstimate; birth?: DateEstimate; death?: DateEstimate }
type Fact = { id: string; kind: FactKind; records: string[]; source?: string }
type Lookup = (id: string) => Rec | undefined

// Which of Theographic's tables and fields holds a fact, and the record it's on.
function where(f: Fact, rec: Lookup) {
  const [a, b] = f.records.map(rec)
  const label = (r?: Rec) => (r ? (r.kind === "event" ? `"${r.name}"` : r.id) : "?")
  const year = (d?: DateEstimate) => String(d?.earliest ?? "?")
  switch (f.kind) {
    case "parent-of": return { on: b, table: "People", field: `${a?.gender === "female" ? "mother" : "father"}: ${label(a)}` }
    case "partner-of": return { on: a, table: "People", field: `partners: ${label(b)}` }
    case "member-of": return { on: a, table: "People", field: `memberOf: ${b?.name ?? "?"}` }
    case "participated-in": return { on: b, table: "Events", field: `participants: ${label(a)}` }
    case "occurred-at": return { on: a, table: "Events", field: `locations: ${label(b)}` }
    case "visited": return { on: b, table: "Places", field: `hasBeenHere: ${label(a)}` }
    case "died-at": return { on: a, table: "People", field: `deathPlace: ${label(b)}` }
    case "part-of": return { on: a, table: "Places", field: `partOf: ${label(b)}` }
    case "alias-of": return { on: a, table: "Places", field: `canonicalPlace: ${label(b)}` }
    case "near": return { on: a, table: "Places", field: `near: ${label(b)}` }
    case "date": return a?.kind === "place" ? { on: a, table: "Places", field: `startYear: ${year(a.date)}` } : { on: a, table: "Events", field: `startDate: ${year(a?.date)}` }
    case "birth": return { on: a, table: "People", field: `birthYear: ${year(a?.birth)}` }
    case "death": return { on: a, table: "People", field: `deathYear: ${year(a?.death)}` }
    default: return undefined // house, note, lede: ours
  }
}

// Whether a fact is Theographic's to fix: a field of theirs, on their records,
// and for a link, a link of theirs (not one added in data/overrides/).
export const isUpstream = (f: Fact, rec: Lookup) =>
  where(f, rec)?.on !== undefined &&
  (f.source === undefined || f.source === "theographic") &&
  f.records.every((id) => rec(id)?.source === "theographic")

export function upstreamReportUrl(
  f: Fact,
  rec: Lookup,
  review: { note?: string; refs?: string[] },
  cite: (ref: string) => string, // "1chr.2.18" → "1 Chr 2:18"
): string | undefined {
  const w = where(f, rec)
  if (!w?.on || !isUpstream(f, rec)) return undefined
  const record = w.on.kind === "event" ? `"${w.on.name}"` : w.on.id
  const source = [(review.refs ?? []).map(cite).join("; "), `Found in Biblia Chronos's audit of the data against the KJV (fact \`${f.id}\`).`]
  return newIssue(
    {
      template: "data-correction.yml",
      title: `[Data] ${w.on.name}: ${w.field}`,
      record,
      table: w.table,
      field: w.field,
      correction: review.note ?? "",
      source: source.filter(Boolean).join("\n\n"),
    },
    UPSTREAM,
  )
}

// Where a reported fact's report is: the issue's URL, or for a ledger id
// ("DQ-0072") the ledger itself.
export const upstreamLink = (upstream: string) =>
  upstream.startsWith("http") ? { url: upstream, label: undefined } : { url: `${UPSTREAM}/blob/master/data-quality/issues.yaml`, label: upstream }
