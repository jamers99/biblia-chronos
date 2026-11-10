// The review queue (src/pages/review/): the facts that most need a person, in
// the order to look at them. Facts the AI flagged as wrong come first, then
// those it found no verse for, then its readings (interpretations the text
// doesn't state), each by kind of fact, so like is reviewed with like. A fact
// an editor has already given a verdict on (data/reviews.json) leaves the
// queue. Build time only.

import { allEvidence, books, kingdoms, periods, record } from "./load.ts"
import { explain, factId, type FactEvidence, type FactKind } from "../evidence.ts"
import { verse } from "../scripture.ts"
import { entityUrl } from "../url.ts"
import { formatEstimate, label } from "../format.ts"
import type { Person } from "./schema.ts"

export type Part = string | { text: string; href?: string }
export type QueueItem = {
  key: string
  kind: FactKind
  claim: Part[]
  note?: string
  refs: { long: string; url: string }[]
}

// Kinds of fact, in the order the queue lists them, with a heading each.
export const KINDS: [FactKind, string][] = [
  ["parent-of", "Parents"],
  ["partner-of", "Marriages"],
  ["member-of", "Tribes and groups"],
  ["participated-in", "People at events"],
  ["occurred-at", "Where events happened"],
  ["visited", "Places people went"],
  ["died-at", "Where people died"],
  ["part-of", "Places within places"],
  ["alias-of", "Other names for places"],
  ["near", "Places near each other"],
  ["date", "Dates"],
  ["birth", "Births"],
  ["death", "Deaths"],
  ["house", "Ruling houses"],
  ["note", "Notes on reigns"],
  ["lede", "Era summaries"],
]

function name(id: string): Part {
  const e = record(id)
  if (e) return { text: label(e), href: entityUrl(e) }
  return { text: periods.find((p) => p.id === id)?.name ?? kingdoms.find((k) => k.id === id)?.name ?? id }
}

// The fact as a sentence, with its records linked.
function claim(id: string, kind: FactKind): Part[] {
  const body = id.slice(id.indexOf(":") + 1)
  const [a, b] = body.split(">")
  const reign = () => {
    const [k, event] = body.split("/")
    const kingdom = kingdoms.find((x) => x.id === k)
    return { kingdom, reign: kingdom?.reigns.find((r) => r.event === event), event }
  }
  const dated = (rid: string) => record(rid) ?? periods.find((p) => p.id === rid)
  switch (kind) {
    case "parent-of": return [name(a), " is a parent of ", name(b)]
    case "partner-of": return [name(a), " and ", name(b), " were married"]
    case "member-of": return [name(a), " belongs to ", name(b)]
    case "participated-in": return [name(a), " took part in ", name(b)]
    case "occurred-at": return [name(a), " happened at ", name(b)]
    case "visited": return [name(a), " was at ", name(b)]
    case "died-at": return [name(a), " died at ", name(b)]
    case "part-of": return [name(a), " is within ", name(b)]
    case "alias-of": return [name(a), " is another name for ", name(b)]
    case "near": return [name(a), " is near ", name(b)]
    case "date": return [name(body), `: ${formatEstimate((dated(body) as { date?: Person["birth"] })?.date)}`]
    case "birth": return [name(body), ` was born ${formatEstimate((record(body) as Person)?.birth)}`]
    case "death": return [name(body), ` died ${formatEstimate((record(body) as Person)?.death)}`]
    case "house": { const r = reign(); return [name(r.event), ` belongs to the ${r.reign?.house ?? "?"} in ${r.kingdom?.name ?? "?"}`] }
    case "note": { const r = reign(); return [name(r.event), `: “${r.reign?.note ?? ""}”`] }
    case "lede": return [name(body), `: “${periods.find((p) => p.id === body)?.lede ?? ""}”`]
  }
}

const item = (ev: FactEvidence): QueueItem => {
  const id = factId(ev.key)
  const kind = id.slice(0, id.indexOf(":")) as FactKind
  const how = explain(ev, (r) => r)
  return {
    key: ev.key,
    kind,
    claim: claim(id, kind),
    note: ev.entry?.note,
    refs: how.refs.map((r) => verse(r, books)).filter((v) => v !== undefined),
  }
}

export type Queue = { slug: string; title: string; about: string; items: QueueItem[] }

let built: { queues: Queue[]; reviewed: number } | undefined
export function reviewQueues() {
  if (built) return built
  const evs = [...allEvidence().values()]
  const open = evs.filter((ev) => !ev.review)
  const state = (ev: FactEvidence) => (ev.entry?.kind ?? "verse")
  const order = new Map(KINDS.map(([k], i) => [k, i]))
  const sorted = (xs: FactEvidence[]) =>
    xs.map(item).sort((x, y) => order.get(x.kind)! - order.get(y.kind)! || (x.key < y.key ? -1 : 1))
  const readings = open.filter((ev) => state(ev) === "reading")
  built = {
    reviewed: evs.length - open.length,
    queues: [
      {
        slug: "flagged",
        title: "Flagged by the AI",
        about: "The AI read the passage and thinks the data is wrong. Its note says why.",
        items: sorted(open.filter((ev) => state(ev) === "wrong")),
      },
      {
        slug: "no-verse",
        title: "No verse found",
        about: "Two AI passes found no verse that says this. Is there one, or should it go?",
        items: sorted(open.filter((ev) => state(ev) === "unsupported")),
      },
      ...KINDS.map(([kind, title]) => ({
        slug: `readings-${kind}`,
        title: `Readings: ${title.toLowerCase()}`,
        about: "Probably right, but resting on something the text doesn't say outright. The AI's note says what.",
        items: sorted(readings.filter((ev) => factId(ev.key).startsWith(`${kind}:`))),
      })).filter((q) => q.items.length > 0),
    ],
  }
  return built
}
