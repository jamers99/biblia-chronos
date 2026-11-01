<script lang="ts">
  // The History of Israel timeline, full screen. Era names sit large in the
  // background; events rise above a gold time axis and people's lives run
  // below it. Click anyone to light up their connections. An overview strip at
  // the bottom shows where you are in the whole story.
  //
  // d3-scale does the math, d3-zoom handles wheel/drag/pinch (d3-transition
  // animates jumps), Svelte renders the SVG. Lanes are re-packed on every
  // zoom (not on pan), heaviest first, so zooming in reveals more.
  import { onMount } from "svelte"
  import { fade, fly, scale } from "svelte/transition"
  import { cubicOut } from "svelte/easing"
  import { scaleLinear } from "d3-scale"
  import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom"
  import { select } from "d3-selection"
  import "d3-transition"
  import { packLanes, type TimelineItem, type TimelinePeriod } from "../lib/timeline.ts"
  import { formatSpan, formatYear, labelWidth } from "../lib/format.ts"
  import { entityUrl } from "../lib/url.ts"
  import { addInertia } from "../lib/inertia.ts"

  let { items, periods }: { items: TimelineItem[]; periods: TimelinePeriod[] } = $props()

  // Layout, in px. Vertical positions follow the window height.
  const ERA_TOP = 96 // baseline area for the large era names
  const FIRST_LANE_TOP = 200 // nothing above this but era names
  const EVENT_GAP = 32
  const PERSON_GAP = 30
  const STRIP = 64 // overview strip area at the bottom
  const CARD_W = 340

  const domain = $derived([periods[0].start, periods[periods.length - 1].end])
  const byId = $derived(new Map(items.map((i) => [i.id, i])))
  const maxWeight = $derived(Math.max(...items.map((i) => i.weight)))

  let width = $state(1200)
  let height = $state(800)
  let showDrafts = $state(true)
  let transform = $state<ZoomTransform>(zoomIdentity)
  // Raw, not deeply reactive: these hold items from props, compared by identity.
  let selected = $state.raw<TimelineItem | TimelinePeriod>()
  let hovered = $state.raw<{ item: TimelineItem; x: number; y: number }>()
  let query = $state("")
  let svg: SVGSVGElement
  let searchInput: HTMLInputElement
  let behavior: ZoomBehavior<SVGSVGElement, unknown>
  let reducedMotion = false
  const ms = (duration: number) => (reducedMotion ? 0 : duration)

  const axisY = $derived(Math.max(FIRST_LANE_TOP + 2 * EVENT_GAP + 40, Math.round(height * 0.47)))
  const eventLanes = $derived(Math.floor((axisY - 40 - FIRST_LANE_TOP) / EVENT_GAP) + 1)
  const peopleLanes = $derived(Math.max(1, Math.floor((height - STRIP - 30 - (axisY + 50)) / PERSON_GAP) + 1))
  const eventY = (lane: number) => axisY - 40 - lane * EVENT_GAP
  const personY = (lane: number) => axisY + 50 + lane * PERSON_GAP

  const base = $derived(scaleLinear().domain(domain).range([0, width]))
  const x = $derived(transform.rescaleX(base))
  const ticks = $derived(x.ticks(Math.max(2, Math.floor(width / 130))).filter(Number.isInteger))
  const shown = $derived(showDrafts ? items : items.filter((i) => !i.draft))

  const isItem = (s: TimelineItem | TimelinePeriod | undefined): s is TimelineItem => !!s && "kind" in s
  const focus = $derived(isItem(selected) ? selected : undefined)
  const related = $derived(new Set(focus?.related ?? []))
  const dimmed = (i: TimelineItem) => !!focus && i !== focus && !related.has(i.id)

  // Lanes are packed in "world" pixels: the whole timeline at the current zoom
  // with no pan applied, not just what's in view. Dragging only pans, so
  // nothing changes lane mid-drag; lanes change only when the zoom does.
  const k = $derived(transform.k)
  const world = $derived(scaleLinear().domain(domain).range([0, width * k]))
  // An item's footprint: its mark plus its label, which starts at the mark.
  function extent(i: TimelineItem): [number, number] {
    const left = world(i.start) - 6
    return [left, Math.max(world(i.end) + 6, left + labelWidth(i.name))]
  }
  // The selection and its connections jump the queue, so they're always shown.
  const priority = (i: TimelineItem) => (i === focus ? 2e9 : related.has(i.id) ? 1e9 + i.weight : i.weight)

  const lanes = (kind: TimelineItem["kind"], maxLanes: number) =>
    packLanes(shown.filter((i) => i.kind === kind), priority, extent, maxLanes, 12).placed
  const eventLayout = $derived(lanes("event", eventLanes))
  const peopleLayout = $derived(lanes("person", peopleLanes))
  // World to screen is a shift by the pan, so culling is cheap.
  const inView = (placed: typeof eventLayout) =>
    placed.filter(({ x0, x1 }) => x1 + transform.x > 0 && x0 + transform.x < width)
  const visible = $derived([inView(eventLayout), inView(peopleLayout)])

  // Where each placed item is drawn: [left, right, y], for links and the card.
  const anchors = $derived(
    new Map(
      visible.flatMap((placed) =>
        placed.map(({ item, lane }) => {
          const y = item.kind === "event" ? eventY(lane) : personY(lane)
          return [item.id, [x(item.start), x(item.end), y]] as const
        }),
      ),
    ),
  )
  // A label sticks to the left edge while its item runs off-screen, but never
  // slides out of the item's footprint (where it could hit a neighbour).
  const labelX = (i: TimelineItem, xs: number, xe: number) => Math.max(xs, Math.min(6, xe + 6 - labelWidth(i.name)))

  const dotRadius = (i: TimelineItem) => 3 + 2.5 * Math.sqrt(i.weight / maxWeight)
  const ribbon = (i: TimelineItem) => 4 + 4 * Math.sqrt(i.weight / maxWeight)
  const strong = (i: TimelineItem) => i.weight > maxWeight * 0.12

  // Large era names, sized to their band and clipped to it.
  const eraTitles = $derived(
    periods.flatMap((p) => {
      const a = Math.max(0, x(p.start))
      const b = Math.min(width, x(p.end))
      const left = Math.max(x(p.start), 0) + 20
      const size = Math.min(72, (b - left - 24) / (p.name.length * 0.85))
      return b > a ? [{ p, a, b, left, size }] : []
    }),
  )
  const tickLabel = (year: number) => (year === 0 ? "BC | AD" : formatYear(year))

  // --- Overview strip ---------------------------------------------------------

  const stripW = $derived(Math.max(200, Math.min(820, width - (width < 700 ? 32 : 380))))
  const stripX = $derived((width - stripW) / 2)
  const stripY = $derived(height - 44)
  const sx = $derived(scaleLinear().domain(domain).range([stripX, stripX + stripW]))
  const density = $derived.by(() => {
    const bins = new Map<number, number>()
    for (const i of items) {
      if (i.start < domain[0]) continue // people born before Abraham
      const b = Math.floor(sx(i.start) / 4) * 4
      bins.set(b, (bins.get(b) ?? 0) + 1)
    }
    return [...bins]
  })
  function onStrip(e: PointerEvent) {
    if (e.type === "pointerdown") (e.currentTarget as Element).setPointerCapture(e.pointerId)
    else if (!(e.buttons & 1)) return
    behavior.translateTo(select(svg), base(sx.invert(e.offsetX)), height / 2)
  }

  // --- Zoom and navigation ----------------------------------------------------

  onMount(() => {
    behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 400])
      // Sideways wheel (trackpads) pans instead (below); the strip handles its own drags.
      .filter(
        (e) =>
          !e.button &&
          !(e.target as Element).closest?.(".strip") &&
          (e.type !== "wheel" || Math.abs(e.deltaY) >= Math.abs(e.deltaX)),
      )
      .on("zoom", (e) => (transform = e.transform))
    select(svg).call(behavior)
    addInertia(behavior, svg, "x")
    reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      behavior.translateBy(select(svg), -e.deltaX / transform.k, 0)
    }
    svg.addEventListener("wheel", onWheel, { passive: false })

    const fromHash = byId.get(decodeURIComponent(location.hash.slice(1)))
    if (fromHash) choose(fromHash)
    return () => svg.removeEventListener("wheel", onWheel)
  })

  // Keep zoom bounds in step with the window.
  $effect(() => {
    behavior
      ?.extent([
        [0, 0],
        [width, height],
      ])
      .translateExtent([
        [0, 0],
        [width, height],
      ])
  })

  // A selection is shareable: it lives in the URL hash.
  $effect(() => {
    const hash = focus ? `#${focus.id}` : ""
    if (location.hash !== hash) history.replaceState(null, "", hash || location.pathname + location.search)
  })

  // Glide to show [start, end] with some room around it.
  function flyTo(start: number, end: number) {
    const pad = Math.max(8, (end - start) * 0.08)
    const k = width / (base(end + pad) - base(start - pad))
    const t = zoomIdentity.scale(k).translate(-base(start - pad), 0)
    select(svg).transition().duration(ms(750)).call(behavior.transform, t)
  }
  const zoomBy = (factor: number) => select(svg).transition().duration(ms(250)).call(behavior.scaleBy, factor)

  function pickPeriod(p: TimelinePeriod) {
    flyTo(p.start, p.end)
    selected = p
  }

  // Select an item and bring it into view, with enough context around it.
  function choose(target: TimelineItem | TimelinePeriod) {
    query = ""
    if (!isItem(target)) return pickPeriod(target)
    selected = target
    const mid = (target.start + target.end) / 2
    const half = Math.max(45, (target.end - target.start) * 0.75)
    flyTo(mid - half, mid + half)
  }

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return
    const step = width / 8 / transform.k
    if (e.key === "/") searchInput.focus()
    else if (e.key === "Escape") selected = undefined
    else if (e.key === "ArrowLeft") behavior.translateBy(select(svg), step, 0)
    else if (e.key === "ArrowRight") behavior.translateBy(select(svg), -step, 0)
    else if (e.key === "+" || e.key === "=") zoomBy(1.6)
    else if (e.key === "-") zoomBy(1 / 1.6)
    else return
    e.preventDefault()
  }

  // --- Search -----------------------------------------------------------------

  const results = $derived.by(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const hits = (name: string) => name.toLowerCase().includes(q)
    return [...periods.filter((p) => hits(p.name)), ...shown.filter((i) => hits(i.name))].slice(0, 8)
  })

  // --- Selection card -----------------------------------------------------------

  const card = $derived.by(() => {
    if (!focus) return undefined
    const a = anchors.get(focus.id)
    if (!a) return { left: width - CARD_W - 24, top: 90 }
    // Beside the mark if there's room on either side; otherwise (a bar wider
    // than the window) tucked into the top right.
    const [x0, x1, y] = a
    const top = Math.max(84, Math.min(y - 120, height - STRIP - 290))
    if (x1 + 28 + CARD_W < width - 16) return { left: x1 + 28, top }
    if (x0 - 28 - CARD_W > 16) return { left: x0 - 28 - CARD_W, top }
    return { left: width - CARD_W - 24, top: 84 }
  })
  const relatedPeople = $derived(
    (focus?.related ?? [])
      .map((id) => byId.get(id)!)
      .filter((i) => i.kind === "person")
      .sort((a, b) => b.weight - a.weight),
  )
  const relatedEvents = $derived((focus?.related ?? []).filter((id) => byId.get(id)?.kind === "event").length)
