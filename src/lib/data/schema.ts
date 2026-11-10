// Canonical data schema for Biblia Chronos.
//
// This is the single source of truth for the shape of our data: the importer
// validates its output against these schemas before writing, and the rest of
// the app derives its TypeScript types from them via `z.infer`. See
// docs/data-pipeline-spec.md for the reasoning and the upstream mapping.

import { z } from "zod"

// --- Shared conventions -----------------------------------------------------

// Years are plain numbers in astronomical (ISO 8601) numbering, as upstream:
// 0 is 1 BC and -1573 is 1574 BC. We keep the upstream numbers as-is and only
// convert to BC/AD for display (src/lib/format.ts).
export const Year = z.number().int()

// A date is a range with provenance, not a single number — biblical chronology
// is contested and we want to present it fairly.
export const DateEstimate = z.object({
  earliest: Year.optional(),
  latest: Year.optional(),
  display: z.string().optional(), // "c. 1574 BC"
  chronology: z.string().optional(), // source key for the chronology used
  source: z.string().optional(), // overrides the record's source for this date
})

export const Coordinates = z.object({ lat: z.number(), lng: z.number() })

export const ScriptureRef = z.object({
  book: z.string(), // book id, e.g. "gen"
  chapter: z.number().int().positive(),
  verse: z.number().int().positive(),
  verseEnd: z.number().int().positive().optional(),
})

// --- Entities ---------------------------------------------------------------

export const Base = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["published", "draft"]).default("published"),
  source: z.string(),
  description: z.string().optional(),
  scriptureRefs: z.array(ScriptureRef).optional(),
})

export const Person = Base.extend({
  kind: z.literal("person"),
  displayTitle: z.string().optional(),
  isProperName: z.boolean().optional(),
  gender: z.enum(["male", "female", "unknown"]).optional(),
  birth: DateEstimate.optional(),
  death: DateEstimate.optional(),
})

export const Place = Base.extend({
  kind: z.literal("place"),
  coordinates: Coordinates.optional(),
  featureType: z.string().optional(), // "City", "Water", "Region"
  featureSubType: z.string().optional(), // "River"
  modernName: z.string().optional(),
  altNames: z.array(z.string()).optional(),
  date: DateEstimate.optional(), // when it existed, for kingdoms: Judah 974–587 BC
})

export const Event = Base.extend({
  kind: z.literal("event"),
  date: DateEstimate.optional(), // start..end (end derived from duration)
})

export const PeopleGroup = Base.extend({
  kind: z.literal("peopleGroup"),
})

// An era of the story (Patriarchs, Judges, …). Hand-authored, not imported:
// periods live in data/overrides/periods.json. `date` is the era's span, so
// both ends are required. Periods are sequential — the checker rejects overlaps.
// The rest is the era's chapter on the map: a short lede, its key places (most
// important first), optionally a journey through some of them (in order), and
// its key moments (event ids, in order) and people.
export const Period = Base.extend({
  kind: z.literal("period"),
  date: DateEstimate.required({ earliest: true, latest: true }),
  lede: z.string().optional(),
  places: z.array(z.string()).optional(),
  journey: z.object({ name: z.string(), places: z.array(z.string()).min(2) }).optional(),
  moments: z.array(z.string()).optional(),
  people: z.array(z.string()).optional(),
})

// A kingdom and its line of kings, for the timeline's kingdoms track.
// Hand-authored in data/overrides/kingdoms.json, on top of the imported
// "Reign of X" events: `event` is the kingdom's own span (e.g. "Southern
// Kingdom (Judah)"), and each reign names its event and the ruling house, so a
// change of dynasty is visible. Reigns are in order of succession.
export const Kingdom = z.object({
  id: z.string(),
  name: z.string(), // "Judah"
  region: z.string().optional(), // "South"
  source: z.string(),
  event: z.string(),
  place: z.string().optional(), // the place record for its land, linked both ways
  fate: z.string().optional(), // "Falls to Babylon"
  // `note` explains an unusual reign: a co-regency, a rival claimant.
  reigns: z.array(z.object({ event: z.string(), house: z.string(), note: z.string().optional() })).min(1),
})

