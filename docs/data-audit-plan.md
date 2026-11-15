# Data Audit Plan: checking the data against Scripture

> **Status (Nov 2026):** steps 1 and 2 are built. The text match supports
> 3,560 of the 6,114 facts. Step 3's AI pass is done, and every fact has an AI
> verdict: 212 are flagged wrong, 2,241 are readings, and 113 are marked "no
> verse found". None has had an editor's review yet; see "The first full pass"
> and "The Nov 14 re-import" below for what to look at first.

**Goal:** every fact the site shows points to the verse that supports it,
and says plainly how that was checked: by an automatic text match, by an AI, or by a
person. The app must not add to or drop from what the data says.

**What the site is:** Theographic's data, shown faithfully, with a thin
overlay of our own (`data/overrides/`). Errors we find go back to Theographic
rather than into the overlay, so it shrinks with each re-import.

**Principle: layered checks, each one transparent.** Each layer adds its own
mark to a fact, says why, and is shown distinctly. A reader can see each one
and decide what to trust.

| Layer | What it shows | Stored |
|---|---|---|
| **Text match** | The text supports the fact: a verse states the relationship in a recognised pattern, e.g. Gen 25:19, "Isaac, Abraham's son" | One generated file |
| **AI** | Haiku read the passage and agreed, or flagged it with a note | Per batch |
| **Editor** | A person read it and gave a verdict | `data/reviews.json`, from the app's review mode |

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
    interpretation, explained in the note), *wrong* (an error, for an
    editor to confirm and report upstream), or *unsupported* (no verse
    found).
- **Missing facts:** when the AI finds something absent from the data, like
  the Ahasuerus–Esther marriage, check the whole dataset first (most are
  there, filed in another batch), then report it upstream. Add it to
  `data/overrides/` only as a stopgap.
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
AI, 3 read by an editor". The tally took the place of the "draft" badge, which went when upstream
dropped its status field (Nov 2026).

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

Batch by batch, by passage.

1. **AI pass.** Haiku reads the batch's passage text and every fact in it,
   including the ones the text match found. It can only cite verses from that
   text. For each fact, it agrees or writes an entry. For each namesake, it
   decides which person is meant. It also reports what's missing: events,
   links, and lifetime facts the text states, never a guessed lifespan.
2. **Editor pass.** Editors don't read every fact. They settle what the AI
   flagged ("wrong" and "no verse found"). In the app's review mode
   (`/review/`), reviewers go through the queue, most severe first (each flag and "no verse found" carries
   the AI's `severity`; the 344 from the first pass were rated afterwards, by
   Haiku with the same scale), and submit their verdicts as a GitHub issue. Labeling it
   `apply` turns it into a pull request against `data/reviews.json` (see
   [data/evidence/README.md](../data/evidence/README.md)). A batch can merge
   with only the AI layer. The site then says exactly that. Each verdict
   settles a flag one of two ways:
   - **Not an issue** (verdict "right"): the AI was wrong. Applying the
     verdict also deletes the AI's entry from its batch file, so the page
     shows the editor's verdict and note, not a flag with a correction
     under it. *(To build: today the AI's note stays, shown as "The AI
     said: …".)*
   - **A real issue** (verdict "wrong"): it goes to Theographic. Review mode
     gives a report ready to paste into their data-correction form (the fact,
     the verses, the note), for their data-quality ledger
     (`data-quality/issues.yaml` upstream). The fact stays flagged until their
     export fixes it; the data then changes, the review goes stale, and the
     fact comes back for a fresh look. *(To build: the report.)*
3. **Fixes.** Theographic fixes errors in its own data. `data/overrides/`
   holds what upstream can't or won't take (our editorial events and
   descriptions, the era notes) and, when it's worth it, a stopgap while a
   report is pending. After each re-import, `check:data` warns about any
   override that now says what the seed says, so it can go.

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
   under ~150 facts. `--kind date,lede` picks facts by kind instead,
   `--stale` gives a batch's reviews that the data has since changed under,
   and `--flagged occurred-at,…` gathers every batch's "wrong" entries of
   those kinds to re-check after a rule changes. A `--flagged` reviewer writes
   `audit/batches/<name>.json`; `npm run audit:merge -- <name>` puts each
   verdict back in the batch the fact lives in.
2. Give a Haiku sub-agent the prompt in
   [audit-review-prompt.md](./audit-review-prompt.md), with the name and
   passage filled in. It writes `data/evidence/<name>.json`.
3. Check the result. Run `npm run audit:format` (one entry per line) and
   `npm run check:data`, spot-check that the cited verses name the people
   involved, and read every "wrong" entry.
4. Commit it. The editor's review happens in the PR.

## The Nov 14 re-import

Theographic was re-imported at `3d8aa2e` (Nov 14, 2026). Upstream fixed
eleven misspelt event names and merged the two Mount of Olives records; the
reviews moved to the new ids. It also fixed Jacob's lifetime, which the first
pass had flagged (it now ends at 147 years, Gen 47:28), and moved five other
dates, which were re-checked.

Upstream added 40 events for the exile and return. Seven duplicated events we
had added by hand, on another chronology: Theographic takes Esther's Ahasuerus
to be Darius I, so Esther is queen in 515 BC (479 BC if he is Xerxes I), and
Ezra and Nehemiah come nine years earlier than in most accounts. We adopted
upstream's events and kept our descriptions, which give both dates, and kept
our three events upstream lacks (Ezra reads the Law, the wall's dedication,
Nehemiah's second term), re-dated to fit.

Five batches covered the 209 new or changed facts: `exile-events`,
`return-events`, `esther-events`, `early-periods`, and the nine stale dates in
place. They flagged 17 as wrong, none high: mostly a journey's starting point
or a passing name counted as an event's place or a part in it. Four of
Haiku's "wrong" calls were changed to readings, because the person acts in
the event's own verses.

For the editor:

- **Split people.** `eliashib_1099` (Neh 3:1) and `eliashib_1101` (Neh 13:4)
  both look like the high priest `eliashib_1100`. `artaxerxes_313` (Ezra 4:7)
  may be `artaxerxes_314`.
- **Zerubbabel's father** is recorded as Pedaiah (1 Chr 3:19), not Shealtiel
  (Ezra 3:2; Hag 1:1).
- **Zedekiah** is Jehoiachin's uncle in 2 Kgs 24:17 and his brother in
  2 Chr 36:10.

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
- **An event is its whole verse range.** After the re-import, every "wrong"
  call that was overruled had the same cause: Haiku judged a person against
  the event's title (Daniel takes no part in "Fall of Babylon") rather than
  its verses (Dan 5, where he reads the writing). The prompt now says so, and
  each event fact gives the event's verses. Re-checking the 114 earlier
  "wrong" flags on event facts with it (`--flagged participated-in` and
  `occurred-at`) cleared 35: 19 people who act within the event, and 16
  places where a journey stops or the event happens. 79 stay wrong, and 2
  became "no verse found".
- **Its missing-fact reports are mostly already in the data,** filed in
  another batch (Adam is Seth's father at Luke 3:38). Check them against the
  whole dataset before adding any.
