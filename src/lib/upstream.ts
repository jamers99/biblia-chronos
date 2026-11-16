// A fact an editor judged wrong goes back to Theographic, whose data it is
// (docs/data-audit-plan.md): a link to its "Data correction" issue form, with
// the record, the field, its current value, the correction and the verses
// filled in. Theographic fixes it in Airtable; the next import brings it here.
// Facts about our own records (editorial events, eras, the kings' houses)
// have nothing to report upstream, so they get no link.

import type { FactKind } from "./evidence.ts"

export const UPSTREAM = "https://github.com/robertrouse/theographic-bible-metadata"

type Rec = { id: string; name: string; source: string; kind: string; gender?: string }

export type UpstreamFact = {
  id: string // the fact id, "parent-of:hur_1505>caleb_838"
  kind: FactKind
  records: string[]
  value?: string // for a date, birth or death: the year the data gives
}

// Which of Theographic's tables and fields holds a fact, and the record it's on.
function where(f: UpstreamFact, rec: (id: string) => Rec | undefined) {
  const [a, b] = f.records.map(rec)
  const label = (r?: Rec) => (r ? (r.kind === "event" ? `"${r.name}"` : r.id) : "?")
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
    case "date": return { on: a, table: a?.kind === "place" ? "Places" : "Events", field: `${a?.kind === "place" ? "startYear" : "startDate"}: ${f.value}` }
    case "birth": return { on: a, table: "People", field: `birthYear: ${f.value}` }
    case "death": return { on: a, table: "People", field: `deathYear: ${f.value}` }
    default: return undefined // house, note, lede: ours
  }
}

export function upstreamReportUrl(
  f: UpstreamFact,
  rec: (id: string) => Rec | undefined,
  review: { note?: string; refs?: string[] },
  cite: (ref: string) => string, // "1chr.2.18" → "1 Chr 2:18"
): string | undefined {
  const w = where(f, rec)
  if (!w?.on || f.records.some((id) => rec(id)?.source !== "theographic")) return undefined
  const record = w.on.kind === "event" ? `"${w.on.name}"` : w.on.id
  const params = {
    template: "data-correction.yml",
    title: `[Data] ${w.on.name}: ${w.field}`,
    record,
    table: w.table,
    field: w.field,
    correction: review.note ?? "",
    source: [
      (review.refs ?? []).map(cite).join("; "),
      `Found in Biblia Chronos's audit of the data against the KJV (fact \`${f.id}\`).`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  }
  return `${UPSTREAM}/issues/new?${new URLSearchParams(params).toString().replace(/\+/g, "%20")}`
}
