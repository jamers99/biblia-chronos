<script lang="ts">
  // The History of Israel timeline: an era band, then lanes of events and of
  // people, on one shared time axis. d3-scale does the math, d3-zoom handles
  // wheel/drag/pinch, Svelte renders the SVG. Lanes are re-packed on every
  // zoom, heaviest items first, so zooming in reveals more.
  import { onMount } from "svelte"
  import { scaleLinear } from "d3-scale"
  import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom"
  import { select } from "d3-selection"
  import { packLanes, type TimelineItem, type TimelinePeriod } from "../lib/timeline.ts"
  import { formatYear } from "../lib/format.ts"
  import { entityUrl } from "../lib/url.ts"

  let { items, periods }: { items: TimelineItem[]; periods: TimelinePeriod[] } = $props()

  // Layout constants, in px.
  const AXIS = 26
  const BAND = 30
  const HEADER = 28
  const LANE = 26
  const EVENT_LANES = 7
  const PEOPLE_LANES = 9
  const CHAR = 6.6 // rough width of a 12px label character
  const EVENTS_TOP = AXIS + BAND + HEADER
  const PEOPLE_TOP = EVENTS_TOP + EVENT_LANES * LANE + HEADER
  const HEIGHT = PEOPLE_TOP + PEOPLE_LANES * LANE + 6

  const domain = [periods[0].start, periods[periods.length - 1].end]

  let width = $state(1100)
  let showDrafts = $state(true)
  let transform = $state<ZoomTransform>(zoomIdentity)
  let selected = $state<TimelineItem | TimelinePeriod>()
  let hovered = $state<{ item: TimelineItem; x: number; y: number }>()
  let svg: SVGSVGElement
  let behavior: ZoomBehavior<SVGSVGElement, unknown>

  const base = $derived(scaleLinear().domain(domain).range([0, width]))
  const x = $derived(transform.rescaleX(base))
  const ticks = $derived(x.ticks(Math.max(2, Math.floor(width / 110))).filter(Number.isInteger))
  const shown = $derived(showDrafts ? items : items.filter((i) => !i.draft))

  // An item's footprint: its mark, plus its label, which starts at the mark
  // (or at the left edge, if the mark starts off-screen).
  function extent(i: TimelineItem): [number, number] {
    const left = x(i.start) - 4
    const labelLeft = Math.max(left, 2)
    return [left, Math.max(x(i.end) + 4, labelLeft + i.name.length * CHAR)]
  }

  function lanes(kind: TimelineItem["kind"], maxLanes: number) {
    const [lo, hi] = x.domain()
    const inView = shown.filter((i) => i.kind === kind && i.end >= lo && i.start <= hi)
    return packLanes(inView, (i) => i.weight, extent, maxLanes)
  }
  const eventLanes = $derived(lanes("event", EVENT_LANES))
  const peopleLanes = $derived(lanes("person", PEOPLE_LANES))

  const tickLabel = (year: number) => (year === 0 ? "BC | AD" : formatYear(year))

  onMount(() => {
    behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 400])
      // Sideways wheel (trackpads) pans instead of zooming — handled below.
      .filter((e) => !e.button && (e.type !== "wheel" || Math.abs(e.deltaY) >= Math.abs(e.deltaX)))
      .on("zoom", (e) => (transform = e.transform))
    select(svg).call(behavior)

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      behavior.translateBy(select(svg), -e.deltaX / transform.k, 0)
    }
    svg.addEventListener("wheel", onWheel, { passive: false })
    return () => svg.removeEventListener("wheel", onWheel)
  })

  // Keep zoom bounds in step with the measured width.
  $effect(() => {
    behavior
      ?.extent([
        [0, 0],
        [width, HEIGHT],
      ])
      .translateExtent([
        [0, 0],
        [width, HEIGHT],
      ])
  })

  function zoomTo(start: number, end: number) {
    const pad = Math.max(2, (end - start) * 0.04)
    const k = width / (base(end + pad) - base(start - pad))
    behavior.transform(select(svg), zoomIdentity.scale(k).translate(-base(start - pad), 0))
  }
  const zoomBy = (factor: number) => behavior.scaleBy(select(svg), factor)
  const reset = () => behavior.transform(select(svg), zoomIdentity)

  function onKey(e: KeyboardEvent) {
    const step = width / 8 / transform.k
    if (e.key === "ArrowLeft") behavior.translateBy(select(svg), step, 0)
    else if (e.key === "ArrowRight") behavior.translateBy(select(svg), -step, 0)
    else if (e.key === "+" || e.key === "=") zoomBy(1.6)
    else if (e.key === "-") zoomBy(1 / 1.6)
    else return
    e.preventDefault()
  }

  function pickEra(e: globalThis.Event) {
    const value = (e.currentTarget as HTMLSelectElement).value
    const period = periods.find((p) => p.id === value)
    if (period) {
      zoomTo(period.start, period.end)
      selected = period
    } else reset()
  }

  const isItem = (s: TimelineItem | TimelinePeriod | undefined): s is TimelineItem => !!s && "kind" in s
