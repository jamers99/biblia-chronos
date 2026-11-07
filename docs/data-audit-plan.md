# Data Audit Plan: checking the data against Scripture

**Goal:** every fact the site shows points to the verse that says it. It also
says plainly how that was checked: by a script, by an AI, or by a person. The
app must not add to or drop from what the data says.

**Principle: layered checks, each one transparent.** Each layer adds its own
mark to a fact and says why. A reader can see each one and decide what to
trust.

| Layer | What it means | Stored? |
|---|---|---|
| **Script** | A rule matched the fact to a verse. It says which rule, e.g. "Gen 21:3 names Abraham and Isaac with 'son'" | Yes, one generated file, rewritten by each import or by hand |
| **AI** | An AI model read the passage and agreed (or flagged it, with a note) | Yes, per passage |
| **Editor** | A person reviewed it | Yes, per passage |

To keep the data from turning into a sea of rows: the script layer is one
generated file, and a plain "agree" from a reviewer costs one id in a list.
Only facts that need explaining get a written entry.

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
    "participated-in:esther_1343>esther-becomes-queen",
    "participated-in:mordecai_2107>esther-becomes-queen"
  ],

  // Facts that need a word of explanation
  "facts": {
    "date:esther-becomes-queen": {
      "refs": ["esth.2.16"],
      "sources": ["xerxes-accession"],
      "note": "Tenth month, seventh year of Ahasuerus (Esth 2:16). 479 BC follows from Xerxes taking the throne in 486 BC."
    },
    "partner-of:ahasuerus_117>esther_1343": {
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

- **Bars that look like lifespans but aren't.** Only 31 of the 286 published
  people have a known birth and death. Everyone else's bar runs from their
  first dated event to their last (`personSpan`), which reads as a life.
  Ezra's bar stops at 445 BC, just as Nehemiah's starts, so it looks like
  one died and the other took over. In fact they worked together: Ezra is
  at the wall's dedication in Nehemiah 12:36. Fixes:
  - **Draw attested people differently.** Draw a dot for each dated event,
    joined by a thin line that fades out at both ends, with no solid bar.
    That reads as "seen at these times", with no start or end. Only a known
    lifetime gets the solid bar.
  - **Say it in words too.** The detail panel says "Mentioned 458–445 BC (2
    dated events) · lifespan unknown", not just "attested years".
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

- **`npm run audit:scan`**: the matching rules, plus number checks for dates
  (ages in Gen 5 and 11, reign lengths in Kings and Chronicles). It runs at
  the end of `import:theographic`, and by hand after editing overrides
  (adding the Esther events, say). It writes two files, both committed, so a
  re-scan shows up as a reviewable diff:
  - `data/evidence/script.json`, generated and never hand-edited. At the top
    are the date it ran and the Theographic commit it read. Below that, one
    short line per matched fact: the fact's id, the verse, and the rule that
    matched (`"parent-of:abraham_58>isaac_616": ["gen.21.3", "family"]`).
    That's roughly 300 KB for the whole dataset.
  - `audit/unmatched.md`, the facts it couldn't match, grouped by passage.
    This is the review queue for step 3.
- **The build only reads `script.json`.** The scan covers seed *and*
  overrides, and overrides change far more often than imports. Two checks
  keep the two in step without scanning on every build:
  - **Locally,** `check:data` (which needs no verse text) warns about
    facts the scan has never seen (an override added since the last scan)
    and about entries for facts that no longer exist.
  - **In CI,** a separate workflow, `.github/workflows/audit.yml`, runs
    only on pull requests that touch the data:
    - It triggers on changes to `data/seed/`, `data/overrides/`,
      `data/evidence/`, `data/sources.json`, the snapshot pin, or the audit
      scripts themselves. PRs that only change code skip it.
    - It fetches `verses.json` (cached by Theographic commit, so the 37 MB
      download is rare), runs the full scan, and fails if `script.json` or
      `audit/unmatched.md` would come out different from what's committed.
    - It never commits anything itself. The failure shows the diff and says
      to run `npm run audit:scan` and commit, so every change to the
      evidence goes through a person's PR.
    - It runs alongside the existing `ci.yml`, which stays as it is. If the
      audit is ever made a required check, give it a job that always
      runs and skips the work when no data changed. A required check from a
      workflow that never started stays "pending" and blocks the merge.

  Either way, the fix is the same: run the scan (a few seconds) and commit
  the result alongside the override change.
- **On record pages:** the "how we know" marker and the merged Sources section,
  showing script results with the scan date ("matched by script, Nov 2026").

### 3. AI and editor passes (one PR per passage)

Published and editorial records first, then the drafts, passage by passage:

1. **AI pass.** Haiku reads the passage text and every fact touching it,
   including the ones the script matched, so it double-checks those too. It
   either agrees, or writes a fact entry with a verse and a note. It can only
   cite verses in the text it was given. It also reports **what's missing**
   in the passage: an event with no record, or a person present at an event
   but not linked to it. Ezra at the dedication of the wall (Neh 12:27–43)
   is one: there is no such event yet. Adding these is what makes the
   "mentioned" spans honest. It also notes any lifetime facts the passage
   gives (an age at death, "in his old age"), but only what the text
   states, never a guessed lifespan.
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
