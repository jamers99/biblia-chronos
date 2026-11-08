# Data Audit Plan: checking the data against Scripture

> **Status (Nov 2026):** steps 1 and 2 are built. The text match supports
> 3,455 of the 5,950 facts. Step 3's AI pass is done, and every fact has an AI
> verdict: 233 are flagged wrong, 2,181 are readings, and 111 are marked "no
> verse found". None has had an editor's review yet; see "The first full pass"
> below for what to look at first.

**Goal:** every fact the site shows points to the verse that supports it,
and says plainly how that was checked: by an automatic text match, by an AI, or by a
person. The app must not add to or drop from what the data says.

**Principle: layered checks, each one transparent.** Each layer adds its own
mark to a fact, says why, and is shown distinctly. A reader can see each one
and decide what to trust.

| Layer | What it shows | Stored |
|---|---|---|
| **Text match** | The text supports the fact: a verse states the relationship in a recognised pattern, e.g. Gen 25:19, "Isaac, Abraham's son" | One generated file |
| **AI** | Haiku read the passage and agreed, or flagged it with a note | Per batch |
| **Editor** | A person read it | Per batch |

To keep this from turning into a sea of rows: the text match is one
generated file, an AI "agree" is one line in a list, and only facts that
need explaining get a written entry.

**What the text match doesn't check: identity.** It can show that *a*
Zechariah is called the son of *a* Jehoiada in some verse. It can't show
that the verse is about *this* Zechariah. 459 names are shared by more than
one person, and 1,361 of the 1,785 parent links involve one of those names.
For facts about those people, deciding which person is meant is left to the
AI and editor layers, and the site says so.

---

## What we're checking

- **The text:** the KJV in Theographic's `verses.json` (fetched by
  `npm run vendor:fetch`). Readers still get the ESV through the existing
  bible.com links. Display names stay as they are. Matching uses each
  record's KJV name and its upstream `alsoCalled` names (Joshua is "Jeshua"
  in Ezra 3:2), not the display name.
- **Text, not tags.** People's verse lists are Theographic's own tags. Using
  them to choose which verses to search would let Theographic vouch for
  itself, so the scan searches the text of every verse, not just the tagged
  ones.
- **The facts:** see the table under "Fact ids" below. That table is the
  whole list.
- **Not verified one by one:**
  - **"In Scripture" lists.** These are Theographic's index of where a name
    comes up, including verses that only say "he" or "the king". They're
    labeled as an index, not as claims.
  - **Easton's descriptions.** Labeled as a dictionary from 1897.
  - **Coordinates.** Labeled with their source.
- **Siblings are worked out, not checked.** Two people sharing one verified
  parent are shown as siblings. They're shown as full siblings only when
  both parents are verified. Today, 2,074 of the 2,330 "full sibling" links
  have only one recorded parent in common, which shows they're siblings but
  not whether they're full or half.
- **Dates have two parts:**
  - **What the text gives:** Esther 2:16 says "the tenth month … in the
    seventh year of his reign". The text match checks this part.
  - **What it's anchored to:** Xerxes coming to the throne in 486 BC, which
    comes from outside the Bible and is cited from `sources.json`.

  For now, every date is labeled as coming from one reconstructed
  chronology. Scholarly alternatives come later, as their own project.

### Fact ids

Each checkable fact has an id and a short **hash** of the data it asserts. A
review is tied to `id@hash`. If the data changes (a date edited in an
override, a re-import), the hash changes, the old review no longer applies,
and `check:data` reports it. This works locally and needs no verse text.

| Fact | Id | Hash covers |
|---|---|---|
| parent | `parent-of:abraham_58>isaac_616` | the edge |
| spouse | `partner-of:a>b` (ids sorted) | the edge |
| tribe or group | `member-of:person>group` | the edge |
| took part in an event | `participated-in:person>event` | the edge |
| event location | `occurred-at:event>place` | the edge |
| visited, died at | `visited:person>place`, `died-at:person>place` | the edge |
| place within, alias, near | `part-of:a>b`, `alias-of:a>b`, `near:a>b` | the edge |
| a date | `date:record` | `earliest`, `latest`, `display` |
| birth or death | `birth:person`, `death:person` | the date |
| editorial note | `note:kingdom/reign` (e.g. `note:kingdom-of-israel/reign-of-zimri`) | the text |
| period summary | `lede:period` | the text |

