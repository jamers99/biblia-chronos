# Evidence

How each fact the site shows is known to be in Scripture. See
[docs/data-audit-plan.md](../../docs/data-audit-plan.md) for the reasoning.
Each fact is keyed `id@hash` (see `src/lib/evidence.ts`): the id says what's
claimed (`parent-of:abraham_58>isaac_616`), and the hash covers the data it
shows, so a review goes stale when the data changes underneath it.

There are three layers, and the site shows each one separately:

| Layer | Where | Written by |
|---|---|---|
| **Text match** | `matches.json` | `npm run audit:scan`. Never hand-edit it |
| **AI** | `<batch>.json`, with `ai` set | an AI reviewer, from `npm run audit:batch` |
| **Editor** | `../reviews.json`, one verdict per fact (or a batch's `editor`) | a person, in the app's review mode |

## matches.json

The scan searches the King James text of every verse (Theographic's
`verses.json`, fetched by `npm run vendor:fetch`) for a verse that states each
fact. It matches the shape of a statement ("Isaac, Abraham's son", "Abraham
begat Isaac"), not just two names near each other. It can't tell namesakes
apart: a match shows that the text supports the fact, not that the verse is
about this person. Each line holds one of three things:

- `[verse, rule]`: the verse that matched, and the rule that matched it
- `[null, rule]`: a fact worked out from other data, e.g. a tribe from recorded parents
- `[]`: no match

The scan runs after every import, and by hand after editing `data/overrides/`.
CI (`.github/workflows/audit.yml`) fails a data PR if the file is out of date.

## Batch files

Each batch file covers one stretch of Scripture: one AI run and one review
sitting. A fact lives in exactly one batch.

```jsonc
{
  "passage": "esth.1-10",
  "ai": { "model": "haiku", "on": "2026-11-07" },
  "editor": { "by": "jamers99", "on": "2026-11-12", "sampled": 0.1 },
  "agreed": ["participated-in:esther_1343>esther-becomes-queen@19f225"],
  "facts": {
    "date:esther-becomes-queen@20cdc1": {
      "refs": ["esth.2.16"],
      "note": "Tenth month, seventh year of Ahasuerus. The BC year depends on dating his reign outside Scripture.",
      "kind": "reading"
    }
  }
}
```

- **`agreed`**: the AI agrees with the text match's verse. That's one line, nothing else.
- **`facts`**: written entries.
  - `refs`: the verses.
  - `sources`: keys into `sources.json`, for anything from outside Scripture.
  - `note`: a short explanation.
  - `kind`: `verse` (the default: the text says it), `reading` (an
    interpretation, so a note is required), `wrong` (an error, fixed in
    `data/overrides/`), or `unsupported` (no verse found for it). An
    unsupported fact stays in the data, and the site marks it "no verse
    found".
  - `severity`: required on `wrong` and `unsupported`, and only there: `high`,
    `medium`, or `low`, by how much it matters to a reader if the data stays as
    it is (the scale is in `docs/audit-review-prompt.md`). The review queue
    puts the most severe first.
- **`editor`**: set when a person reviews the batch.
  - The editor reads every written entry, and spot-checks `agreed` at the
    `sampled` rate.
  - The site shows "read by an editor" only for what was read. An agreed fact
    shows "batch spot-checked".
  - To record a partial review, list the keys that were read in `editor.read`.

`npm run check:data` warns when a review points at a fact that's gone or has
changed since it was reviewed, and fails on a malformed file, an unknown book or
chapter, or a fact reviewed in two batches.

## reviews.json: editors' verdicts

`data/reviews.json` holds a person's verdict on single facts, keyed `id@hash`
like everything here, one per line:

```jsonc
{
  "parent-of:abihail_32>heber_1428@3f9a1c": {"verdict":"wrong","by":"jamers99","on":"2026-11-12","issue":42,"note":"1 Chr 5:13 calls Heber one of their brethren","refs":["1chr.5.13"],"upstream":"https://github.com/robertrouse/theographic-bible-metadata/issues/95"}
}
```

- **`verdict`**: is the fact right as the site shows it? `right`, `wrong`, or
  `unsure`. It wins over the AI's: `right` turns a flag (or "no verse found")
  into "confirmed", and `wrong` marks the fact wrong. `unsure` changes nothing
  but is recorded.
- **`note`** and **`refs`**: the editor's reasoning, and the verses it cites.
  `review:apply` reads `refs` from the note ("1 Chr 5:13"), so citing a verse
  in the note is all it takes. The site shows them in place of the AI's.
- **`upstream`**: on a `wrong` verdict, the Theographic issue it was reported
  in (or its ledger id, `DQ-0072`). The data is Theographic's, so a wrong fact
  is fixed there: review mode's "Report to Theographic" link, in the fact's
  How we know, opens their data-correction form filled in, and
  `review:apply`'s summary lists one per verdict. Once it's sent, add the
  issue's URL here by hand. `check:data` lists wrong verdicts not yet
  reported. When their export fixes it, the data changes and the verdict
  goes stale.
- **`by`**: the GitHub account that submitted it. **`issue`**: where.
- A fact has one verdict. A new one replaces the old.

Nobody edits it by hand. Verdicts come from **review mode** in the app (menu →
Review mode, or open `/review/`). The queue there lists what needs a person,
most severe first, and filters by status, severity, kind of fact, book, or a
search, grouped by severity, kind, book, or the person, place or event it's
about; the filters stay in the link, so a view can be shared. A reviewer marks
facts Right, Wrong, or Not
sure, with an optional note, and the app keeps them in the browser until they're
submitted together as a pre-filled GitHub issue (label `review`). A submission
must fit in one link, so the app stops taking verdicts at about 100 (about 50 with notes) and asks for
a submit first.

To apply a submission:

- **The workflow:** add the `apply` label to the issue (only the repository
  owner's label counts). `.github/workflows/review-apply.yml` runs the script
  below and opens a pull request, or says on the issue why nothing applied.
- **By hand, or by an agent:** save the issue's body to a file and run
  `npm run review:apply -- --by <login> --on <date> --issue <n> --body-file body.md`.

The script only reads the issue's ```` ```review ```` block. A verdict on a fact
whose data has changed since, or that's gone, is skipped and listed, never
moved onto data the reviewer didn't see.

Plain-text reports (a "Report a problem" link on every fact and page, label
`report`) aren't parsed: someone reads them and makes the change.

## When the data changes

A review is tied to the data it saw. Each key's hash covers what the fact
shows: a date's numbers, a note's text, a link's two ends. When a re-import or
an override changes that data, the hash changes and the old review no longer
matches. Then:

- **The site** stops showing that AI or editor mark. The fact goes back to
  whatever still applies (usually the text match, re-run with the change).
- **`npm run check:data`** warns about each one: "the data changed since it
  was reviewed (now …)", or "no such fact any more" if the link or record is
  gone (removed or renamed upstream; the importer lists renamed ids).
- **`npm run audit:batch -- <name> --stale`** lists that batch's stale reviews
  with their old verdicts and verses. Re-check each one, then swap the old key
  for the new one in the file.

## When an editor and the AI disagree

A fact an editor has settled (a `right` or `wrong` verdict on its current key)
is left out of every batch, so a later AI run can't flag it again. Where the
editor's verdict goes against the AI's (`right` on a flag, `wrong` on a fact
the AI passed), `npm run audit:batch -- <name> --disputed` gives the AI the
facts again with the editor's note and verses. It re-reads the text and
corrects its own entry, or says in its note why it stands by it; it writes
`audit/batches/<name>.json`, and `npm run audit:merge -- <name>` puts each
verdict back in its home batch. The AI's line on the page is always its own
words, and the editor's verdict still wins.

Only the fact's own data counts. Editing an event's description doesn't make
its date review stale, and neither does a new verse elsewhere about the
person.

## Reviewing a batch

1. Run `npm run audit:batch -- <name> <passage>` (e.g. `esther esth.1-10`). It
   writes `audit/batches/<name>.md`: every fact that lives in the passage, with
   what the text match found, and the passage's KJV text.
2. An AI reviewer works from that file and writes `data/evidence/<name>.json`.
   It may only cite verses whose text it has actually read: those in the file,
   or any it looks up with `npm run verse -- <keys>` (e.g. `2kgs.25.8-10`).
3. Missing facts it finds (a marriage, someone at an event) are usually in
   the data already, filed in another batch. Check, then report the rest to
   Theographic; add one to `data/overrides/` only as a stopgap.
4. An editor reviews the PR. Verdicts on single facts come in through review
   mode (see reviews.json above).
