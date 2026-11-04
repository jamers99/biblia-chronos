# Data Audit Plan: checking everything against Scripture

**Status:** proposal, not started. **Goal:** every fact the site shows can be
traced to a specific passage of Scripture (or is clearly labeled as not coming
from Scripture), and the app neither adds to nor drops from what the data says.

The audit has two halves:

1. **The data.** Is the JSON correct when checked against the Bible itself (ESV)?
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
ledes, journeys), `data/overrides/kingdoms.json` (houses, reign notes), and
one event rename in `data/overrides/events.json`.

Things to keep in mind:

- **"Draft" only exists for people.** Upstream dropped status for places, and
  events never had one, so every place and event is "published" by default,
  not because anyone checked it. Theographic's `publish` vs `wip` is a
  completeness flag on their side, not a check against Scripture. Even the
  published people have a median of 3 verses, so "published" doesn't mean
  "major figure".
- **Every record says `source: "theographic"`.** Nothing points at the Bible.
  The only Scripture link is `scriptureRefs`, and that means *verses that
  mention this record*, not *verses that prove each fact*. For events it's the
  whole passage expanded verse by verse (Reign of David = every verse of
  2 Sam 2 through 1 Kgs 2).
- **Descriptions are Easton's Bible Dictionary (1897).** That's a commentary,
  quoting the KJV, with its own interpretations ("probably a thousand souls"),
  but the page footer credits Theographic only.
- **Names come from Theographic** (mostly KJV-derived for people; places use
  `esvName`). Expect KJV/ESV spelling differences.