</script>

<div class="timeline">
  <div class="controls">
    <label>
      <span class="sr-only">Jump to era</span>
      <select onchange={pickEra}>
        <option value="">All eras</option>
        {#each periods as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    </label>
    <div class="buttons" role="group" aria-label="Zoom">
      <button type="button" onclick={() => zoomBy(1 / 1.6)} aria-label="Zoom out">−</button>
      <button type="button" onclick={() => zoomBy(1.6)} aria-label="Zoom in">+</button>
      <button type="button" onclick={reset}>Reset</button>
    </div>
    <label class="toggle">
      <input type="checkbox" bind:checked={showDrafts} />
      Show draft records
    </label>
    <ul class="legend" aria-label="Legend">
      <li><svg width="14" height="10" aria-hidden="true"><circle cx="7" cy="5" r="4" class="event" /></svg>Event</li>
      <li><svg width="22" height="10" aria-hidden="true"><rect y="2" width="22" height="6" rx="3" class="person" /></svg>Lifetime</li>
      <li>
        <svg width="22" height="10" aria-hidden="true"><rect y="2" width="22" height="6" rx="3" class="person attested" /></svg>Attested
        years
      </li>
    </ul>
  </div>

  <div class="frame" bind:clientWidth={width}>
    <svg
      bind:this={svg}
      viewBox="0 0 {width} {HEIGHT}"
      height={HEIGHT}
      role="application"
      aria-label="Timeline from Abraham to the early church. Arrow keys pan, plus and minus zoom."
      tabindex="0"
      onkeydown={onKey}
    >
      <!-- Era shading behind everything, alternating, for orientation -->
      {#each periods as p, n (p.id)}
        <rect
          class="era-wash"
          class:alt={n % 2 === 1}
          x={x(p.start)}
          y={AXIS}
          width={Math.max(0, x(p.end) - x(p.start))}
          height={HEIGHT - AXIS}
        />
      {/each}

      <!-- Axis: year ticks and hairline gridlines -->
      {#each ticks as t (t)}
        <line class="grid" x1={x(t)} x2={x(t)} y1={AXIS - 6} y2={HEIGHT} />
        <text class="tick" x={x(t) + 4} y={AXIS - 10}>{tickLabel(t)}</text>
      {/each}

      <!-- Era band -->
      {#each periods as p, n (p.id)}
        {@const w = x(p.end) - x(p.start)}
        <!-- Pointer shortcut; keyboard users have the era picker above. -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <g
          class="era"
          onclick={() => {
            zoomTo(p.start, p.end)
            selected = p
          }}
        >
          <rect class:alt={n % 2 === 1} x={x(p.start)} y={AXIS} width={Math.max(0, w)} height={BAND - 4} />
          {#if w > p.name.length * CHAR + 12}
            <text x={x(p.start) + w / 2} y={AXIS + 17} text-anchor="middle">{p.name}</text>
          {/if}
        </g>
      {/each}

      <!-- Lane sections -->
      {#each [{ title: "Events", top: EVENTS_TOP, packed: eventLanes }, { title: "People", top: PEOPLE_TOP, packed: peopleLanes }] as section (section.title)}
        <text class="section" x="6" y={section.top - 9}>
          {section.title}
          {#if section.packed.hidden > 0}
            <tspan class="more">· {section.packed.hidden} more, zoom in to see them</tspan>
          {/if}
        </text>
        {#each section.packed.placed as { item, lane, x0, x1 } (item.id)}
          {@const y = section.top + lane * LANE}
          {@const xs = x(item.start)}
          {@const xe = x(item.end)}
          <!-- Pointer layer over the marks; every item also has its own page and index entry. -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <g
            class="item {item.kind}"
            class:draft={item.draft}
            class:selected={selected === item}
            onclick={() => (selected = item)}
            onpointerenter={(e) => (hovered = { item, x: e.offsetX, y })}
            onpointerleave={() => (hovered = undefined)}
          >
            <rect class="hit" x={x0} y={y} width={x1 - x0} height={LANE} />
            {#if item.end > item.start}
              <rect class="mark" class:attested={item.kind === "person" && !item.lifetime} x={xs} y={y + 16} width={Math.max(3, xe - xs)} height="6" rx="3" />
            {:else}
              <circle class="mark" cx={xs} cy={y + 19} r="4" />
            {/if}
            <text x={Math.max(xs - 4, 2)} y={y + 11}>{item.name}</text>
          </g>
        {/each}
      {/each}
    </svg>

    {#if hovered}
      <div class="tooltip" style="left: {hovered.x + 12}px; top: {hovered.y - 6}px">
        <strong>{hovered.item.when}</strong>
        <span>{hovered.item.name}</span>
      </div>
    {/if}
  </div>

  <div class="details" aria-live="polite">
    {#if isItem(selected)}
      <p class="kind">
        {selected.kind === "person" ? (selected.lifetime ? "Person" : "Person · attested years") : "Event"}
        {#if selected.draft}<span class="badge">draft</span>{/if}
      </p>
      <h2>{selected.name}</h2>
      <p class="when">{selected.when}{#if selected.era}{` · ${selected.era}`}{/if}</p>
      {#if selected.summary}<p class="summary">{selected.summary}</p>{/if}
      <a href={entityUrl(selected)}>Open {selected.kind === "person" ? "person" : "event"} →</a>
    {:else if selected}
      <p class="kind">Era</p>
      <h2>{selected.name}</h2>
      <p class="when">{selected.when}</p>
      {#if selected.summary}<p class="summary">{selected.summary}</p>{/if}
    {:else}
      <p class="hint">
        Click a name or an era for details. Scroll or pinch to zoom, drag to pan. Busier names win space when zoomed out,
        so zoom in to see everyone.
      </p>
    {/if}
  </div>
</div>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem 1.25rem;
    margin-bottom: 0.75rem;
    font-size: 0.85rem;
  }
  select,
  button {
    font: inherit;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    padding: 0.3rem 0.6rem;
    cursor: pointer;
  }
  button:hover,
  select:hover {
    background: var(--wash);
  }
  .buttons {
    display: flex;
    gap: 0.3rem;
  }
  .buttons button[aria-label] {
    width: 2rem;
  }
  .legend {
    display: flex;
    gap: 1rem;
    list-style: none;
    margin: 0 0 0 auto;
    padding: 0;
    color: var(--ink-2);
  }
  .legend li {
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .frame {
    position: relative;
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    background: var(--surface);
    overflow: hidden;
  }
  svg {
    display: block;
    width: 100%;
    cursor: grab;
    user-select: none;
    font-family: var(--sans);
  }
  svg:active {
    cursor: grabbing;
  }

  .era-wash {
    fill: transparent;
  }
  .era-wash.alt {
    fill: var(--wash);
    opacity: 0.45;
  }
  .grid {
    stroke: var(--rule);
    stroke-width: 1;
  }
  .tick {
    font-size: 11px;
    fill: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }
  .era {
    cursor: pointer;
  }
  .era rect {
    fill: var(--wash);
    stroke: var(--surface);
    stroke-width: 2;
  }
  .era rect.alt {
    fill: var(--rule);
  }
  .era:hover rect {
    fill: var(--ink-3);
    opacity: 0.35;
  }
  .era text {
    font: 600 12px var(--serif);
    fill: var(--ink);
  }
  .section {
    font: 600 11px var(--sans);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    fill: var(--ink-3);
  }
  .section .more {
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
  }

  .item {
    cursor: pointer;
  }
  .hit {
    fill: transparent;
  }
  .item:hover .hit,
  .item.selected .hit {
    fill: var(--wash);
  }
  .item text {
    font-size: 12px;
    fill: var(--ink);
  }
  .item.draft text {
    fill: var(--ink-2);
  }
  .item.selected text {
    font-weight: 600;
  }
  .mark,
  .legend circle,
  .legend rect {
    stroke: var(--surface);
    stroke-width: 2;
    paint-order: stroke;
  }
  .event .mark,
  .legend .event {
    fill: var(--events);
  }
  .person .mark,
  .legend .person {
    fill: var(--people);
  }
  .person .mark.attested,
  .legend .person.attested {
    fill-opacity: 0.4;
  }

  .tooltip {
    position: absolute;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.35rem 0.55rem;
    font-size: 0.8rem;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
    white-space: nowrap;
  }
  .tooltip span {
    color: var(--ink-2);
  }

  .details {
    min-height: 9rem;
    padding: 1rem 0.25rem;
    max-width: 68ch;
  }
  .details h2 {
    margin: 0 0 0.2rem;
  }
  .details .kind {
    margin: 0 0 0.2rem;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .details .when {
    margin: 0;
    color: var(--ink-2);
    font-variant-numeric: tabular-nums;
  }
  .details .summary {
    font-family: var(--serif);
    font-size: 1.05rem;
  }
  .hint {
    color: var(--ink-3);
    margin: 0;
  }
</style>