Event ids are slugs of the event's name, so an upstream rename changes the
id. In that case `check:data` reports the review as orphaned, and the fix is
to move it to the new id. Step 1 also makes event slugs collision-safe (see
below).

---

## The text match

`npm run audit:scan` runs at the end of `import:theographic`, and by hand
after editing overrides.

- **Rules match the shape of a relationship, not just the words near it.** A
  verse that names two people near the word "son" isn't enough: Exod 6:25
  names Aaron and Phinehas with "son", but Phinehas is Aaron's grandson.
  Rules look for patterns like "X the son of Y", "Y begat X", "X, Y's son",
  and "Y took X to wife".
- **A weaker rule, labeled as such.** For event participants and locations,
  "named in the event's passage" is all an automatic match can show, so the site says
  exactly that and doesn't treat it as a stated fact.
- **Number checks:** ages in Gen 5 and 11, and reign lengths in Kings and
  Chronicles, checked against the dates in the data.
- **A built-in test.** The scan makes up false edges (each grandparent
  recorded as a parent, uncles, cousins) and fails if more than a handful
  pass. Then if a rule gets too loose, it shows up as a failure.

It writes **`data/evidence/matches.json`** (committed, never hand-edited):

- **The header:** the Theographic commit and a hash of the seed and overrides
  it read. No run date, so the same data always produces the same file.
- **One line per matched fact:** `"parent-of:…@hash": ["gen.25.19", "son-of"]`.
  That's the verse and the rule that matched. It comes to roughly 300 KB.

It prints a summary: matches by kind and rule, any dates the text disagrees
with, and the self-test. The facts it couldn't match are the AI pass's queue:
`npm run audit:batch` gathers the ones filed under a passage.

**In CI:** a separate workflow, `.github/workflows/audit.yml`, runs only on
pull requests that touch `data/` or the audit scripts. It fetches
`verses.json` (cached by Theographic commit, so the download is rare), runs
the scan, and fails if `matches.json` would change. It never commits
anything itself. The failure says to run `npm run audit:scan` and commit.
If the check is ever made required for merging, give it a job that always
runs and skips the work when no data changed. A required check whose
workflow never started stays "pending" and blocks the merge.

---

## AI and editor files

One file per batch in `data/evidence/`. A batch is a stretch of Scripture
small enough for one Haiku run and one review sitting: "esther",
"1chr-1-4", "gen-11-25". Each fact lives in exactly one file: the batch
containing its first supporting verse.

```jsonc
// data/evidence/esther.json
{
  "passage": "esth.1-10",
  "ai":     { "model": "haiku", "on": "2026-11-10" },
  "editor": { "by": "jamers99", "on": "2026-11-12", "sampled": 0.1 },

  // The AI agrees with the text match's verse: id@hash, nothing else
  "agreed": [
    "participated-in:esther_1343>esther-becomes-queen@3f9a",
    "participated-in:mordecai_2107>esther-becomes-queen@b21c"
  ],

  // Facts with a written entry. The editor reads every one
  "facts": {
    "date:esther-becomes-queen@7d0e": {
      "refs": ["esth.2.16"],
      "sources": ["xerxes-accession"],
      "note": "Tenth month, seventh year of Ahasuerus (Esth 2:16). 479 BC follows from Xerxes taking the throne in 486 BC."
    },
    "partner-of:ahasuerus_117>esther_1343@c4e1": {
      "refs": ["esth.2.17"],
      "note": "Missing from the data; added in overrides/edges.json. 'He set the royal crown upon her head, and made her queen.'"
    },
    "member-of:…@…": { "kind": "wrong", "note": "Fixed in overrides/edges.json." }
  }
}
```

