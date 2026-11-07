# Data Audit Plan: checking everything against Scripture

**Status:** proposal, not started. **Goal:** every fact the site shows can be
traced to a specific verse (or is clearly labeled as not coming from
Scripture), each check carries a confidence rating and says who or what made
it, and the app neither adds to nor drops from what the data says.

The audit has two halves:

1. **The data.** Is the JSON correct when checked against the biblical text?
2. **The processing.** Does the code between the JSON and the screen pass the
   data through faithfully, or does it infer, merge, truncate, or drop things?

---

## 1. Where things stand today

Counts from `data/seed/` at the time of writing:

| Records | Total | Published | Draft (Theographic `wip`) |
|---|---|---|---|
| People | 3,067 | 286 | 2,781 |
| Places | 1,298 | 1,298 | 0 |
| Events | 450 | 450 | 0 |
| People groups | 23 | 23 | 0 |
| Edges (relationships) | 7,815 | — | — |

Edges by type: sibling-of 2,330 · parent-of 1,785 · participated-in 881 ·
member-of 843 · occurred-at 476 · visited 463 · part-of 368 · alias-of 257 ·
half-sibling-of 244 · partner-of 104 · died-at 45 · near 19.

Hand-authored editorial layers: `data/overrides/periods.json` (eras, dates,
ledes, journeys), `data/overrides/kingdoms.json` (houses, reign notes),
`data/overrides/events.json` (corrections and added events).

Things to keep in mind:

- **"Draft" only exists for people.** Upstream dropped status for places, and
  events never had one, so every place and event is "published" by default,
  not because anyone checked it. Theographic's `publish` vs `wip` is a
  completeness flag on their side, not a check against Scripture. Even the
  published people have a median of 3 verses, so "published" doesn't mean
  "major figure".
- **Every record says `source: "theographic"`.** The only Scripture link is
  `scriptureRefs`, and that means *verses that mention this record*, not
  *verses that prove each fact*. For events it's the whole passage expanded
  verse by verse (Reign of David = every verse of 2 Sam 2 through 1 Kgs 2).
- **Descriptions are Easton's Bible Dictionary (1897).** That's a commentary
  with its own interpretations ("probably a thousand souls"), but the page
  footer credits Theographic only.
- **Dates aren't stated in Scripture** (see §9, "Dates").
- A quick structural pass came back clean: no person has more than two
  parents, no same-gender parent pairs, no parent dated younger than a child.
  13 events have no participants.

---

## 2. The text we check against: Theographic's `verses.json`

We check against the **KJV text in Theographic's own `verses.json`**: 31,102
verses, already pinned in `data/vendor/theographic/snapshot.json` and fetched
by `npm run vendor:fetch` (gitignored, 37 MB). The KJV is public domain, so
the audit tooling can quote it freely and the reports can include verse text.
Each verse also carries Theographic's own tags: which people and places it
mentions, linked inline (`[Abraham](/person/abraham_58)`), so going from a
verse to the records it mentions, or back, is a lookup.

- **Use the text, not the tags, as the evidence.** The tags are part of the
  same dataset we're checking. Using them to confirm a person's verses would
  be circular. They're a good index for *finding* candidate verses, and a
  mismatch between the tags and the text is itself a finding. But a claim is
  confirmed only by what the verse's words say. The tags are also mostly
  `wip` upstream (26,311 of 31,102 verses).
- **Names stay as they are.** No switch to ESV spelling. Theographic's names
  come from this same KJV text, so names and verses agree, and nothing churns.
- **Readers still get the ESV.** The app already links each reference to
  bible.com in the ESV (`src/lib/scripture.ts`, `passageUrl`). The KJV is
  only what the audit checks against. Chapter and verse numbering is the same
  for both, so the links line up.