</script>

<svelte:window onkeydown={onKey} />

<div class="timeline" bind:clientWidth={width} bind:clientHeight={height}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <svg
    bind:this={svg}
    viewBox="0 0 {width} {height}"
    role="application"
    aria-label="Timeline from Abraham to the early church. Arrow keys pan, plus and minus zoom, slash searches."
    onclick={(e) => {
      if (e.target === svg || (e.target as Element).classList.contains("band")) selected = undefined
    }}
  >
    <defs>
      <linearGradient id="tl-axis" gradientUnits="userSpaceOnUse" x1="0" x2={width} y1="0" y2="0">
        <stop offset="0" style="stop-color: var(--gold); stop-opacity: 0" />
        <stop offset="0.12" style="stop-color: var(--gold)" />
        <stop offset="0.88" style="stop-color: var(--gold)" />
        <stop offset="1" style="stop-color: var(--gold); stop-opacity: 0" />
      </linearGradient>
      {#each [["tl-person", "--people"], ["tl-focus", "--accent"]] as [id, color] (id)}
        <linearGradient {id}>
          <stop offset="0" style="stop-color: var({color}); stop-opacity: 0.35" />
          <stop offset="0.15" style="stop-color: var({color})" />
          <stop offset="0.85" style="stop-color: var({color})" />
          <stop offset="1" style="stop-color: var({color}); stop-opacity: 0.35" />
        </linearGradient>
      {/each}
      <filter id="tl-glow" x="-20%" y="-300%" width="140%" height="700%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <radialGradient id="tl-vignette" cx="0.5" cy="0.45" r="0.8">
        <stop offset="0.55" style="stop-color: var(--edge); stop-opacity: 0" />
        <stop offset="1" style="stop-color: var(--edge)" />
      </radialGradient>
      {#each eraTitles as { p, a, b } (p.id)}
        <clipPath id="tl-clip-{p.id}"><rect x={a} y="0" width={b - a} height={height} /></clipPath>
      {/each}
      <clipPath id="tl-above-axis"><rect x="0" y="0" {width} height={axisY} /></clipPath>
    </defs>

    <!-- Eras: alternating bands, a dotted edge, and the era's name writ large -->
    {#each eraTitles as { p, a, b, left, size }, n (p.id)}
      <rect class="band" class:alt={periods.indexOf(p) % 2 === 1} x={a} y="0" width={b - a} {height} />
      <line class="era-edge" x1={x(p.start)} x2={x(p.start)} y1="70" y2={height - STRIP - 10} />
      {#if size >= 14}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <g class="era" onclick={() => pickPeriod(p)}>
          <text
            class="era-name"
            clip-path="url(#tl-clip-{p.id})"
            x={left - 4}
            y={ERA_TOP + size * 0.55}
            style="font-size: {size}px">{p.name.toUpperCase()}</text
          >
          <text class="era-dates" x={left} y={ERA_TOP + size * 0.55 + 24}>{p.when}</text>
        </g>
      {/if}
    {/each}

    <!-- The time axis -->
    <line x1="0" x2={width} y1={axisY} y2={axisY} stroke="url(#tl-axis)" stroke-width="1.5" />
    {#each ticks as t (t)}
      <line class="tick-mark" x1={x(t)} x2={x(t)} y1={axisY - 5} y2={axisY + 5} />
      <text class="tick" x={x(t)} y={axisY + 22} text-anchor="middle">{tickLabel(t)}</text>
    {/each}

    <!-- Links from the selection to its connections -->
    {#if focus && anchors.has(focus.id)}
      {@const [fx0, fx1, fy] = anchors.get(focus.id)!}
      {@const fx = (Math.max(fx0, 0) + Math.min(fx1, width)) / 2}
      {#each focus.related as id (id)}
        {#if anchors.has(id)}
          {@const [tx0, tx1, ty] = anchors.get(id)!}
          {@const tx = (Math.max(tx0, 0) + Math.min(tx1, tx0 + 60, width)) / 2}
          <path
            pathLength="1"
            class="link"
            class:to-event={byId.get(id)?.kind === "event"}
            d="M{fx},{fy} C{fx},{(fy + ty) / 2} {tx},{(fy + ty) / 2} {tx},{ty}"
          />
        {/if}
      {/each}
    {/if}

    <!-- Events above the axis, people below. Each item sits at its lane via a
         CSS transform, so a lane change on zoom glides rather than jumps. Events
         are clipped at the axis, so their stems can simply run long. -->
    {#each visible as placed, section (section)}
      <g clip-path={section === 0 ? "url(#tl-above-axis)" : undefined}>
        {#each placed as { item } (item.id)}
          {@const [xs, xe, y] = anchors.get(item.id)!}
          {@const span = item.end > item.start}
          <!-- Pointer layer; every item also has its own page and index entry. -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <g
            class="item {item.kind}"
            class:dim={dimmed(item)}
            class:focus={item === focus}
            class:draft={item.draft}
            style="transform: translateY({y}px)"
            onclick={(e) => {
              e.stopPropagation()
              selected = item
            }}
            onpointerenter={(e) => (hovered = { item, x: e.offsetX, y })}
            onpointerleave={() => (hovered = undefined)}
          >
            {#if item.kind === "event"}
              <line class="stem" x1={xs} x2={xs} y1="0" y2={axisY} />
              <rect class="hit" x={xs - 8} y="-22" width={Math.max(xe - xs, labelWidth(item.name)) + 16} height="30" />
              {#if span}
                <rect class="bar" x={xs} y="-2.5" width={xe - xs} height="5" rx="2.5" />
              {/if}
              <circle class="dot" cx={xs} cy="0" r={dotRadius(item)} />
              <text class:strong={strong(item)} x={span ? labelX(item, xs, xe) : xs + dotRadius(item) + 5} y={span ? -9 : 4}
                >{item.name}</text
              >
            {:else}
              {@const h = ribbon(item)}
              <rect class="hit" x={xs - 6} y="-20" width={Math.max(xe - xs, labelWidth(item.name)) + 12} height="30" />
              <rect
                class="ribbon"
                class:attested={!item.lifetime}
                x={xs}
                y={-h / 2}
                width={Math.max(6, xe - xs)}
                height={h}
                rx={h / 2}
                style={item.lifetime && xe - xs > 40 ? `fill: url(#${item === focus ? "tl-focus" : "tl-person"})` : ""}
                filter={item === focus ? "url(#tl-glow)" : undefined}
              />
              <text class:strong={strong(item)} x={labelX(item, xs, xe)} y={-h / 2 - 5}>{item.name}</text>
            {/if}
          </g>
        {/each}
      </g>
    {/each}

    <!-- Overview strip: the whole story, with a window on what's in view -->
    <g class="strip" onpointerdown={onStrip} onpointermove={onStrip} role="slider" aria-label="Overview" aria-valuenow={Math.round((x.domain()[0] + x.domain()[1]) / 2)} tabindex="-1">
      <rect class="strip-hit" x={stripX - 8} y={stripY - 10} width={stripW + 16} height="40" />
      {#each periods as p, n (p.id)}
        <rect class="strip-era" class:alt={n % 2 === 1} x={sx(p.start)} y={stripY} width={Math.max(0, sx(p.end) - sx(p.start) - 1.5)} height="18" rx="2" />
      {/each}
      {#each density as [bx, count] (bx)}
        <rect class="strip-bin" x={bx} y={stripY + 18 - Math.min(14, count * 1.3)} width="3" height={Math.min(14, count * 1.3)} />
      {/each}
      <rect
        class="strip-window"
        x={Math.max(stripX, sx(x.domain()[0]))}
        y={stripY - 4}
        width={Math.max(4, Math.min(stripX + stripW, sx(x.domain()[1])) - Math.max(stripX, sx(x.domain()[0])))}
        height="26"
        rx="4"
      />
      <text class="strip-label" x={stripX} y={stripY + 36}>Abraham</text>
      <text class="strip-label" x={stripX + stripW} y={stripY + 36} text-anchor="end">Early church</text>
    </g>

    <rect class="vignette" {width} {height} fill="url(#tl-vignette)" />
  </svg>

  <!-- Search -->
  <div class="search">
    <input
      bind:this={searchInput}
      bind:value={query}
      type="search"
      placeholder="Search people, events, eras…"
      aria-label="Search the timeline"
      onkeydown={(e) => {
        if (e.key === "Enter" && results[0]) choose(results[0])
        if (e.key === "Escape") query = ""
      }}
    />
    {#if results.length}
      <ul class="results" transition:fly={{ y: -6, duration: 150 }}>
        {#each results as r (r.id)}
          <li>
            <button type="button" onclick={() => choose(r)}>
              <span>{r.name}</span>
              <small>{isItem(r) ? (r.kind === "person" ? "Person" : "Event") : "Era"} · {formatSpan(r.start, r.end)}</small>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if hovered && hovered.item !== focus}
    <div class="tooltip" style="left: {hovered.x + 14}px; top: {hovered.y + 10}px" in:fade={{ duration: 120 }}>
      <strong>{formatSpan(hovered.item.start, hovered.item.end)}</strong>
      <span>{hovered.item.name}</span>
    </div>
  {/if}

  {#if selected && card}
    <div class="card" style="left: {card.left}px; top: {card.top}px" aria-live="polite" in:scale={{ start: 0.96, duration: 200, easing: cubicOut }} out:fade={{ duration: 120 }}>
      <button type="button" class="close" aria-label="Close" onclick={() => (selected = undefined)}>×</button>
      {#if isItem(selected)}
        <p class="kind">
          {selected.kind === "person" ? (selected.lifetime ? "Person" : "Person · attested years") : "Event"}
          {#if selected.draft}<span class="badge">draft</span>{/if}
        </p>
        <h2>{selected.name}</h2>
        <p class="when">{formatSpan(selected.start, selected.end)}{selected.eras ? ` · ${selected.eras}` : ""}</p>
        {#if selected.summary}<p class="summary">{selected.summary}</p>{/if}
        {#if relatedPeople.length}
          <div class="chips">
            <span class="label">{selected.kind === "person" ? "Family" : "People"}</span>
            {#each relatedPeople.slice(0, 5) as p (p.id)}
              <button type="button" class="chip" onclick={() => choose(p)}>{p.name}</button>
            {/each}
            {#if relatedPeople.length > 5}<span class="more">+{relatedPeople.length - 5} more</span>{/if}
          </div>
        {/if}
        {#if relatedEvents}
          <p class="events">{relatedEvents} {relatedEvents === 1 ? "event" : "events"} on the timeline</p>
        {/if}
        <a href={entityUrl(selected)}>Open {selected.kind === "person" ? "person" : "event"} →</a>
      {:else}
        <p class="kind">Era</p>
        <h2>{selected.name}</h2>
        <p class="when">{selected.when}</p>
        {#if selected.summary}<p class="summary">{selected.summary}</p>{/if}
      {/if}
    </div>
  {/if}

  <div class="corner">
    <p>Scroll to zoom · drag to move · click anyone</p>
    <label class="toggle"><input type="checkbox" bind:checked={showDrafts} /> Show draft records</label>
  </div>
  <div class="zoom">
    <button type="button" class="icon-button" aria-label="Zoom out" onclick={() => zoomBy(1 / 1.6)}>−</button>
    <button type="button" class="icon-button" aria-label="Zoom in" onclick={() => zoomBy(1.6)}>+</button>
  </div>
</div>

<style>
  .timeline {
    position: relative;
    height: 100%;
    overflow: hidden;
    background: var(--paper);
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    cursor: grab;
    user-select: none;
    font-family: var(--sans);
  }
  svg:active {
    cursor: grabbing;
  }

  .band {
    fill: transparent;
  }
  .band.alt {
    fill: var(--band);
  }
  .era-edge {
    stroke: var(--gold);
    stroke-opacity: 0.25;
    stroke-dasharray: 2 6;
  }
  .era {
    cursor: pointer;
  }
  .era-name {
    font-family: var(--serif);
    font-weight: 600;
    letter-spacing: 0.1em;
    fill: var(--title);
    transition: fill 0.2s;
  }
  .era:hover .era-name {
    fill: var(--gold);
    fill-opacity: 0.35;
  }
  .era-dates {
    font-size: 11px;
    letter-spacing: 0.18em;
    fill: var(--ink-3);
  }
  .tick-mark {
    stroke: var(--gold);
    stroke-opacity: 0.6;
  }
  .tick {
    font-size: 11px;
    fill: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  .item {
    cursor: pointer;
    transition:
      opacity 0.2s,
      transform 0.28s cubic-bezier(0.2, 0.7, 0.3, 1);
    /* Fade in when added: CSS, as a zoom can add dozens of items a frame */
    animation: appear 0.18s;
  }
  @keyframes appear {
    from {
      opacity: 0;
    }
  }
  .item.dim {
    opacity: 0.18;
  }
  .hit {
    fill: transparent;
  }
  .item text {
    font-size: 12px;
    fill: var(--ink-2);
  }
  .item text.strong {
    fill: var(--ink);
    font-weight: 600;
  }
  .person text.strong {
    font: 600 14px var(--serif);
  }
  .item.draft text {
    fill: var(--ink-3);
  }
  .item:hover text {
    fill: var(--ink);
  }
  .item.focus text {
    fill: var(--accent);
    font: 600 16px var(--serif);
  }
  .stem {
    stroke: var(--rule);
  }
  .item.focus .stem,
  .item:hover .stem {
    stroke: var(--gold);
  }
  .bar,
  .dot {
    fill: var(--events);
  }
  .dot {
    stroke: var(--paper);
    stroke-width: 2;
    paint-order: stroke;
  }
  .ribbon {
    fill: var(--people);
  }
  .ribbon.attested {
    fill-opacity: 0.4;
  }
  .item.focus .ribbon {
    fill: var(--accent);
  }
  .link {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.2;
    opacity: 0.6;
  }
  /* Links draw themselves out from the selection (pathLength="1"). */
  .link:not(.to-event) {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: draw 0.6s ease-out forwards;
  }
  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  .link.to-event {
    animation: appear 0.6s ease-out;
  }
  @keyframes appear {
    from {
      opacity: 0;
    }
  }
  .link.to-event {
    stroke-dasharray: 3 3;
    opacity: 0.45;
  }

  .strip {
    cursor: pointer;
  }
  .strip-hit {
    fill: transparent;
  }
  .strip-era {
    fill: var(--band);
    stroke: var(--rule);
  }
  .strip-era.alt {
    fill: var(--rule);
  }
  .strip-bin {
    fill: var(--events);
    opacity: 0.55;
  }
  .strip-window {
    fill: var(--gold);
    fill-opacity: 0.12;
    stroke: var(--gold);
    stroke-width: 1.5;
  }
  .strip-label {
    font-size: 11px;
    fill: var(--ink-3);
  }
  .vignette {
    pointer-events: none;
  }

  .search {
    position: absolute;
    top: max(1.1rem, env(safe-area-inset-top));
    right: calc(max(1.5rem, env(safe-area-inset-right)) + 2 * 2.25rem + 1rem);
    width: min(18rem, calc(100vw - 15rem));
    z-index: 11;
  }
  .search input {
    width: 100%;
    font: inherit;
    font-size: 0.85rem;
    padding: 0.5rem 0.9rem;
    border-radius: 999px;
    border: 1px solid var(--rule);
    background: var(--surface);
    color: var(--ink);
  }
  .search input:focus {
    outline: none;
    border-color: var(--gold);
  }
  .results {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0.3rem;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 10px;
    box-shadow: 0 10px 30px rgb(40 30 15 / 0.15);
  }
  .results button {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    padding: 0.4rem 0.6rem;
    border: 0;
    border-radius: 6px;
    background: none;
    font: inherit;
    font-size: 0.85rem;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
  }
  .results button:hover,
  .results button:focus-visible {
    background: var(--wash);
  }
  .results small {
    color: var(--ink-3);
    white-space: nowrap;
  }

  .tooltip {
    position: absolute;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    padding: 0.35rem 0.6rem;
    font-size: 0.8rem;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 8px;
    box-shadow: 0 4px 14px rgb(40 30 15 / 0.12);
    white-space: nowrap;
  }
  .tooltip span {
    color: var(--ink-2);
  }

  .card {
    position: absolute;
    width: 340px;
    padding: 1rem 1.15rem 1.1rem;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid color-mix(in srgb, var(--gold) 45%, transparent);
    box-shadow: 0 14px 40px rgb(40 30 15 / 0.18);
    transition:
      left 0.3s,
      top 0.3s;
  }
  .card .kind {
    margin: 0;
    font: 600 0.65rem var(--sans);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--gold);
  }
  .card h2 {
    margin: 0.2rem 0 0.1rem;
    font-size: 1.5rem;
  }
  .card .when {
    margin: 0;
    font-size: 0.82rem;
    color: var(--ink-2);
  }
  .card .summary {
    margin: 0.6rem 0;
    font: 0.95rem/1.5 var(--serif);
    color: var(--ink-2);
  }
  .card .close {
    position: absolute;
    top: 0.5rem;
    right: 0.6rem;
    border: 0;
    background: none;
    font-size: 1.2rem;
    color: var(--ink-3);
    cursor: pointer;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    margin: 0.5rem 0;
    font-size: 0.78rem;
  }
  .chips .label {
    width: 3.5rem;
    color: var(--ink-3);
  }
  .chip {
    font: inherit;
    padding: 0.1rem 0.55rem;
    border: 0;
    border-radius: 999px;
    background: var(--wash);
    color: var(--ink);
    cursor: pointer;
  }
  .chip:hover {
    background: var(--rule);
  }
  .more,
  .events {
    color: var(--ink-3);
    font-size: 0.78rem;
  }
  .events {
    margin: 0 0 0.6rem;
  }
  .card a {
    font-size: 0.85rem;
  }

  .corner {
    position: absolute;
    left: max(1.5rem, env(safe-area-inset-left));
    bottom: max(1.4rem, env(safe-area-inset-bottom));
    font-size: 0.75rem;
    color: var(--ink-3);
  }
  .corner p {
    margin: 0 0 0.3rem;
  }
  .corner .toggle {
    font-size: 0.75rem;
    color: var(--ink-3);
  }
  .zoom {
    position: absolute;
    right: max(1.5rem, env(safe-area-inset-right));
    bottom: max(1.6rem, env(safe-area-inset-bottom));
    display: flex;
    gap: 0.5rem;
  }

  /* Phones: the card becomes a bottom sheet; the corner hint gives way to the strip. */
  @media (max-width: 700px) {
    .card {
      left: 0.75rem !important;
      right: 0.75rem;
      top: auto !important;
      bottom: 5.5rem;
      width: auto;
    }
    .corner p {
      display: none;
    }
    .corner {
      bottom: auto;
      top: 4.4rem;
    }
    .zoom {
      display: none;
    }
    .search {
      top: 4.2rem;
      right: 1rem;
      left: auto;
      width: 11rem;
    }
  }
</style>
