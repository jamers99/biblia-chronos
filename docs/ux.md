# UX decisions

A living record of **landed** design decisions for Biblia Chronos visualizations,
plus the open questions still in front of us. The first visualization driving
this doc is the **Kings timeline (David → exile)**. When a decision changes, edit
it here and say why — this is the source of truth for "why does it look like this."

Principles inherited from [README](../README.md) / [ARCHITECTURE](../ARCHITECTURE.md):
scripture first, historically informed, desktop-first, fast, present contested
evidence fairly.

---

## Kings timeline (David → exile)

**The model:** a **relationship map on a time axis**. Each king and prophet is a
pill placed by date; pills connect by succession and prophet-to-king links. Time
is horizontal and zoomable; the two kingdoms pull *apart* vertically (north up,
south down) rather than sitting in fixed rows. The point of the view is the
**connections**, so the layout is a graph, not a grid. (Earlier vertical-column
and fixed-lane mockups are superseded.)

### What the data forces on us (a constraint, not a decision)

The Theographic seed gives us the **people** (David, Solomon, every king and
prophet, with canonical ids and scripture refs) but **no reign dates and no
Judah/Israel classification**, and most monarchs are `status: "draft"`. So this
visualization is fundamentally a **curation project**: reign start/end, kingdom,
dynasty, capital, co-regency, and the narrator's evaluation are **hand-authored
in `data/overrides/`** against a scholarly chronology — what the data spec
reserves for "Periods & Kingdoms." The seed supplies identity and scripture
links; we supply the chronology. This is the bulk of the work.

### Landed decisions

