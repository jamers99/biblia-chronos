# Data Audit Plan: checking the data against Scripture

**Goal:** every fact the site shows points to the verse that says it. It also
says plainly how that was checked: by a script, by an AI, or by a person. The
app must not add to or drop from what the data says.

**Principle: layered checks, each one transparent.** Each layer adds its own
mark to a fact and says why. A reader can see each one and decide what to
trust.

| Layer | What it means | Stored? |
|---|---|---|
| **Script** | A rule matched the fact to a verse. It says which rule, e.g. "Gen 21:3 names Abraham and Isaac with 'son'" | No. It's recomputed every build, so it can't go stale |
| **AI** | An AI model read the passage and agreed (or flagged it, with a note) | Yes, per passage |
| **Editor** | A person reviewed it | Yes, per passage |

To keep the data from turning into a sea of rows: the script layer stores
nothing, and a plain "agree" from a reviewer costs one id in a list. Only
facts that need explaining get a written entry.

---

## What we're checking

- **The text:** the KJV in Theographic's `verses.json` (fetched by
  `npm run vendor:fetch`). Readers still get the ESV through the existing
  bible.com links. Names stay as they are.
- **The facts that matter:**
  - relationships: parents, spouses, tribes
  - events: who took part, where it happened
  - places: what each is part of or the same as
  - the editorial records (`periods.json`, `kingdoms.json`, and the events
    added in `overrides/events.json`)
- **Not verified one by one:**
  - **Siblings.** 2,557 of the 2,574 sibling links follow from a shared
    recorded parent, so checking the parent checks them. The other 17 get a
    look.
  - **"In Scripture" lists.** These are Theographic's index of where a name
    comes up, including verses that only say "he" or "the king". They're
    labeled as an index, not as claims.
  - **Easton's descriptions.** Labeled as a dictionary from 1897.
  - **Coordinates.** Labeled with their source.
- **Dates.** No BC/AD year is in the Bible, so a date has two parts:
  - **What the text gives.** Esther 2:16: "the tenth month … in the seventh
    year of his reign". The script checks this part.
  - **What it's anchored to.** For example, Xerxes coming to the throne in
    486 BC, from outside the Bible. The evidence names that source too.

  For now, every date is labeled as coming from one reconstructed
  chronology. Scholarly alternatives come later, as their own project.

A quick first test shows the script layer is worth having. It looked for
one verse naming both people with a family word ("son", "begat", "wife").
Even this crude version matched **1,372 of the 1,785 parent links** and **65
of the 104 marriages**.

---

## The evidence files

One file per passage reviewed, in `data/evidence/`. Each file records who
reviewed it and when, once at the top, not on every row:

```jsonc
// data/evidence/esther-2.json
{
  "passage": "esth.2",
  "ai":     { "model": "haiku", "on": "2026-11-10" },
  "editor": { "by": "jamers99", "on": "2026-11-12" },   // reviewed everything below

  // The AI agrees with the script's verse: just the id
  "agreed": [
    "participated-in:esther_1180>esther-becomes-queen",
    "participated-in:mordecai_2093>esther-becomes-queen"
  ],

  // Facts that need a word of explanation
  "facts": {
    "date:esther-becomes-queen": {
      "refs": ["esth.2.16"],
      "sources": ["xerxes-accession"],
      "note": "Tenth month, seventh year of Ahasuerus (Esth 2:16). 479 BC follows from Xerxes taking the throne in 486 BC."
    },
    "partner-of:ahasuerus_95>esther_1180": {
      "refs": ["esth.2.17"],
      "note": "The script missed it: the verse says he 'made her queen', not 'wife'."
    },
    "member-of:...": { "kind": "wrong", "note": "Fixed in overrides/edges.json." }
  }
}
```

- **A fact entry** has `refs` (verses), `sources` (keys into `sources.json`)
  for anything outside the Bible, and a short `note`. Its `kind` is one of:
  - *verse* (the default): the text says it.
  - *reading*: an interpretation, explained in the note.
  - *wrong*: an error, fixed in overrides.
- **`editor` covers the whole file.** If a review covers only part of it,
  list the fact ids it covers.
- **`check:data` warns** when an entry points at a fact that no longer
  exists, or when a fact changed after it was reviewed. That way the files
  can't silently go stale.
- **Size:** the whole dataset has perhaps 6–8 thousand checkable facts
  (excluding siblings and mentions). Most will be one id in an `agreed`
  list. That comes to a few hundred KB across a few dozen files.

---

## On the site: sources and evidence together

Each fact gets a small "how we know" marker that opens up into the full
story:

> **Father:** Abraham · [Gen 21:3](#) ✓✓✓
> - **Verse:** Gen 21:3 (opens on bible.com)
> - **Script:** the verse names Abraham and Isaac with "son"
> - **AI:** agreed (Haiku, Nov 2026)
> - **Editor:** reviewed (jamers99, Nov 2026)

A fact with no checks shows *unchecked*. A *reading* shows its note. Each
record's Sources section merges with this. It says where the data came from
(Theographic or the project's editors), the text it was checked against (the
KJV), and a tally: "14 facts: 12 matched by script, 14 checked by AI, 14
reviewed by an editor". The "draft" badge goes, and the tally replaces it.

---

## Steps

### 1. Code audit (one PR)

Go through the import and the app for each place that adds, infers, or
drops a fact, then fix or label it. Already spotted:

- **Made-up lifespans.** People with no dates get a timeline bar built from
  their events (`personSpan`). It should look different from a known
  lifespan.
- **Co-regencies.** The kings track infers them from overlapping dates.
  Label them as a reconstruction.
- **Editorial prose without verses.** Era and kingdom text (ledes, notes)
  needs verse references.
- **Easton's isn't credited.** The descriptions come from Easton's, but the
  page credits only Theographic.
- **Lost qualifiers.** The first-sentence summary (`summarize`) can cut off a
  "probably".
- **Dropped edges.** Review the list of edges the importer drops.
- **No way to delete a seed edge.** Overrides can't remove one yet, so add a
  small tombstone.

### 2. Script layer and display (one PR)

- `npm run audit:scan`: the matching rules, plus number checks for dates
  (ages in Gen 5 and 11, reign lengths in Kings and Chronicles). It writes
  `audit/unmatched.md`, the facts it couldn't match, grouped by passage.
- The "how we know" marker and the merged Sources section on record pages,
  showing script results right away.

### 3. AI and editor passes (one PR per passage)

Published and editorial records first, then the drafts, passage by passage:

1. **AI pass.** Haiku reads the passage text and every fact touching it,
   including the ones the script matched, so it double-checks those too. It
   either agrees, or writes a fact entry with a verse and a note. It can only
   cite verses in the text it was given.
2. **Editor pass.** You review the PR. Read every written entry and spot-check
   the `agreed` list. Merging it with `editor` set records the review. A PR
   can also merge with only the AI layer, so the site shows "checked by AI"
   until a person gets to it.
3. **Fixes.** Corrections go in `data/overrides/`. Upstream errors are
   marked `"upstream": true`, so a one-line script can list them if you want
   to send them to Theographic. We don't file anything.

---

## Size

The script does the bulk. The first scan report will give real numbers. Each
batch is one passage, so one AI run and one sitting to review.