- **A second witness where it matters.** For a disputed reading or identity
  question, check the Hebrew or Greek (Strong's) or another translation, and
  note it in the claim. This is the exception, not the routine.

---

## 3. How verification is recorded: a "claims" layer

I'd keep verification separate from both seed (generated, never hand-edited)
and overrides (corrections). Add **`data/verification/`**, one file per
batch, holding **claims**: one row per fact the site shows, each with its
proof text, a confidence rating, and who checked it.

```jsonc
// data/verification/patriarchs.json
[
  {
    "record": "isaac_616",
    "claim": "parent-of:abraham_58",          // what's being asserted
    "verdict": "confirmed",                   // see below
    "confidence": "certain",                  // see below
    "basis": "stated",                        // stated | derived | inferred
    "refs": ["gen.21.3"],                     // the proof text(s)
    "note": "\"And Abraham called the name of his son that was born unto him, whom Sarah bare to him, Isaac.\"",
    "checked": [
      { "by": "scan", "on": "2026-11-10" },
      { "by": "agent", "on": "2026-11-10" },
      { "by": "jamers99", "on": "2026-11-12" }
    ]
  },
  {
    "record": "zechariah_2994",
    "claim": "identity:2chr.24.20",           // this verse is about this Zechariah
    "verdict": "confirmed",
    "confidence": "medium",
    "basis": "inferred",
    "refs": ["2chr.24.20", "matt.23.35"],
    "note": "Son of Jehoiada the priest in 2 Chr 24:20; Matt 23:35 calls him 'son of Barachias'. Most read these as one man; the name difference is unexplained.",
    "checked": [{ "by": "agent", "on": "2026-11-10" }]
  }
]
```

**Verdict**, meaning what the text says about the claim:

- `confirmed`: the passage supports it.
- `corrected`: it was wrong, and an override fixes it (the claim links to the
  override).
- `unsupported`: no passage says it, so remove it or label it.
- `disputed`: Scripture allows more than one reading, and the note says which
  and why.
- `extra-biblical`: the fact isn't from Scripture (coordinates, BC dates,
  Easton's prose), so it's labeled and its real source cited.

**Confidence**, meaning how sure we are of the verdict:

| Rating | Meaning | Example |
|---|---|---|
| `certain` | One verse says it in so many words | "Abraham … his son … Isaac" (Gen 21:3) |
| `high` | Follows directly from two or more verses, or is explicit with only a trivial gap | Terah's age at Abram's birth, from Gen 11:26, 11:32 and 12:4 |
| `medium` | A reasonable reading that depends on an assumption: usually *which* person of that name is meant | the Zechariah above |
| `low` | Weak support. The verse is near the claim but doesn't make it | a tribe inferred from a neighbour in a list |
| `none` | Nothing in the text supports it | — |

**Basis** says what *kind* of support it is: `stated` (the verse says it),
`derived` (computed from what verses say, with the working in the note), or
`inferred` (a reading, not a statement).

**Checked** records *who or what* made the verdict, in order: `scan` (the
automated pass, §5), `agent` (an AI first-pass reviewer, §6), and a person's
handle when you've reviewed it. The site can show this ("checked by script",
"reviewed by AI", "reviewed by an editor") alongside the confidence rating.

**Status follows from the claims.** A record is *verified* when every claim
it shows has a verdict, and *partly verified* when some do. That replaces the
draft/published flag in the UI. Theographic's `wip` flag stays in the data as
history.

**`check:data` enforces it.** Every claim must point at a real record, edge,
or field. Every `confirmed`, `corrected`, or `disputed` claim needs at least
one ref, and the ref has to exist in `verses.json`. Contradicting claims are
an error. When a re-import changes a fact, its claim goes *stale* and has to
be checked again, rather than keeping an old verdict.

### Which claims a record carries

| Record | Claims to verify |
|---|---|
| Person | name, gender, each parent, child, sibling, half-sibling, and spouse edge, tribe or group (`member-of`), place of death, each event they took part in, **identity** (the cited verses really are this person and not a namesake), birth and death years (`derived` or `extra-biblical`) |
| Place | name and alternate names, each `alias-of` / `part-of` / `near`, the verses citing it, coordinates (`extra-biblical`, cite OpenBible) |
| Event | name, the passage range, each participant, each location, the date (`derived`, showing the chain of verses) |
| People group | name, members |
| Period (editorial) | boundaries, the passage range in the description, the lede (the paraphrase must match the text), journeys, "moments" |
| Kingdom (editorial) | the order of kings, which house each belongs to, notes ("Rival to Omri", "Reigned seven days"), reign lengths against Kings and Chronicles |
| Description | Easton's text: label it as commentary and attribute it properly. We don't verify it line by line, but flag statements that go beyond the text |