| # | Decision | Why |
|---|---|---|
| K1 | **Relationship map on a horizontal time axis — not fixed lanes.** Entities are nodes positioned by date (x = time); vertical position comes from a one-time force layout with *soft* kingdom gravity (Israel drifts up, Judah down, prophets between). Related people cluster; connections read as a web. | The project is about how people connect; rigid lanes hide that and over-constrain the layout. A time axis + graph is the surface that scales to all of scripture. |
| K2 | **The two kingdoms end at different times, and we show it.** Israel stops at 722 BC (fall of Samaria); Judah continues alone to 586 BC (fall of Jerusalem). The gap is left visible. | The asymmetry *is* the history — the north going silent while the south continues is the central teaching moment. |
| K3 | **Color = kingdom; the succession *chain* tells the continuity-vs-fracture story.** Judah = one unbroken blue Davidic line of successions; Israel = amber, its chain repeatedly broken across nine dynasties/coups; united = neutral before the 931 split. | Two meaningful ramps + neutral (design system's ≤2–3 rule). Color plus link structure carry the argument: one faithful line vs a revolving door. |
| K4 | **Pill length = reign duration.** Manasseh's 55 years is a long pill; a two-year king is nearly a dot. | Honest magnitude encoding; makes instability legible at a glance. (See U8.) |
| K5 | **Anchor events are vertical rules across the field:** 931 divides, 722 Samaria falls, 586 Jerusalem falls. The two falls get a restrained coral accent; the schism a neutral rule. | These are the scaffolding everything hangs on; they belong to the whole field at once. |
| K6 | **Prophets are nodes linked to the kings they confronted** (`prophesied-under`, dashed connectors: Elijah→Ahab, Isaiah→Hezekiah, Jeremiah→Josiah/Zedekiah). | These cross-links are the map's connective tissue between the political timeline and the text — showing *when* and *against whom* is the point. |
| K7 | **Empires are quiet context** (Assyria, then Babylon). | Answers "why the exiles?" without competing with the kings for attention. |
| K8 | **Chronology spine = Thiele**, every reign date cited, dates rendered as ranges (`DateEstimate`). Co-regencies are honest overlaps, not hidden. | Thiele is the standard reconciliation of the regnal synchronisms; per-record citations keep us honest where dates are contested. |
| K9 | **Aesthetic: scholarly synoptic chart, not a generic dashboard.** Restrained ink-on-surface, tabular numerals, hairline rules, density as a feature. No gradients, card-grids, or hero sections. | "Historically informed" should *feel* like a serious reference work, not an AI app. |
| K10 | **Reign is a separate `Reign` record**, not fields on `Person` — links a person to a kingdom with start/end, dynasty, capital, co-regency flag. | Keeps `Person` clean; a person can reign twice, co-regencies overlap, and someone can appear in united vs divided phases. |
| K11 | **The narrator's verdict ships in v1, always cited** — "did evil / did right in the eyes of the LORD," each with its scripture reference. | Faithful to the Kings/Chronicles text and distinctive; the citation keeps it as *the text's* verdict, not ours. (Rendering in the web view TBD.) |
| K12 | **v1 scope = all ~40 kings of both kingdoms + the major prophets.** Empires follow as a v1.1 context band. | The full king list is the backbone; prophets are core connective tissue; empires are context that can land just after. |
| K13 | **Dates are modeled chronology-ready; the toggle comes later.** Thiele is the v1 spine; the schema lets other chronologies attach (`DateEstimate.chronology`), but the UI ships single-chronology. | Avoids a later data-model migration without spending v1 effort on a toggle few will use yet. |
| K14 | **Pan/zoom with a stable layout.** Drag to pan, scroll/pinch to zoom time (mobile pinch included). The vertical layout is computed once and frozen — separation is judged by overlapping *years*, not pixels — so zoom only moves things horizontally and nothing reflows. Detail (labels, then dates/refs) reveals as you zoom in. | The dataset is too long and dense for one scale; zoom lets one surface serve both "the whole sweep" and "this decade" without the layout churning underfoot. |
| K15 | **Tap a node to focus its connections.** Its neighbors and the links between them highlight; everything else dims. Tap the background to clear. | This is how the map stays legible at scale — you explore outward from a selection instead of reading every edge at once. |

### Encoding reference (current mockup)

- Pill = a person; **length = reign span** on the time axis.
- Color = kingdom: blue Judah, amber Israel, purple united, gray prophet.
- Solid link = succession (with the fork at Solomon → Rehoboam & Jeroboam I);
  dashed link = prophesied-under.
- Vertical position = force layout with soft kingdom gravity (not a fixed lane).
- Coral vertical rule = a fall (722, 586); neutral rule = the 931 schism.

### Interaction model

- **Select a node** → focus its connections (K15), and (to build) open a detail
  panel: reign range + chronology citation, dynasty, capital, the scripture
  passages (Kings/Chronicles), and the evaluation with its reference.
- **Pan/zoom** is the primary navigation; the layout stays put under zoom (K14).
- **Hover** → lightweight readout (name, years, kingdom, verdict).

### Resolved

- **U1 scope** → all ~40 kings + major prophets; empires follow (K12).
- **U2 evaluation** → keep, always cited (K11).
- **U3 chronologies** → schema-ready, toggle later (K13).
- **U4 layout** → horizontal **relationship map** with soft kingdom gravity, not
  columns or fixed lanes (K1). Reversed twice from the original vertical idea.

### Open questions

| # | Question | Leaning |
|---|---|---|
| U5 | **Saul.** Include the pre-David united monarchy, or truly start at David? | Start at David per the brief; Saul an optional lead-in. |
| U6 | **Co-regency display.** Overlapping reigns are shown honestly — but as overlapping pills, a brace, or a lighter "co-regent" segment? | Decide during build, with real Thiele overlaps in front of us. |
| U7 | **Reign date sourcing.** Hand-author all reign dates from Thiele, or find an openly-licensed Thiele-aligned dataset to seed `data/overrides/`? | Check for a CC/PD source first; hand-author the rest. |
| U8 | **Pill = reign or lifespan?** Reign span only, or the whole lifespan with the reign as a darker inner segment? | Start reign-only (K4); consider life-with-reign-inside once it earns its complexity. |
| U9 | **Default density.** Show the whole web at once, or open calm and reveal connections on tap/zoom to avoid a hairball at full scale? | Focus-first: calm overview, connections on demand (K15). |

### Schema / data implications (feeds the next data task)

Needed in `data/overrides/` + a schema extension; not yet built:

- A new **`Reign`** record (K10): `person` (id), `kingdom`
  (`judah` | `israel` | `united`), `start` / `end` as `DateEstimate`s,
  `dynasty`, `capital`, `coregency` flag, and an `evaluation`
  (`did-right` | `did-evil` | `mixed`) with a scripture reference (K11).
- **Prophet active range** + the king(s) confronted, via a `prophesied-under` edge.
- New edge types to consider: `succeeded-by`, `prophesied-under`,
  `reigned-over` (reign → kingdom/place).
- Anchor **events** (schism, the two falls) as `Event`s with dates; empires as a
  hand-authored `Kingdom`/period overlay (the v1.1 context).
- Dates stay chronology-ready (K13): reign `DateEstimate`s carry `chronology` and
  a per-record `source`, all pointing at a `thiele` source for v1.

Next data task: add the `Reign` schema + edge types, seed Thiele reign data into
`data/overrides/`, and extend `check:data` to validate reigns (kingdom set,
ordered dates, evaluation cited, person resolves).
