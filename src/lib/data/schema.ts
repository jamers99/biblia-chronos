// Canonical data schema for Biblia Chronos.
//
// This is the single source of truth for the shape of our data: the importer
// validates its output against these schemas before writing, and the rest of
// the app derives its TypeScript types from them via `z.infer`. See
// docs/data-pipeline-spec.md for the reasoning and the upstream mapping.

import { z } from "zod"

// --- Shared conventions -----------------------------------------------------

// Years are plain numbers; negative means BCE, using the upstream convention
// as-is (e.g. -1574). We document this convention rather than reinterpreting it.
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
  lived: DateEstimate.optional(), // overall min/max span
})

export const Place = Base.extend({
  kind: z.literal("place"),
  coordinates: Coordinates.optional(),
  featureType: z.string().optional(), // "City", "Water", "Region"
  featureSubType: z.string().optional(), // "River"
  modernName: z.string().optional(),
  altNames: z.array(z.string()).optional(),
})

export const Event = Base.extend({
  kind: z.literal("event"),
  date: DateEstimate.optional(), // start..end (end derived from duration)
})

export const PeopleGroup = Base.extend({
  kind: z.literal("peopleGroup"),
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
])

export const Edge = z.object({
  from: z.string(),
  to: z.string(),
  type: EdgeType,
  source: z.string(),
})

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
export type Book = z.infer<typeof Book>
export type Source = z.infer<typeof Source>
export type EdgeType = z.infer<typeof EdgeType>
export type Edge = z.infer<typeof Edge>