Rough size: **15,000–20,000 claims**, mostly edges and person identity.
That's why the process below automates the mechanical part and spends human
attention on what's left.

---

## 4. Phase 1: audit the processing layer (code, not data)

This needs no verse text, so it can start right away. The work is to trace
every step from `data/vendor/` to the rendered page, and list each place the
code **adds, infers, merges, drops, or reshapes** a fact. For each one,
decide whether to keep it, label it, or remove it. Already found:

| Where | What it does | Question |
|---|---|---|
| `scripts/import-theographic.ts` | Maps `wip`→draft, flattens relationship fields into edges, drops edges whose endpoint doesn't resolve, and parses `duration` ("7D", "40Y") into end years | Are the dropped edges real facts we're losing? (The importer reports counts; review the list.) Does "7D" → same year match the source? Upstream keeps both `father` and `children` lists: do they ever disagree? |
| `src/lib/chronology.ts` `personSpan` | A person with no birth and death year gets a **made-up lifespan** built from their dated events (split at 100-year gaps, picking the busiest run) | The timeline shows a bar for someone Scripture gives no dates for. It's flagged `lifetime: false`. Is that obvious enough on screen? |
| `src/lib/chronology.ts` `periodsOverlapping` | Assigns eras by date overlap | Fine as presentation, but era assignment rests on unverified dates |
| `src/lib/family.ts` `lineage` | Follows the father, or the mother if no father is recorded | A presentation choice. Make sure it never invents a link |
| `src/lib/kingdoms.ts` | Strips "Reign of " to get the king's name. A reign overlap of a year or less counts as a hand-over; anything longer as a co-regency | Co-regencies are a scholarly reconstruction, not stated. Label them |
| `data/overrides/kingdoms.json` | Houses, notes | Editorial: each note becomes a claim |
| `data/overrides/periods.json` | Era dates, descriptions, ledes, journeys | Editorial prose that paraphrases Scripture: each sentence needs a ref |
| `src/lib/format.ts` `summarize` | Cuts a description to its first sentence, or 220 characters | Check that it never cuts off a qualifier ("probably…") and turns a guess into a fact |
| `src/lib/format.ts` year display | Converts astronomical years to BC (`1 - year`) | Unit-test the edge cases: 1 BC / AD 1, and ranges across 0 |
| `src/lib/data/merge.ts` | Overrides replace fields shallowly. They can't delete a seed edge | We'll need a tombstone to remove a wrong edge |
| `SourceNote.astro` | Credits one source | Easton's descriptions are credited to Theographic only |
| Timeline lane packing | Hides low-weight items when zoomed out | Presentation only, but confirm nothing is lost for good |

**Deliverables:**

- A "faithfulness" test suite. For a sample of records it renders the page
  data and checks two things: every fact shown is either in seed+overrides or
  explicitly marked as derived, and every seed fact for the record appears.
- A written list of each inference, how it's labeled, and why it's there.

---

## 5. Phase 2: automated scan (a script over every record)

A script (`npm run audit:scan`) reads `verses.json` and checks every record.
It's plain code, with no AI involved, so it's fast, free, and repeatable. It
doesn't confirm anything on its own. It produces `scan` entries with a
provisional confidence rating, and sorts records into "probably fine" and
"look at this".

1. **Is the name in the verse?** For each record and each cited verse, does
   the KJV text contain the name (or one of its alternate names)? A miss points to a wrong
   verse or a mix-up between people with the same name. We also compare
   Theographic's tags with the text: a tag where the name isn't in the verse,
   or the name where there's no tag.
