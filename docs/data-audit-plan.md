# Data Audit Plan: checking the data against Scripture

**Goal:** every fact the site shows points to the verse that says it, or is
clearly marked as unchecked or as an interpretation. The app also must not
add to or drop from what the data says.

**Principle: compute the evidence, store only the exceptions.** A script finds
the verse behind most facts. Anyone can re-run it, and anyone can check its
answer by reading the verse, so its results aren't stored. People only look
at what the script can't match, and only those decisions go into a file.
AI helps with that review but never counts as the check.

---

## What we're checking

- **The text:** the KJV in Theographic's `verses.json` (fetched by
  `npm run vendor:fetch`). Readers still get the ESV through the existing
  bible.com links. Names stay as they are.
- **The facts that matter:** relationships (parents, spouses, tribes), who
  took part in an event and where it happened, places that are part of or
  the same as another, and the editorial layers (`periods.json`,
  `kingdoms.json`).
- **Not verified one by one:**
  - **Siblings.** 2,557 of the 2,574 sibling edges follow from a shared
    recorded parent, so they're checked when the parents are. The 17 that
    don't get a look.
  - **"In Scripture" lists.** They're Theographic's index of where a name
    comes up, including verses that only say "he" or "the king", and are
    labeled that way. They aren't claims.
  - **Easton's descriptions.** They're labeled as an 1897 dictionary, not
    checked.
  - **Coordinates.** Labeled with their source.
- **Dates.** No BC/AD year is in the Bible. For now each date is labeled
  "one reconstructed chronology", and the script checks the biblical numbers
  under it where it can (ages in Gen 5 and 11, reign lengths in Kings and
  Chronicles). Scholarly alternatives come later, as their own project.

A first probe shows how far a simple script gets. It looked for one verse
naming both people with a family word ("son", "begat", "wife"…). That
matched **1,372 of 1,785 parent links** and **65 of 104 marriages** before
any tuning.

---

## Steps

### 1. Code audit (one PR)

Go through the import and the app code for each place that adds, infers,
or drops a fact, then fix or label each one. Already spotted:

- **Made-up lifespans.** People with no dates get a timeline bar built from
  their events (`personSpan`). It should look clearly different from a
  known lifespan.
- **Co-regencies.** The kings track infers them from overlapping dates, but
  they're a scholarly reconstruction. Label them.
- **Unreferenced editorial prose.** Era and kingdom text (ledes, notes) has
  no verse references. Add them.
- **Easton's isn't credited.** The page credits Theographic for the
  descriptions.
- **Truncated summaries.** The first-sentence cut (`summarize`) can drop a
  "probably".
- **Edges the importer drops.** Review its list.
- **No way to delete a wrong seed edge.** Overrides can't do it. Add a small
  tombstone.

### 2. Evidence script and display (one PR)

- **`npm run audit:scan`.** For each fact it finds a verse that supports it,
  and for dates it compares the numbers in the data against the numbers the
  text gives. It writes `audit/unmatched.md`, the list of facts it couldn't
  match, grouped by passage.
- **On record pages**, each fact shows its verse ("Father: Abraham ·
  Gen 21:3", linked to bible.com) or an *unchecked* marker. The "draft" badge
  becomes a count ("12 of 14 facts checked").

### 3. Review what's left (one PR per batch)

Go through `unmatched.md` passage by passage, published records first, then
drafts. For each batch:

1. **Haiku drafts a suggestion for each fact:** a verse, or "wrong", or
   "it's a reading", with a one-line reason. It's given the passage text and
   can only cite verses in it.
2. **You accept, change, or reject each suggestion in the PR.** Only what
   you accept goes in.
3. **Fixes go in `data/overrides/`.** Upstream errors are marked
   `"upstream": true`, so a one-line script can list them for you to send to
   Theographic if you want. We don't file anything.

Accepted decisions go in one file, `data/evidence.json`, one line per fact:

```jsonc
[
  { "fact": "parent-of:abraham_58>isaac_616", "refs": ["gen.25.19"] },
  { "fact": "identity:zechariah_2994@matt.23.35", "refs": ["2chr.24.20"], "kind": "reading",
    "note": "Matthew calls him son of Barachias; most read this as Jehoiada's son." },
  { "fact": "member-of:korah_1>levites", "kind": "wrong", "note": "Fixed in overrides/edges.json." }
]
```

- **Kinds:**
  - **Verse** (the default) means the text says it.
  - **Reading** means it's an interpretation, explained in the note.
  - **Wrong** means it's fixed in overrides.
- **No reviewer or date fields.** `git blame` and the PR record who accepted
  it and when.
- **`check:data` warns** when an entry points at a fact that no longer
  exists, so the file can't silently go stale.

On the site, then, a fact is in one of three states:

- **A verse:** the script found it, or you accepted one.
- **A reading,** with a note.
- **Unchecked.**

Nothing is shown as checked on an AI's word alone.

---

## Size

The scan does the bulk. What's left for review is the unmatched list:
probably a few hundred relationships, plus tribe and event links, which need
their own matching rules before we'll know. Each batch is one passage, so
one sitting. The first scan report will give real numbers to plan from.
