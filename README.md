# Biblia Chronos

> **Explore the Story of Scripture**

**Biblia Chronos** is an open-source site for exploring the Bible through an interactive timeline, a story map, and a page for every person, place, and event, so you can see how the people, places, kingdoms, and events of Scripture fit together.

## What's here

* **Timeline.** Creation to the early church on one zoomable line: eras, events, and people's lifetimes, with the kings of Israel and Judah drawn by ruling house. Click anyone to see who and what they're connected to; every selection is a shareable link.
* **Story map.** The same history told era by era on a map, with each era's key places, journeys, moments, and people.
* **Kings of Israel and Judah.** Every reign in order of succession, grouped by dynasty, with co-regencies and rival claimants noted.
* **People, places, and events.** A page for each, with family and descendants, related records, and the Scripture behind them. Pages open as a panel over whatever you're looking at.
* **Search.** Everything is searchable from any page.
* **How we know.** Each fact shows the verse that supports it, and how it was checked against the text.
* **Works offline** as an installable app, in light and dark themes.

The eras run from Creation to the Flood, the Flood and the nations, the patriarchs, Israel in Egypt, the Exodus, the judges, the united and divided kingdoms, exile and return, the life of Christ, and the early church.

## Dates

Biblia Chronos is a study aid, not an authority: before citing a date, family link, or location, look it up in Scripture and published scholarship, and cite those. Dates follow a single traditional chronology (close to Ussher's) from the Theographic dataset, and are shown as the source gives them. Before Abraham they come from the ages in Genesis 5 and 11, which other textual traditions give differently. Showing scholarly alternatives side by side, each with its citation, is planned. Ideas and requests are welcome: [open an issue](https://github.com/jamers99/biblia-chronos/issues).

## Data & sources

Every record carries a citation. The starting point is [Theographic Bible Metadata](https://github.com/robertrouse/theographic-bible-metadata) (people, places, events, and their relationships), with hand-authored eras, kingdoms, and corrections in `data/overrides/`. Place coordinates come through Theographic from [OpenBible.info](https://www.openbible.info/geo/) and other geocoding.

Code is MIT; the data in `data/` is CC BY-SA 4.0, as it derives from Theographic (see [data/LICENSE.md](./data/LICENSE.md)). Please don't add data from copyrighted or restrictively licensed material.

## Development

A static site: [Astro](https://astro.build/) + [Svelte](https://svelte.dev/) islands + TypeScript, with D3 for the math and a stylized SVG map. No server and no runtime database. See [ARCHITECTURE.md](./ARCHITECTURE.md) for how it fits together.

```sh
npm ci
npm run dev          # local site at http://localhost:4321/
npm test             # unit tests for the pure logic in src/lib
npm run check        # type-check (astro check)
npm run check:data   # validate data/seed + data/overrides
npm run build        # check:data, then the static site into dist/
```

Re-importing the source data is a separate, deliberate step (see [docs/data-pipeline-spec.md](./docs/data-pipeline-spec.md)): `npm run vendor:fetch && npm run import:theographic`. How facts are checked against Scripture is in [docs/data-audit-plan.md](./docs/data-audit-plan.md).

## Contributing

Contributions are welcome, from fixing a date or a family link to design and code. Data fixes go in `data/overrides/` (see its [README](./data/overrides/README.md)).

## License

Code: MIT. Data: CC BY-SA 4.0.