2. **Do the relationships appear in the text?** For each `parent-of`, is
   there a verse naming both people with "son of", "daughter of", "begat",
   "bare", or similar? Do the same for spouses ("wife", "husband") and for
   tribes. An edge with no such verse goes to the top of the review queue. A
   clear pattern match ("Isaac … son of Abraham" in one verse) gets a
   provisional `high`.
3. **Do participants and places appear in the event's passage?** For each
   participant or location of an event, is it named in the passage?
4. **Is the passage contiguous?** Do an event's refs form a sensible range,
   and is every ref a real verse?
5. **Do the numbers agree?** Recompute what Scripture gives directly and
   compare it with the dates and durations in the data: ages at fatherhood in
   Gen 5 and 11, reign lengths and accession synchronisms in Kings and
   Chronicles, 1 Kgs 6:1, Exod 12:40. Each mismatch goes in a report, either
   as an error or as a chronology choice that isn't documented.
6. **Structural checks.** Extend `check:data`:
   - siblings share a parent, and half-siblings share exactly one
   - no symmetric edge contradicts a directional one
   - no one is their own ancestor
   - every event has at least one participant (13 currently don't)

**Output:** `audit/scan-report.md` (committed), with a score per record that
orders the review queues.

---

## 6. Phases 3 and 4: claim-by-claim review

The process is the same in both phases. Only the queue differs.

- **Phase 3, published and editorial records first:** the 286 published
  people, 450 events, and 23 groups, every period and kingdom, then places,
  in order of prominence (verse count, presence on the timeline or map). The
  editorial layers come first of all, since they're ours.
- **Phase 4, the 2,781 drafts:** batched by **where they appear in
  Scripture**, not alphabetically, so one batch is one stretch of text read
  once. Batches like the Genesis genealogies, the tribal lists in Numbers,
  1 Chronicles 1–9 (a large share of the drafts), the Ezra and Nehemiah lists,
  the Gospels, Acts. Identity questions (which Zechariah is this?) are easiest
  to settle with the whole passage in front of you.

**Each batch:**

1. **Scan.** Run §5 over the batch.
2. **AI first pass.** A model reads the batch's passages (from `verses.json`)
   alongside every claim, and writes the verdict, confidence, basis, refs,
   and a one-line quote or reason for each. It may cite only verses in the
   text it was given, so it can't cite from memory. To handle the volume this
   runs on a cheaper, faster model, with a stronger model re-checking
   whatever comes back below `high`, plus anything the scan and the first
   pass disagree on. Options for running it:
   - **Claude Code sub-agents.** Runs inside these sessions on a smaller
     model. No setup or API key, but it uses the session's own usage. Fine to
     start with and for the published set.
   - **A script calling a model API in batch mode.** Better for the drafts:
     runs unattended, costs less per claim, and is repeatable. Needs an API
     key, saved as a credential on the cloud environment (never committed).
     This is the "quick first pass" option.
3. **Your review.** You read every `corrected`, `unsupported`, and `disputed`
   row, every row rated `medium` or below, and a random sample of the
   `certain`/`high` rows (say 10%, more if the sample turns up errors). Your
   handle is added to `checked` on the rows you've seen.
4. **Corrections** go into `data/overrides/`, with an edge tombstone when a
   seed edge has to go. Each one that comes from upstream data is also logged
   for the upstream report (§8).
5. **One PR per batch**, so each one is a reviewable diff of claims and
   fixes.

Order of work, with a rough size for each:

| Step | Scope | Rough size |
|---|---|---|
| 1 | Phase 1: processing audit and faithfulness tests | 1–2 sessions |
| 2 | Claims layer: schema, `check:data` rules | 1 session |
| 3 | Phase 2: scanner and first report | 1–2 sessions |
| 4 | First-pass model runner (sub-agents first, the batch API script later) | 1 session |
| 5 | UI: verse citations, confidence, and badges (§7), so verification shows as soon as it exists | 1–2 sessions |
| 6 | Editorial layers (periods, kingdoms) | 1–2 batches |
| 7 | Published people and events, by era | ~10–15 batches |
| 8 | Places | ~8–10 batches |
| 9 | Drafts, by passage | ~30–40 batches |

---

## 7. Pointing back to the Bible in the app

Links already go to bible.com in the ESV. What changes is that they attach to
**each fact**, not just a list of mentions:

- **Every fact carries its verse.** "Father: Abraham *Gen 21:3*", "Reigned
  seven days *1 Kgs 16:15*". Each reference opens the passage on bible.com,
  as the existing links do.
- **Confidence and who checked it are visible.** A small marker on each fact
  shows the rating (certain / high / medium / low) and expands to the note:
  the quote, the reasoning, who checked it. A `derived` fact ("c. 1010 BC")
  shows its working ("David was thirty years old when he began to reign, and
  he reigned forty years, 2 Sam 5:4…"). An `extra-biblical` fact
  (coordinates, Easton's prose) is labeled with its source.
- **"In Scripture" splits** into *key passages* (the proof texts behind the
  claims) and *all mentions* (today's list).
- **A verification badge replaces "draft"**: *Verified*, *Partly verified*,
  or *Not yet reviewed*. The existing "Show draft records" setting becomes
  "Show unreviewed records".
- **The source note names every source**: "Data: Theographic (CC-BY-SA),
  checked against the KJV text. Description: Easton's Bible Dictionary, 1897.
  Links: ESV on bible.com."

---

## 8. Corrections for Theographic (a report; you file it)

We don't open issues or PRs upstream. The audit produces a report you can
read and send however you like. Our claims and review process are for us.
What could help Theographic is the **errors we find**, in a form a
maintainer can check quickly by hand. Theographic is an Airtable base
exported to GitHub, so a fix to their JSON would likely be overwritten by the
next export, and an issue or note is probably the route. That's your call.

1. **Log upstream errors as we go.** Each `corrected` or `unsupported` claim
   that comes from upstream data (not our code or editorial layers) is tagged
   `upstream: "pending"`. The tag records the upstream record id, the field,
   the current value, the proposed value, and the verse.
2. **`npm run audit:upstream`** writes `audit/upstream-corrections.md`. It's
   grouped by passage and has one row per correction: record, field, current
   value, proposed value, verse with its KJV text, and a one-line reason.
   It includes only rows you've reviewed. Disputed or interpretive items are
   marked as such, or left out.
3. **Track status by hand.** You update each row's status: `pending` →
   `reported` → `fixed-upstream`, `declined`, or `local-only`. Each local
   override stays until the fix arrives in a re-import.
4. **Close the loop on re-import.** `check:data` warns in two cases:
   - an override now matches seed (the fix landed upstream, so the override
     can go)
   - a re-import changed a verified fact (the claim goes stale and gets
     re-checked)

Whether or not upstream takes any of it, the log documents every place our
data differs from theirs, and why. That's worth having for the CC-BY-SA
attribution anyway.

---

## 9. Open questions

1. **First-pass model.** Start with Claude Code sub-agents, then move the
   drafts to a batch API script once the prompts and claim format have
   settled?
2. **Review depth.** Is a 10% spot-check of `certain`/`high` rows enough?
3. **Dates.** No BC/AD year is written in the Bible. The data's dates come
   from one reconstructed timeline (Theographic's), built by adding up the
   numbers Scripture *does* give: ages, reign lengths, "in the 480th year".
   Scholars add those up differently (the Exodus is c. 1446 BC on one
   reckoning and c. 1270 BC on another, and the kings' dates shift by
   decades), so verifying a date means two things:
   - **Now (recommended):** keep Theographic's dates. Check the biblical
     numbers they rest on (does 2 Sam 5:4 say forty years? does the data
     match?), and label each date "derived, one chronology", with the verses.
   - **Later, separately:** decide whether to adopt a specific scholar's
     chronology (e.g. Thiele for the kings) or show alternatives. That's the
     "scholarly alternatives" item already on the roadmap, and is its own
     project.
