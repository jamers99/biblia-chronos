# Theographic snapshot

A vendored, pinned copy of the upstream Theographic Bible Metadata `json/` export.
It is the read-only input to the importer (`scripts/import-theographic.ts`);
nothing here is hand-edited.

The pinned commit and the committed-vs-fetched file lists live in `snapshot.json`
(machine-readable, and what `scripts/vendor-fetch.mjs` reads). The two heaviest
files — `verses.json` (needed only at import time, to resolve verse references)
and `easton.json` (unused by the current importer) — are gitignored and fetched
on demand; everything else is committed.

Each file is a JSON array of records shaped `{ id, createdTime, fields: {…} }`,
where `id` is the Airtable record id and the real data lives under `fields`.

To update: re-pull at a newer commit, bump `snapshot.json`, then re-run
`npm run vendor:fetch && npm run import:theographic` so the seed diff is
reviewable.

## Attribution

Source: https://github.com/robertrouse/theographic-bible-metadata by Robert Rouse,
licensed CC-BY-SA-4.0. Biblia Chronos data derived from it is shared under the
same license.
