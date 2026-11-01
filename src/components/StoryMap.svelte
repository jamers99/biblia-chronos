<script lang="ts">
  // The story map: the History of Israel told era by era, on a map. Each
  // chapter flies to its era's places (key places glow and are named first),
  // draws its journey, and lists its key moments and people, which open as
  // panels (see Layers.astro). The overview shows every place, to explore.
  //
  // Places arrive pre-projected (map units); d3-zoom gives a transform, and
  // marks are drawn in screen space so they stay a constant size. The basemap
  // is fetched and inlined so its strokes stay crisp at any zoom.
  import { onMount } from "svelte"
  import { fade, fly } from "svelte/transition"
  import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom"
  import { select } from "d3-selection"
  import "d3-transition"
  import type { MapPlace } from "../lib/map.ts"
  import type { Chapter } from "../lib/story.ts"
  import { entityUrl, setHash } from "../lib/url.ts"
  import { labelWidth } from "../lib/format.ts"
  import { addInertia } from "../lib/inertia.ts"
  import { ms } from "../lib/motion.ts"

  type Box = [number, number, number, number] // x0, y0, x1, y1 in map units
  type Tiered = { place: MapPlace; tier: 0 | 1 | 2 } // key, era, other
  type Point = Tiered & { sx: number; sy: number }

  let {
    places,
    chapters,
    basemap,
    mapWidth,
    mapHeight,
    home,
  }: { places: MapPlace[]; chapters: Chapter[]; basemap: string; mapWidth: number; mapHeight: number; home: Box } =
    $props()

  const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]
  const MAX_LABELS = 60
  const RADIUS = [5.5, 3, 1.8] // by tier

  let width = $state(1200)
  let height = $state(800)
  let at = $state(-1) // the chapter shown; -1 is the overview
  let showDrafts = $state(true)
  let transform = $state<ZoomTransform>(zoomIdentity)
  // Raw, not deeply reactive: these hold places from props, compared by identity.
  let selected = $state.raw<MapPlace>()
  let hovered = $state.raw<Point>()
  let basemapSvg = $state("")
  let svg: SVGSVGElement
  let behavior: ZoomBehavior<SVGSVGElement, unknown>
  let ready = $state(false) // marks wait for the first real view, not the server's

  const byId = $derived(new Map(places.map((p) => [p.id, p])))
  const chapter = $derived<Chapter | undefined>(chapters[at])

  // The panel's size is set here, not in CSS, so framing and labels know what
  // it covers: a column on the left whose last 100px fade into the map, or on
  // phones a sheet over the bottom half.
  const narrow = $derived(width < 760)
  const panelWidth = $derived(Math.min(720, width * 0.52))
  const sheetTop = $derived(height * 0.5)
  // Where the map shows a chapter: beside the panel, or above it.
  const stage = (): Box => (narrow ? [0, 70, width, sheetTop] : [panelWidth - 100, 70, width, height - 30])

  // Every place with its tier: in a chapter, its key places (in the era's
  // order, so they're named first), then its other places, then the rest
  // faintly; in the overview, every place is an era place. Changes with the
  // chapter, not the view.
  const tiered = $derived.by(() => {
    const key = new Set(chapter?.places)
    const keyPlaces = [...key].map((id): Tiered => ({ place: byId.get(id)!, tier: 0 }))
    const rest = places
      .filter((p) => !key.has(p.id) && (showDrafts || !p.draft))
      .map((place): Tiered => ({ place, tier: !chapter || place.eras.includes(chapter.id) ? 1 : 2 }))
    return [...keyPlaces, ...rest]
  })
  // Those in view, in screen space.
  const points = $derived(
    tiered.flatMap((t): Point[] => {
      const [sx, sy] = transform.apply([t.place.x, t.place.y])
      return sx < -10 || sx > width + 10 || sy < -10 || sy > height + 10 ? [] : [{ ...t, sx, sy }]
    }),
  )
  // Drawn faintest first, so key places sit on top.
  const drawn = $derived(points.toSorted((a, b) => b.tier - a.tier))
  const labels = $derived(placeLabels(points.filter((p) => p.tier < 2)))

  // Labels go busiest-first (key places first in a chapter), skipping any that
  // would collide or sit under the chapter panel.
  function placeLabels(pts: Point[]) {
    const [left, , , bottom] = stage()
    const boxes: Box[] = [narrow ? [0, bottom, width, height] : [0, 0, left, height]]
    const out: Point[] = []
    for (const pt of pts) {
      if (out.length >= MAX_LABELS) break
      const w = labelWidth(pt.place.name) * (pt.tier === 0 ? 1.3 : 1)
      const box: Box = [pt.sx + 6, pt.sy - 11, pt.sx + 12 + w, pt.sy + 8]
      if (box[2] > width || boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]))
        continue
      boxes.push(box)
      out.push(pt)
    }
    return out
  }

  const journey = $derived(
    chapter?.journey && {
      name: chapter.journey.name,
      d: chapter.journey.places
        .map((id, i) => {
          const place = byId.get(id)!
          const [x, y] = transform.apply([place.x, place.y])
          return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`
        })
        .join(""),
    },
  )

  function fit([x0, y0, x1, y1]: Box): ZoomTransform {
    const [l, t, r, b] = stage()
    const pad = 40
    const k = Math.min((r - l - pad * 2) / Math.max(x1 - x0, 10), (b - t - pad * 2) / Math.max(y1 - y0, 10), 40)
    return zoomIdentity.translate((l + r) / 2 - (k * (x0 + x1)) / 2, (t + b) / 2 - (k * (y0 + y1)) / 2).scale(k)
  }
  // What a chapter frames: its key places and its journey (the overview, or a
  // chapter without places, frames home).
  function frameOf(c: Chapter | undefined): Box {
    const pts = [...(c?.places ?? []), ...(c?.journey?.places ?? [])].map((id) => byId.get(id)!)
    if (!pts.length) return home
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  }
  const zoomBy = (factor: number) => select(svg).transition().duration(ms(250)).call(behavior.scaleBy, factor)

  // Turn to a chapter (or the overview), fly there, and keep it in the URL.
  function go(i: number) {
    at = Math.max(-1, Math.min(chapters.length - 1, i))
    selected = undefined
    select(svg).transition().duration(ms(1200)).call(behavior.transform, fit(frameOf(chapter)))
    setHash(chapter?.id ?? "")
  }

  onMount(() => {
    fetch(basemap)
      .then((r) => r.text())
      // drop the file's own colors so the page theme applies (see global.css)
      .then((text) => (basemapSvg = text.replace(/<(style)[\s\S]*?\/\1>/, "")))
    behavior = zoom<SVGSVGElement, unknown>().on("zoom", (e) => (transform = e.transform))
    select(svg).call(behavior)
    addInertia(behavior, svg, "xy")

    // #chapter-id opens a chapter; #place-id (from a place's page) shows that place.
    const hash = decodeURIComponent(location.hash.slice(1))
    const place = byId.get(hash)
    at = chapters.findIndex((c) => c.id === hash)
    if (place) selected = place
    behavior.transform(select(svg), fit(place ? [place.x - 30, place.y - 25, place.x + 30, place.y + 25] : frameOf(chapter)))
    ready = true
  })

  // Keep zoom bounds in step with the window: no further out than the whole
  // basemap, no panning off its edges.
  $effect(() => {
    behavior
      ?.extent([
        [0, 0],
        [width, height],
      ])
      .scaleExtent([Math.min(width / mapWidth, height / mapHeight), 60])
      .translateExtent([
        [0, 0],
        [mapWidth, mapHeight],
      ])
  })

  // Hovering and tapping pick the nearest dot within reach, so small dots are
  // still easy to hit. The era's key places win over their neighbours.
  function nearest(e: PointerEvent | MouseEvent) {
    let best: Point | undefined
    let bestScore = Infinity
    for (const pt of points) {
      const d = (pt.sx - e.offsetX) ** 2 + (pt.sy - e.offsetY) ** 2
      const score = pt.tier * 1e6 + d // by tier, then by distance
      if (d < 14 * 14 && score < bestScore) [best, bestScore] = [pt, score]
    }
    return best
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as Element
    if (target instanceof HTMLInputElement) return
    if (e.key === "ArrowRight" || e.key === "PageDown") go(at + 1)
    else if (e.key === "ArrowLeft" || e.key === "PageUp") go(at - 1)
    else if (e.key === "+" || e.key === "=") zoomBy(1.5)
    else if (e.key === "-") zoomBy(1 / 1.5)
    else return
    e.preventDefault()
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="story-map" class:narrow bind:clientWidth={width} bind:clientHeight={height}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <svg
    bind:this={svg}
    viewBox="0 0 {width} {height}"
    role="application"
    aria-label="Map of the places in the story. Left and right arrows turn chapters, plus and minus zoom."
    onpointermove={(e) => (hovered = nearest(e))}
    onpointerleave={() => (hovered = undefined)}
    onclick={(e) => {
      const pt = nearest(e)
      if (!pt) return
      selected = pt.place
      dispatchEvent(new CustomEvent("open-layer", { detail: entityUrl({ kind: "place", id: pt.place.id }) }))
    }}
  >
    <defs>
      <filter id="sm-glow" x="-3" y="-3" width="7" height="7">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      {#if journey}
        <!-- Reveals the journey, drawing it from its start, once per chapter -->
        <mask id="sm-journey" maskUnits="userSpaceOnUse" x="0" y="0" {width} {height}>
          {#key chapter?.id}
            <path class="journey-reveal" d={journey.d} pathLength="1" />
          {/key}
        </mask>
      {/if}
    </defs>
    <rect class="water" {width} {height} />
    <g transform={transform.toString()}>{@html basemapSvg}</g>

    {#if journey}
      <path class="journey" d={journey.d} mask="url(#sm-journey)" />
    {/if}
    {#if ready}
      {#each drawn as { place, sx, sy, tier } (place.id)}
        <circle
          class="dot t{tier}"
          class:draft={place.draft}
          cx={sx}
          cy={sy}
          r={RADIUS[tier]}
          filter={tier === 0 ? "url(#sm-glow)" : undefined}
        />
      {/each}
      {#each labels as { place, sx, sy, tier } (place.id)}
        <text class="label t{tier}" x={sx + (tier === 0 ? 10 : 7)} y={sy + (tier === 0 ? 5 : 4)}>{place.name}</text>
      {/each}
    {/if}
    {#if selected}
      {@const [sx, sy] = transform.apply([selected.x, selected.y])}
      <circle class="ring" cx={sx} cy={sy} r="10" />
    {/if}
  </svg>

  {#if hovered}
    <div class="tooltip" style="left: {hovered.sx + 14}px; top: {hovered.sy + 10}px" in:fade={{ duration: 120 }}>
      <strong>{hovered.place.name}</strong>
      {#if hovered.place.type}<span>{hovered.place.type}</span>{/if}
    </div>
  {/if}

  <!-- The chapter rail: every era, sized by its length in years -->
  <nav class="rail" aria-label="Chapters">
    <button type="button" class="seg all" class:cur={at === -1} onclick={() => go(-1)}>
      <span>All places</span>
    </button>
    {#each chapters as c, i (c.id)}
      <button type="button" class="seg" class:cur={i === at} style="flex-grow: {c.end - c.start}" onclick={() => go(i)}>
        <span>{c.name}</span>
      </button>
    {/each}
  </nav>

  <section
    class="panel"
    style={narrow ? `max-height: ${height - sheetTop}px` : `width: ${panelWidth}px`}
    aria-live="polite"
  >
    {#key at}
      <div class="chapter" in:fly={{ y: 10, duration: ms(350), delay: ms(150) }}>
        {#if chapter}
          <p class="kicker">Chapter {NUMERALS[at]} · {chapter.when}</p>
          <h2>{chapter.name}</h2>
          {#if chapter.lede}<p class="lede">{chapter.lede}</p>{/if}

          {#if chapter.moments.length}
            <h3>Key moments</h3>
            <ul class="moments">
              {#each chapter.moments as m (m.id)}
                <li>
                  <span class="when">{m.when}</span>
                  <a href={entityUrl({ kind: "event", id: m.id })}>{m.name}</a>
                </li>
              {/each}
            </ul>
          {/if}

          {#if chapter.people.length}
            <h3>Who's here</h3>
            <ul class="faces">
              {#each chapter.people as p (p.id)}
                <li>
                  <a href={entityUrl({ kind: "person", id: p.id })}><b aria-hidden="true">{p.name[0]}</b>{p.name}</a>
                </li>
              {/each}
            </ul>
          {/if}

          <p class="legend">
            <span class="swatch glow"></span>Places of this era glow
            {#if journey}<span class="swatch dash"></span>{journey.name}{/if}
          </p>
        {:else}
          <p class="kicker">The story on a map</p>
          <h2>Places of Scripture</h2>
          <p class="lede">
            {places.length.toLocaleString()} places with known locations, from Ur to Rome. Follow the story era by era, or
            explore: scroll to zoom, drag to move, and click any place.
          </p>
          <label class="toggle"><input type="checkbox" bind:checked={showDrafts} /> Show draft records</label>
          <p class="note">Locations come from the source data, and many are uncertain.</p>
        {/if}
      </div>
    {/key}

    <div class="turn">
      {#if at >= 0}
        <button type="button" class="prev" onclick={() => go(at - 1)}>
          ← <span class:sr-only={narrow}>{at === 0 ? "All places" : chapters[at - 1].name}</span>
        </button>
      {/if}
      {#if at < chapters.length - 1}
        <button type="button" class="next" onclick={() => go(at + 1)}>
          {at === -1 ? `Begin: ${chapters[0].name}` : chapters[at + 1].name} →
        </button>
      {/if}
    </div>
  </section>

  <div class="zoom-buttons" role="group" aria-label="Zoom">
    <button type="button" class="icon-button" onclick={() => zoomBy(1 / 1.5)} aria-label="Zoom out">−</button>
    <button type="button" class="icon-button" onclick={() => zoomBy(1.5)} aria-label="Zoom in">+</button>
  </div>
</div>

<style>
  .story-map {
    position: relative;
    height: 100%;
    overflow: hidden;
    user-select: none;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    cursor: grab;
    touch-action: none;
  }
  svg:active {
    cursor: grabbing;
  }
  .water {
    fill: var(--water);
  }

  /* --- Marks --- */
  .dot.t2 {
    fill: var(--ink-3);
    opacity: 0.35;
  }
  .dot.t1 {
    fill: var(--accent);
    opacity: 0.75;
  }
  .dot.t0 {
    fill: var(--accent);
    animation: pop 0.5s cubic-bezier(0.3, 1.6, 0.5, 1) backwards;
  }
  .dot.draft:not(.t0) {
    opacity: 0.5;
  }
  @keyframes pop {
    from {
      r: 0;
    }
  }
  .label {
    font-size: 12px;
    fill: var(--ink);
    stroke: var(--land);
    stroke-width: 3;
    stroke-linejoin: round;
    paint-order: stroke;
    pointer-events: none;
  }
  .label.t0 {
    font: 600 15px var(--serif);
    stroke-width: 4;
  }
  .journey {
    fill: none;
    stroke: var(--gold);
    stroke-width: 2;
    stroke-dasharray: 6 6;
    stroke-linecap: round;
  }
  .journey-reveal {
    fill: none;
    stroke: white;
    stroke-width: 12;
    stroke-dasharray: 1;
    animation: reveal 1.8s ease-in-out 0.8s backwards;
  }
  @keyframes reveal {
    from {
      stroke-dashoffset: 1;
    }
  }
  .ring {
    fill: none;
    stroke: var(--ink);
    stroke-width: 2;
  }

  /* --- The chapter panel, over a wash that fades into the map --- */
  .panel {
    position: absolute;
    inset: 0 auto 0 0;
    display: flex;
    flex-direction: column;
    padding: 6.5rem 7rem 1.75rem 9rem;
    background: linear-gradient(90deg, var(--paper) 72%, transparent);
    overflow-y: auto;
    scrollbar-width: none;
  }
  .chapter {
    flex: 1;
    max-width: 30rem;
  }
  .kicker {
    margin: 0;
    font: 600 0.7rem var(--sans);
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--gold);
  }
  h2 {
    margin: 0.6rem 0 0;
    font: 600 3.2rem/1.02 var(--serif);
    color: var(--ink);
  }
  .lede {
    margin: 1.25rem 0 1.5rem;
    font: 1.1rem/1.6 var(--serif);
    color: var(--ink-2);
  }
  h3 {
    margin: 0 0 0.6rem;
    font: 600 0.68rem var(--sans);
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .moments {
    list-style: none;
    margin: 0 0 1.5rem;
    padding: 0;
    border-left: 1px solid color-mix(in srgb, var(--gold) 40%, transparent);
  }
  .moments li {
    position: relative;
    display: flex;
    gap: 0.75rem;
    padding: 0.28rem 0 0.28rem 1.1rem;
    font-size: 0.95rem;
  }
  .moments li::before {
    content: "";
    position: absolute;
    left: -4px;
    top: 0.75rem;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--events);
  }
  .when {
    flex: none;
    width: 6.5rem;
    color: var(--ink-3);
    font-size: 0.82rem;
    padding-top: 0.1rem;
  }
  .moments a,
  .faces a {
    color: var(--ink);
    text-decoration: none;
  }
  .moments a:hover {
    color: var(--accent);
  }
  .faces {
    list-style: none;
    margin: 0 0 1.25rem;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .faces a {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.8rem 0.25rem 0.25rem;
    border: 1px solid var(--rule);
    border-radius: 999px;
    background: var(--surface);
    font-size: 0.85rem;
    transition: border-color 0.15s;
  }
  .faces a:hover {
    border-color: var(--gold);
  }
  .faces b {
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    background: linear-gradient(135deg, color-mix(in srgb, var(--people) 70%, white), var(--people));
    color: white;
    font: 600 0.75rem var(--serif);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-3);
  }
  .swatch {
    display: inline-block;
  }
  .swatch.glow {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent);
  }
  .swatch.dash {
    width: 22px;
    margin-left: 0.6rem;
    border-top: 2px dashed var(--gold);
  }
  .note {
    font-size: 0.78rem;
    color: var(--ink-3);
  }
  .turn {
    display: flex;
    gap: 0.6rem;
    padding-top: 1.25rem;
  }
  .turn button {
    padding: 0.55rem 1rem;
    border: 1px solid var(--rule);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink-2);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .turn button:hover {
    border-color: var(--gold);
    color: var(--ink);
  }
  .turn .next {
    background: var(--gold);
    border-color: var(--gold);
    color: var(--paper);
    font-weight: 600;
  }
  .turn .next:hover {
    color: var(--paper);
    filter: brightness(1.08);
  }

  /* --- The rail --- */
  .rail {
    position: absolute;
    left: 2.25rem;
    top: 7rem;
    bottom: 6rem;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .seg {
    position: relative;
    flex: 1 1 0;
    min-height: 8px;
    width: 4px;
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: color-mix(in srgb, var(--ink-3) 30%, transparent);
    cursor: pointer;
  }
  .seg.all {
    flex: none;
    height: 4px;
    min-height: 4px;
    margin-bottom: 10px;
  }
  /* a wider target than the bar */
  .seg::before {
    content: "";
    position: absolute;
    inset: -2px -10px;
  }
  .seg span {
    position: absolute;
    left: 14px;
    top: -2px;
    white-space: nowrap;
    font-size: 0.68rem;
    color: var(--ink-3);
    opacity: 0;
    transition: opacity 0.15s;
    pointer-events: none;
  }
  .seg:hover span,
  .seg:focus-visible span,
  .seg.cur span {
    opacity: 1;
  }
  .seg:hover {
    background: var(--ink-3);
  }
  .seg.cur {
    background: var(--gold);
    box-shadow: 0 0 10px var(--gold);
  }
  .seg.cur span {
    color: var(--gold);
    font-weight: 600;
  }

  /* --- Phones: the map on top, the chapter in a sheet below --- */
  .narrow .rail,
  .narrow .zoom-buttons {
    display: none;
  }
  .narrow .panel {
    inset: auto 0 0;
    padding: 1.1rem 1.25rem 0;
    background: var(--paper);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -8px 30px rgb(40 30 15 / 0.12);
  }
  .narrow h2 {
    font-size: 2rem;
  }
  .narrow .lede {
    font-size: 1rem;
    margin: 0.75rem 0 1rem;
  }
  .narrow .turn {
    position: sticky;
    bottom: 0;
    margin: 0 -1.25rem;
    padding: 1rem 1.25rem max(1rem, env(safe-area-inset-bottom));
    background: var(--paper);
    box-shadow: 0 -14px 14px var(--paper);
  }
  .narrow .next {
    flex: 1;
    white-space: nowrap;
  }
</style>