- **Dates aren't stated in Scripture.** They come from one reconstructed
  chronology (Theographic's) with no citation. Scripture gives the *inputs*
  (ages, reign lengths, synchronisms, "in the 480th year…"); the BC/AD year is
  a computation on top of them.
- A quick structural pass came back clean: no person has more than two
  parents, no same-gender parent pairs, no parent dated younger than a child.
  13 events have no participants.

---

## 2. Bible text: what we check against, and what we can store

**ESV is the standard.** It's under copyright (Crossway), which limits what we
can put in an open CC-BY-SA repo:

- **Checking:** use the ESV API (`api.esv.org`, free non-commercial key). We
  fetch text into a **gitignored cache** (`data/vendor/esv/`, like
  `verses.json` today) and never commit it. The API terms cap stored text
  (500 verses / half a book at a time), so the audit tooling fetches what one
  batch needs and clears it afterwards.
- **What we commit:** references and our own verdict and notes, never ESV
  wording beyond short quotes.
- **What readers see:** each reference links to the passage on esv.org
  (`https://www.esv.org/Genesis+21:3/`). If we want verse text inline later, a
  public-domain translation (BSB, WEB, or KJV) can ship with the site, or the
  ESV API can be called with attribution, under its display terms. That's a
  separate decision (see §7).
- **Second witness:** where something is unclear (a name spelling, a contested
  identity), we compare a public-domain translation and, where it matters, the
  Hebrew or Greek name (Strong's numbers are public domain). We note this in
  the verification record.

**Blocker right now:** this cloud environment's network policy blocks
`api.esv.org` (and `bible.helloao.org`, a public-domain text source). Add
them under the environment's allowed domains, or run the fetch step locally.

Versification: ESV uses English chapter and verse numbers, as Theographic
does, so references should line up. The automated pass flags any that don't
(see Phase 2).

---

## 3. How verification is recorded: a "claims" layer

I'd keep verification separate from both seed (generated, never hand-edited)
and overrides (corrections). Add **`data/verification/`**, one file per
batch, holding **claims**: one row per fact the site shows, each with its
proof text.

```jsonc
// data/verification/patriarchs.json
[
  {
    "record": "isaac_616",
    "claim": "parent-of:abraham_58",        // what's being asserted
    "verdict": "confirmed",                   // confirmed | corrected | unsupported | disputed | extra-biblical
    "refs": ["gen.21.3"],                     // the proof text(s)
    "basis": "stated",                        // stated | derived | inferred
    "note": "\"Abraham called the name of his son who was born to him, whom Sarah bore him, Isaac.\"",
    "checked": { "against": "ESV", "by": "jamers99", "on": "2026-11-04" }
  },
  {
    "record": "isaac_616",
    "claim": "name",
    "verdict": "confirmed",
    "refs": ["gen.17.19"],
    "basis": "stated"
  },
  {
    "record": "reign-of-zimri",
    "claim": "note:Reigned seven days",
    "verdict": "confirmed",
    "refs": ["1kgs.16.15"],
    "basis": "stated"
  }
]
```

- **Verdicts.** `confirmed`: the passage says it. `corrected`: it was wrong,
  and an override fixes it (the claim links to the override). `unsupported`:
  no passage says it, so remove it or label it. `disputed`: Scripture allows
  more than one reading, and the note says which and why. `extra-biblical`:
  the fact isn't from Scripture (coordinates, BC dates, Easton's prose), so we
  label it and cite its real source.
- **Basis.** `stated`: the verse says it directly. `derived`: computed from
  what Scripture says (Terah's age at Abram's birth comes from Gen 11:26,
  11:32 and 12:4). The note shows the working. `inferred`: a reasonable
  reading, but not stated.
- **Record status falls out of the claims.** A record is *verified* when every
  claim it shows has a verdict, and *partly verified* when some do. That
  replaces the draft/published flag in the UI. Theographic's `wip` flag stays
  in the data as history but stops being what the site shows.
- **`check:data` enforces it**: every claim points at a real record, edge, or
  field. Every `confirmed`, `corrected`, or `disputed` claim has at least one
  ref, and that ref is a real book, chapter, and verse (we already have
  `chapterCount`; add verse counts). No two claims contradict each other. When
  a re-import changes a fact, its claim gets flagged *stale*, so we re-check
  instead of carrying an old verdict forward.

### Which claims a record carries

| Record | Claims to verify |
|---|---|
| Person | name (ESV spelling), gender, each parent, child, sibling, half-sibling, and spouse edge, tribe/group (`member-of`), place of death, each event taken part in, **identity** (the cited verses really are this person and not a namesake), birth/death year (`derived` or `extra-biblical`) |
| Place | name and alternate names (ESV), each `alias-of` / `part-of` / `near`, the verses citing it, coordinates (`extra-biblical`, cite OpenBible) |
| Event | name, the passage range, each participant, each location, date (`derived`: show the chain of verses) |
| People group | name, members |
| Period (editorial) | boundaries, the passage range in the description, the lede (paraphrase must match the text), journeys, "moments" |
| Kingdom (editorial) | the order of kings, house assignments, notes ("Rival to Omri", "Reigned seven days"), reign lengths vs Kings and Chronicles |
| Description | Easton's text: label it as commentary and attribute it properly. We don't verify it line by line, but flag statements that go beyond the text |

Rough size: **15,000–20,000 claims**, mostly edges and person identity.
That's why the process below automates the mechanical part and spends human
attention on what's left.

---

## 4. Phase 1: audit the processing layer (code, not data)

This needs no Bible text, so it can start right away. Trace every step from
`data/vendor/` to the rendered page and list each place the code **adds,
infers, merges, drops, or reshapes** a fact. For each one, decide: keep and
label, keep as is, or remove. Already found:

| Where | What it does | Question |
|---|---|---|
| `scripts/import-theographic.ts` | Maps `wip`→draft, flattens relationship fields to edges, drops edges whose endpoint doesn't resolve, parses `duration` ("7D", "40Y") into end years | Are dropped edges real facts we're losing? (The importer reports counts; review the list.) Does "7D" → same year match the source? Does upstream keep *both* `father` and `children` lists, and do they ever disagree? |
| `src/lib/chronology.ts` `personSpan` | Without a birth and death year, **makes up a lifespan** from the person's dated events, splitting at 100-year gaps and picking the busiest run | The timeline shows a bar for someone Scripture gives no dates for. It's flagged `lifetime: false`. Is that obvious enough on screen? |
| `src/lib/chronology.ts` `periodsOverlapping` | Assigns eras by date overlap | Fine as presentation, but era assignment rests on unverified dates |
| `src/lib/family.ts` `lineage` | Follows the father, else the mother | A presentation choice. Make sure it never invents a link |
| `src/lib/kingdoms.ts` | Strips "Reign of " to get the king's name, treats ≤1-year overlaps as a hand-over and longer ones as a co-regency | Co-regencies are a scholarly reconstruction (Thiele), not stated. Label them |
| `data/overrides/kingdoms.json` | Houses, notes | Editorial: each note becomes a claim |
| `data/overrides/periods.json` | Era dates, descriptions, ledes, journeys | Editorial prose that paraphrases Scripture: each sentence needs a ref |
| `src/lib/format.ts` `summarize` | Cuts descriptions to the first sentence or 220 chars | Check that it never cuts a qualifier ("probably…") and turns a guess into a fact |
| `src/lib/format.ts` year display | Astronomical → BC (`1 - year`) | Unit-test the edges: 1 BC / AD 1, ranges across 0 |
| `src/lib/data/merge.ts` | Overrides replace fields shallowly, and can't delete a seed edge | We'll need a tombstone to remove a wrong edge |
| `SourceNote.astro` | Credits one source | Easton's descriptions are credited to Theographic only |
| Timeline lane packing | Hides low-weight items when zoomed out | Presentation only, but confirm nothing is lost for good |

**Deliverable:** a "faithfulness" test suite. For a sample of records it
renders the page data and checks that every fact shown is either in
seed+overrides or explicitly marked derived, and that every seed fact for the
record appears. Plus a written list of each inference, how it's labeled, and
why it's there.

---

## 5. Phase 2: automated cross-check (a machine pass over everything)

A script (`npm run audit:scan`) runs over all records once the ESV cache can
be filled. It doesn't verify anything. It **sorts** records into "probably
fine" and "look at this", so human time goes where it's needed.

1. **Is the name in the verse?** For each record × each cited verse, does the
   ESV text contain the name (or a known alternate spelling)? Misses point to
   a wrong verse, a namesake mix-up, or a KJV/ESV spelling difference. A
   spelling difference is useful in itself: it gives the ESV name to display.
2. **Do the relationships appear in the text?** For each `parent-of`, is there
   a verse citing both people with "son of", "daughter of", "fathered", "bore"
   or similar? Same for spouses ("wife", "husband") and tribes. Edges with no
   such verse go to the top of the review queue.
3. **Do participants and places appear in the event's passage?** For each
   participant or location of an event, is it named in the passage?
4. **Is the passage contiguous?** Do an event's refs form a sensible range,
   and is every ref a real verse?
5. **Do the numbers agree?** Recompute what Scripture gives directly (ages at
   fatherhood in Gen 5 and 11, reign lengths and accession synchronisms in
   Kings and Chronicles, 1 Kgs 6:1, Exod 12:40) and compare with the dates and
   durations in the data. Mismatches go in a report, either an error or an
   undocumented chronology choice.
6. **Structural checks.** Extend `check:data`: siblings share a parent,
   half-siblings share exactly one, a symmetric edge has no contradicting
   directional edge, no one is their own ancestor, and every event has at
   least one participant (13 currently don't).

**Output:** `audit/scan-report.md` (committed, refs only, no ESV text) with a
per-record score that orders the human review queues.

---

## 6. Phases 3 and 4: claim-by-claim review

The same process for both phases. Only the queue differs.

- **Phase 3, published and editorial records first:** the 286 published people,
  450 events, 23 groups, every period and kingdom, then places, in order of
  prominence (verse count, presence on the timeline or map). The editorial
  layers come first of all, since they're ours.
- **Phase 4, the 2,781 drafts:** batched by **where they appear in
  Scripture**, not alphabetically, so one batch is one stretch of text read
  once: the Genesis genealogies, the tribal lists in Numbers, 1 Chronicles 1–9
  (a large share of the drafts), the Ezra and Nehemiah lists, the Gospels,
  Acts, and so on. Identity questions (which Zechariah is this?) are easiest
  to settle with the whole passage in front of you.

**Each batch:**

1. Fetch the ESV text for the batch's passages into the local cache.
2. A Claude agent reads the passage alongside every claim in the batch and
   drafts verification rows: verdict, refs, basis, and a one-line quote or
   reason. It may only cite verses that are in the fetched text, so it can't
   cite from memory.
3. A second agent independently re-checks every `confirmed` row against the
   text and every non-confirmed row against the first agent's reasoning.
   Disagreements go to you.
4. **You review**: all `corrected`, `unsupported`, and `disputed` rows, plus a
   random sample of `confirmed` rows (say 10%, more if the sample turns up
   errors). Your sign-off is what's recorded under `checked.by`.
5. Corrections go into `data/overrides/` (with an edge tombstone if needed).
   Wrong data that comes from upstream gets reported to Theographic.
6. One PR per batch, so each is a reviewable diff of claims and fixes.

Order of work, with a rough size for each:

| Step | Scope | Rough size |
|---|---|---|
| 1 | Phase 1 processing audit + faithfulness tests | 1–2 sessions |
| 2 | Claims layer: schema, `check:data` rules, ESV fetch/cache tooling | 1–2 sessions |
| 3 | Phase 2 scanner + first report | 1–2 sessions |
| 4 | UI: Scripture-first citations (see §7), so verified data shows as soon as it exists | 1–2 sessions |
| 5 | Editorial layers (periods, kingdoms) | 1–2 batches |
| 6 | Published people + events, by era | ~10–15 batches |
| 7 | Places | ~8–10 batches |
| 8 | Drafts, by passage | ~30–40 batches |
| ongoing | Upstream correction issues (§8), one per reviewed batch | — |

---

## 7. Pointing back to the Bible in the app

What a record page should show once the claims exist:

- **Every fact carries its verse.** "Father: Abraham *Gen 21:3*". "Reigned
  seven days *1 Kgs 16:15*". Each reference opens the passage on esv.org (or
  an inline popover with the text, depending on the decision below).
- **Each fact's basis is visible.** Stated facts look plain. Derived ones
  ("c. 1006 BC") get a small marker that expands to the working ("David was
  30 when he began to reign, 2 Sam 5:4; reckoned from 1 Kgs 6:1…") and names
  the chronology. Extra-biblical facts (coordinates, Easton's prose) are
  labeled with their source.
- **"In Scripture"** is split into *key passages* (the proof texts behind the
  claims) and *all mentions* (today's list).
- **Verification badge** instead of "draft": *Verified against the ESV ·
  Nov 2026*, *Partly verified*, or *Not yet reviewed*. The existing "Show
  draft records" setting becomes "Show unreviewed records".
- **Source note:** "Scripture: ESV (references). Data: Theographic (CC-BY-SA).
  Description: Easton's Bible Dictionary, 1897."

---

## 8. Sending corrections back to Theographic

Our verification records and process are for us. What helps upstream is the
**errors we find**, sent in a form a maintainer can check quickly and approve
by hand. Theographic is an Airtable base exported to GitHub, so a PR against
their JSON probably isn't what they want: a fix there would be overwritten by
the next export. Expect issues, not PRs, but confirm first (step 1).

1. **Learn how they take corrections** before sending anything: read their
   README/CONTRIBUTING and recent issues, and see whether and how quickly
   corrections get merged. If there's no clear route, open one issue asking
   how they'd like corrections, with one or two examples.
2. **Log corrections as we go.** Each `corrected` or `unsupported` claim that
   comes from upstream data (not our code or editorial layers) is tagged
   `upstream: "pending"` with the upstream record (their `personLookup` or
   Airtable id, which the vendor snapshot still has), the field, the current
   value, the proposed value, and the ESV ref.
   `npm run audit:upstream` turns the pending ones into a report.
3. **Only send what you've personally approved.** No unreviewed agent output
   goes upstream. Each issue covers one passage-sized batch (e.g. "Corrections
   to 1 Chronicles 4 genealogies"): a short table of record, field, current,
   proposed, and verse, plus a one-line reason each. The verse quotes come
   from the ESV, and since Theographic is KJV-based we also note the KJV
   wording where it differs, so they can check it in their own text.
   Disputed or interpretive items (which Zechariah is this?) are marked as
   such, or held back. Don't send "Scripture says X", only "here's the verse,
   here's what we think".
4. **Track them.** Each correction moves through `pending` → `reported`
   (issue link) → `fixed-upstream`, `declined`, or `local-only`. Each override
   stays until the fix arrives in a re-import.
5. **Close the loop on re-import.** `check:data` warns when an override now
   matches seed (the fix landed upstream, so the override can go) and when a
   re-import changes a verified fact (the claim goes stale and gets
   re-checked).

Batched issues keep the volume manageable for a single maintainer. If they
turn out not to want them, the log still documents every place our data
departs from theirs, and why. That's worth having for the CC-BY-SA
attribution anyway.

---

## 9. Decisions needed before starting

1. **ESV access.** Get a free API key at api.esv.org and allow `api.esv.org`
   in this environment's network settings, or run the fetch step on your own
   machine?
2. **Inline verse text in the app.** Links to esv.org only (simplest, no
   licensing questions), ESV via the API with attribution, or a
   public-domain translation shipped with the site?
3. **Display names.** Switch names to ESV spelling where it differs (keeping
   the KJV form as an alternate name for search)?
4. **Review depth.** Is a 10% spot-check of agent-`confirmed` claims enough,
   or do you want to read every claim for the published set?
5. **Dates.** Keep Theographic's single chronology for now and label it
   *derived* with the chain of verses, or settle the chronology question
   (e.g. Thiele for the kings) as part of this audit?
6. **Upstream.** OK to open issues on Theographic under your account once
   you've approved a batch, starting with one asking how they'd like
   corrections sent?