export const Book = z.object({
  // reference table, not a Base entity
  id: z.string(), // osisName lowercased, e.g. "gen"
  name: z.string(), // "Genesis"
  shortName: z.string().optional(), // "Ge"
  osis: z.string(), // "Gen"
  order: z.number().int(), // bookOrder
  chapterCount: z.number().int(),
  testament: z.enum(["Old Testament", "New Testament"]),
  division: z.string().optional(), // bookDiv, "Pentateuch"
})

export const Source = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string().optional(),
  url: z.string().url().optional(),
  license: z.string().optional(), // "CC-BY-SA-4.0"
  kind: z.enum(["dataset", "book", "dictionary", "scholar", "other"]).optional(),
  notes: z.string().optional(),
})

// --- Edges ------------------------------------------------------------------

export const EdgeType = z.enum([
  "parent-of", // parent -> child
  "sibling-of", // symmetric
  "half-sibling-of", // symmetric
  "partner-of", // symmetric
  "member-of", // person -> peopleGroup
  "participated-in", // person -> event
  "occurred-at", // event  -> place
  "died-at", // person -> place
  "visited", // person -> place
  "part-of", // place -> the place containing it (Hebron -> Judah)
  "near", // place -> the place it's near (Gethsemane -> Jerusalem)
  "alias-of", // place -> the same place under its main name (Antipatris -> Aphek)
])

export const Edge = z.object({
  from: z.string(),
  to: z.string(),
  type: EdgeType,
  source: z.string(),
})

// --- Evidence ---------------------------------------------------------------

// One AI/editor review batch, data/evidence/<batch>.json (see
// docs/data-audit-plan.md). Facts are keyed `id@hash` (src/lib/evidence.ts);
// verses are cited as "gen.25.19".
const VerseKey = z.string().regex(/^[1-3]?[a-z]+\.\d+\.\d+$/, 'a verse like "gen.25.19"')
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const EvidenceBatch = z
  .object({
    passage: z.string(), // what the batch covers, e.g. "esth.1-10"
    ai: z.object({ model: z.string(), on: Day }).strict().optional(),
    // The editor reads every written entry, and samples `agreed` at `sampled`.
    // `read` narrows a partial review to the keys actually read.
    editor: z
      .object({ by: z.string(), on: Day, sampled: z.number().min(0).max(1).optional(), read: z.array(z.string()).optional() })
      .strict()
      .optional(),
    agreed: z.array(z.string()).optional(), // the AI agrees with the text match's verse
    facts: z
      .record(
        z
          .object({
            refs: z.array(VerseKey).optional(),
            sources: z.array(z.string()).optional(), // keys into sources.json, for what's outside Scripture
            note: z.string().optional(),
            // default "verse"; "unsupported": no verse found for it, though the record keeps it
            kind: z.enum(["verse", "reading", "wrong", "unsupported"]).optional(),
            // For "wrong" and "unsupported": how much it matters to a reader
            // if the data is left as it is (docs/audit-review-prompt.md).
            severity: z.enum(["high", "medium", "low"]).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()

// An editor's verdict on one fact, data/reviews.json (see data/evidence/README.md),
// keyed `id@hash` like the batches. Written by `npm run review:apply` from a
// review submitted on GitHub; whoever submitted it is `by`.
export const Review = z
  .object({
    verdict: z.enum(["right", "wrong", "unsure"]), // is the fact as the data has it right?
    by: z.string(), // GitHub login
    on: Day,
    issue: z.number().int().positive().optional(), // the GitHub issue it came from
    note: z.string().max(300).optional(),
  })
  .strict()
export const Reviews = z.record(Review)

// --- Derived TypeScript types ----------------------------------------------

export type Year = z.infer<typeof Year>
export type DateEstimate = z.infer<typeof DateEstimate>
export type Coordinates = z.infer<typeof Coordinates>
export type ScriptureRef = z.infer<typeof ScriptureRef>
export type Base = z.infer<typeof Base>
export type Person = z.infer<typeof Person>
export type Place = z.infer<typeof Place>
export type Event = z.infer<typeof Event>
export type PeopleGroup = z.infer<typeof PeopleGroup>
export type Period = z.infer<typeof Period>
export type Kingdom = z.infer<typeof Kingdom>
export type Book = z.infer<typeof Book>
export type Source = z.infer<typeof Source>
export type EdgeType = z.infer<typeof EdgeType>
export type Edge = z.infer<typeof Edge>
export type EvidenceBatch = z.infer<typeof EvidenceBatch>
export type Review = z.infer<typeof Review>
export type Reviews = z.infer<typeof Reviews>
