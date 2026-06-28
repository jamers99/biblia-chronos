# Overrides

Hand-authored corrections and additions, layered on top of `data/seed/` at build
time. **The importer never touches this directory** — this is where human fixes
live so a re-import can't clobber them.

## How it works

One file per entity type, mirroring the seed: `people.json`, `places.json`,
`events.json`, `peopleGroups.json`, `books.json`, `edges.json`. All are optional —
create only the ones you need.

- **Entities** are matched by `id`. A matching override's fields are overlaid
  onto the seed record (shallow, per top-level field), so you can correct just
  one field. An override with a new `id` adds a whole new record.
- **Edges** are matched by `from|to|type`. An override adds a new edge or corrects
  an existing one. (Deleting a seed edge isn't supported yet.)

Because the merge is shallow, overriding a nested object replaces the whole
object. To change one sub-field, include the others you want to keep.

## Example

`places.json` — fill in a modern name the import leaves empty:

```json
[
  { "id": "babylon_1", "modernName": "Hillah, Iraq" }
]
```

`people.json` — cite a specific scholar's date with a display string:

```json
[
  { "id": "solomon_2755", "birth": { "earliest": -1010, "latest": -1010, "display": "c. 1010 BC", "chronology": "thiele" } }
]
```

## Validation

The merged result (seed + overrides) is validated against the Zod schemas and
integrity-checked by `npm run check:data`, which runs as the first step of
`npm run build`. A bad override fails the build rather than reaching the browser.
