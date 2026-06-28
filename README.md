_Disclaimer: this isn't fully built yet :'( just an idea had that I'd like to work on "soon"..._

# Biblia Chronos

> **Explore the Story of Scripture**

**Biblia Chronos** is an open-source project that helps people explore the Bible through interactive timelines, maps, genealogies, and other visualizations.

The goal is simple: make it easier to see how the people, places, kingdoms, and events of Scripture fit together.

## Features

* Interactive biblical timelines
* Maps
* Genealogies
* Kings and prophets
* Ancient kingdoms and empires
* Biblical journeys
* Scripture references

## First Project

### History of Israel

The first visualization follows the history of Israel from Abraham through the early church.

It includes:

* Patriarchs
* Exodus
* Judges
* United Kingdom
* Divided Kingdom
* Assyrian and Babylonian Exiles
* Return from Exile
* Life of Christ
* Early Church

Explore people, events, kingdoms, and prophets, and see how they connect across biblical history.

## Future Visualizations

* Kings & Prophets
* Genealogy Explorer
* Paul's Missionary Journeys
* Exodus Route
* Life of Christ
* Harmony of the Gospels
* Acts Timeline
* Temple & Tabernacle
* Biblical Nations and Empires

## Principles

* Scripture first
* Historically informed
* Interactive
* Open source

When historical dates or interpretations differ, the project aims to present the evidence clearly and fairly.

## Constraints & Targets

These shape technical decisions.

1. **Desktop-first, mobile-capable** — the primary experience is large screens; mobile must work well but is the secondary target.
2. **Performance is a feature** — fast first paint, minimal JavaScript, visualizations that feel instant.
3. **Simple, well-formed code** — readable over clever, a low barrier for contributors, TypeScript throughout.
4. **Open and static** — fully static output, hostable on GitHub Pages or any simple container. No server, no runtime database, no per-user state at this point.

**Stack:** [Astro](https://astro.build/) (static) + [Svelte](https://svelte.dev/) islands + TypeScript, with [D3](https://d3js.org/) modules and [MapLibre GL](https://maplibre.org/) for visualizations. Curated data lives as human-readable files in git (the source of truth), may be validated and compiled at build time, and ships as small static JSON bundles. Connections are explored as an in-memory graph — no database is shipped to the browser.

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for more details.

## Data & Sources

The data is curated from openly licensed and public-domain sources, and every record carries a citation so readers can see where a date or claim comes from. Genealogies and scripture references are drawn directly from the biblical text. Good starting points include:

* [Theographic Bible Metadata](https://github.com/robertrouse/theographic-bible-metadata) — people, places, events, and their relationships (CC-BY-SA)
* [OpenBible.info](https://www.openbible.info/geo/) and [Pleiades](https://pleiades.stoa.org/) — geocoded biblical and ancient-world places
* [Wikidata](https://www.wikidata.org/) (CC0) for cross-checking, and public-domain Bible dictionaries (ISBE, Easton's) for descriptions
* Scholarly chronologies (e.g. Thiele) for the contested dates, cited per record

Code is MIT; the curated data is licensed separately (likely CC-BY-SA to stay compatible with its sources). Please don't add data from copyrighted, restrictively licensed material.

## Contributing

Contributions are welcome — from biblical research and historical review to design and software development.

## License

MIT