- **Each written entry has:**
  - `refs`: the verses.
  - `sources`: for anything from outside the Bible.
  - `note`: a short note.
  - `kind`: *verse* (the default, the text says it), *reading* (an
    interpretation, explained in the note), or *wrong* (an error, fixed in
    overrides).
- **Missing facts:** when the AI finds something absent from the data, like
  the Ahasuerus–Esther marriage, it goes straight into `data/overrides/` in
  the same PR, with a written entry here. There's no separate list of
  proposals.
- **The editor's mark is honest about what it covers.** The editor reads
  every written entry and samples the `agreed` list at the rate recorded in
  `sampled`. Only facts the editor actually read show as "read by an
  editor". An agreed fact shows "AI agreed · batch spot-checked by an editor
  (10%)".
- **Batch size:** a batch is capped so one Haiku run stays small. Heavy
  chapters like 1 Chr 1–9 are split.

---

## On the site

Each fact gets a "how we know" marker. Each layer has its own mark, so an AI
check never looks like a person's:

> **Father:** Abraham · [Gen 25:19](#)
> - **Verse:** Gen 25:19 (opens on bible.com)
> - **Text match:** "Isaac, Abraham's son", the son-of pattern
> - **AI:** agreed (Haiku, Nov 2026)
> - **Editor:** batch spot-checked (jamers99, Nov 2026)

A fact with no checks shows *unchecked*. A *reading* shows its note. Each
record's Sources section (today it lists one source) merges with this: where
the data came from, the text it was checked against (KJV), and a tally that
keeps the layers apart: "14 facts: 12 supported by the text, 14 agreed by
AI, 3 read by an editor". The tally replaces the "draft" badge.

---

## Steps

### 1. Code audit (one PR)

Go through the import and the app for each place that adds, infers, or
drops a fact, then fix or label each one:

- **Bars that look like lifespans but aren't.** Only 31 of the 286
  published people have a known birth and death. Everyone else's bar spans
  their dated events (`personSpan`, which keeps the densest run of events
  within 100-year gaps), and it reads as a life. Ezra's bar stops at 445 BC
  just as Nehemiah's starts, but they worked together: Ezra is at the
  wall's dedication in Neh 12:36, an event that doesn't exist in the data
  yet.
  - **Draw attested people differently:** a dot for each dated event, joined
    by a thin line that fades out at both ends. Only a known lifetime gets a
    solid bar.
  - **Say it in words:** "Mentioned 458–445 BC (2 dated events) · lifespan
    unknown".
- **Co-regencies.** The kings track infers them from overlapping dates.
  Label them as a reconstruction.
- **Editorial prose without verses.** The era and kingdom text (ledes,
  notes) needs verse references.
- **Per-record source notes.** `SourceNote` shows only the record's main
  source. The footer and the description heading already credit Easton's.
  Fold this into the Sources section above.
- **Truncated summaries.** The first-sentence summary (`summarize`) can cut
  off a "probably".
- **Dropped edges.** Review the list of edges the importer drops.
- **Deleting seed edges.** Overrides can't remove a seed edge yet. Add a
  small tombstone.
- **Event slugs.** Adding a second event with the same name currently
  renames the first. Make that impossible, or at least make the importer
  report it.
- **Licensing.** The repo is MIT, and the README says the data is "likely
  CC-BY-SA". Since the data derives from Theographic, mark `data/`
  (evidence included) as CC-BY-SA explicitly. Quoting the KJV in notes is
  fine. Keep quotes short.

### 2. Text match and display (one PR)

The scan, `matches.json`, the fact ids and hashes in `check:data`, the
`audit.yml` workflow, and the "how we know" marker with the Sources section.

### 3. AI and editor passes (one PR per batch)

Published and editorial records first, then drafts, batch by batch. Most
Bible-era people, including Esther, Mordecai, Ezra, and Nehemiah, are still
drafts, so drafts are where most of this work is.

1. **AI pass.** Haiku reads the batch's passage text and every fact in it,
   including the ones the text match found. It can only cite verses from that
   text. For each fact, it agrees or writes an entry. For each namesake, it
   decides which person is meant. It also reports what's missing: events,
   links, and lifetime facts the text states, never a guessed lifespan.
2. **Editor pass.** You read every written entry and sample the agreed
   list. A PR can merge with only the AI layer. The site then says exactly
   that.
3. **Fixes.** Corrections and missing facts go in `data/overrides/`. Mark
   errors that come from Theographic with `"upstream": true`, so they can be
   listed if you want to send them. We don't file anything.

---

## The first full pass (Nov 2026)

Every fact has now been through the AI layer. The pass ran 59 batches by
passage, Acts first and 1 Chronicles last. Then it swept the facts left
without a verdict, most of which had been filed under the wrong chapter, and
ended with one batch of era dates.

| | Facts |
|---|---|
| AI agreed with the text match | 1,995 |
| AI wrote a verse | 1,430 |
| AI called it a reading | 2,181 |
| AI flagged it wrong | 233 |
| No verse found, after two passes (`unsupported`) | 111 |

Most readings are dates, which come from an outside chronology. Most of the
rest are identifications the text doesn't make: a tribe inferred from
descent, a spelling variant, a "same place as" from outside the passage.

What the flags found, for the editor:

- **Events placed at every stop of a journey.** Upstream puts Cnidus under
  "the journey to Rome begins" and Puteoli under "Paul arrives at Rome". It
  also puts reigns from before Omri built Samaria (1 Kgs 16:24) in Samaria.
- **Loose "visited" links.** Paul's companions are linked to every stop of a
  voyage, and the ports of ships' origins count as visits. About 65 have no
  verse at all. They stay in the data, marked "no verse found".
- **Generation slips in genealogies.** Grandfathers and brothers are recorded
  as fathers (Hur and Caleb's sons in 1 Chr 2:50; Shimei for Obed-edom's sons
  in 1 Chr 26:4).
- **Merged or duplicated people.** One record covers Jacob the patriarch and
  Jacob the father of Joseph (Matt 1:16), and another covers both Anahs of
  Gen 36. `james_719`, the Lord's brother, is also listed among the twelve.
  Zerubbabel and Zorobabel are two records.
- **Dates that disagree with the text.** Jacob's lifetime ends 33 years after
  his death (Gen 47:28). Job lives 140 years in all, against "after this lived
  Job an hundred and forty years" (Job 42:16). Israel's time in Egypt spans 216
  years, against the 430 of Exod 12:40, a known chronology question.

**Running a batch** (for new or changed facts, or a re-review):

1. `npm run audit:batch -- <name> <passage>` writes `audit/batches/<name>.md`.
   A passage can list chapters (`gen.12-24` or `exod.12,exod.14`); aim for
   under ~150 facts. `--kind date,lede` picks facts by kind instead, and
   `--stale` gives a batch's reviews that the data has since changed under.
2. Give a Haiku sub-agent the prompt in
   [audit-review-prompt.md](./audit-review-prompt.md), with the name and
   passage filled in. It writes `data/evidence/<name>.json`.
3. Check the result. Run `npm run audit:format` (one entry per line) and
   `npm run check:data`, spot-check that the cited verses name the people
   involved, and read every "wrong" entry.
4. Commit it. The editor's review happens in the PR.

Lessons from the first pass:

- **File a fact where its verse is.** A fact with no text match goes under
  the first verse naming both its records, or under one of them in a chapter
  naming the other. Filed under a person's first verse instead, Paul's 52
  visits all landed at Acts 7.
- **Upstream's other names include titles.** "Lord", "King" and "mother"
  aren't names to match on, except God's titles. Left in, "God" in Judges
  1:7 matched "Jesus died at Jerusalem".
- **Spell out the kinds.** A reading is probably true but rests on something
  the text doesn't say. Wrong means the text says otherwise. Without the
  examples in the prompt, Haiku calls a contradiction a "reading".
- **Its missing-fact reports are mostly already in the data,** filed in
  another batch (Adam is Seth's father at Luke 3:38). Check them against the
  whole dataset before adding any.
