# Architecture

This is the technical plan for Biblia Chronos and the reasoning behind it, so contributors start from the same place. Most of it isn't built yet; it's what we're building toward. If you want to change a decision, open an issue that takes the reasoning here into account.

## Constraints

Four things shape the decisions below. When a trade-off isn't obvious, favor the one higher in this list:

1. Desktop-first, mobile-capable. The main experience is large screens with dense visualizations. Mobile should work and feel good, but it's secondary.
2. Fast. Quick to load, light on JavaScript, visualizations that feel responsive.
3. Simple. Readable code, easy to understand and maintain.
4. Static. No server, no runtime database, no per-user state. The whole site is files you can host on GitHub Pages or any container.

## The shape of the project

Biblia Chronos is a read-only reference site. There are no accounts and nothing to save; the same curated data ships to everyone. That's what lets it stay static and fast.

## Stack

- Astro for the site. It ships no JavaScript by default and only hydrates the interactive pieces (a timeline, a map), which keeps pages light. Static output drops straight onto GitHub Pages.
- Svelte for those interactive pieces. Small, little boilerplate, easy to read.
- TypeScript everywhere.
- D3 modules (`d3-scale`, `d3-time`, `d3-hierarchy`, `d3-geo`) for the math behind charts and layouts, with Svelte rendering the SVG. This avoids D3's more awkward DOM API.
- MapLibre GL for real maps, or plain SVG/GeoJSON for stylized kingdom borders.
- Tailwind, or plain CSS with design tokens, for styling.
- Zod for validating data and generating its TypeScript types.

We considered SvelteKit as a single framework for everything but chose Astro because the site is mostly static content with a few rich widgets, which is what Astro is best at.

## Data

The data is the heart of the project, and it lives as human-readable files (YAML/JSON) in git. That's deliberate: contributors add a king, fix a date, or attach a source through normal pull requests, and those changes diff and review cleanly. A binary database file wouldn't.

At build time we validate the files with Zod, run integrity checks (every reference points to a real record, no orphans, citations present, dates that make sense), and compile everything into small JSON bundles, one per visualization. The site loads each bundle only when it's needed.

So there's no database in the browser. Shipping SQLite to the client would mean a large WebAssembly download just to query a few thousand records, with no real benefit over plain JSON.

### Exploring connections

"How do these people, places, and events connect?" is a graph question, and graphs are easy to handle in memory at this size. Each record has a stable id, and relationships are edges like `{ from, to, type }`, where type is something like `parent-of`, `reigned-over`, or `traveled-to`. At runtime we build an index once and walk the graph for things like a person's ancestors, everyone alive in a given period, or the path between two people. The [graphology](https://graphology.github.io/) library gives us traversal and shortest-path for free if we want them.

If the integrity checks ever outgrow simple scripts, SQLite is a fine tool to run them at build time. It just never ships to the browser.

### Dates and modeling

Biblical chronology is contested, and we want to present the evidence fairly, so a date is a range with a citation rather than a single number, optionally tagged with the chronology it comes from (for example Thiele or Albright). The core records are Person, Event, Place, Kingdom or Empire, Period, ScriptureRef, and the relationships that connect them.

## Rust and WebAssembly

I considered using Rust and WebAssembly as I'd love to dig into that personally more, but WebAssembly isn't ready for gui stuff yet, so we're sticking with TypeScript. The visualizations are DOM- and SVG-heavy, and JavaScript is the best at that for now, plus keeping one language keeps the bar low for contributors. If a specific calculation ever turns out to be slow (a large genealogy layout, say), we can move just that piece into a WebAssembly module behind a plain function call. That's the only place Rust would earn its keep at runtime, and only once a profiler points at it.

## What "fast" means

Concretely: on a desktop everything should feel smooth and immediate, with no visible lag while panning a map or scrubbing a timeline. On an older phone a little slowdown is acceptable as long as the site stays usable. It's okay if side load is a little slower at first, as long as the site feels light once it's loaded.
