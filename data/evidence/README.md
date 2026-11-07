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
| **Editor** | the same file, with `editor` set | a person, in the PR |

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
    interpretation, so a note is required), or `wrong` (an error, fixed in
    `data/overrides/`).
- **`editor`**: set when a person reviews the batch.
  - The editor reads every written entry, and spot-checks `agreed` at the
    `sampled` rate.
  - The site shows "read by an editor" only for what was read. An agreed fact
    shows "batch spot-checked".
  - To record a partial review, list the keys that were read in `editor.read`.

`npm run check:data` warns when a review points at a fact that's gone or has
changed since it was reviewed, and fails on a malformed file, an unknown book or
chapter, or a fact reviewed in two batches.

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
3. Missing facts it finds (a marriage, someone at an event) go into
   `data/overrides/`, then back through steps 1–2.
4. An editor reviews the PR and sets `editor`.
