<script lang="ts">
  // The map: the basemap under a dot per place, all in one SVG. The basemap is
  // a static file, fetched and inlined so its strokes stay crisp at any zoom.
  // Places arrive pre-projected (map units); d3-zoom gives us a transform, and
  // dots and labels are drawn in screen space so they stay a constant size.
  // Labels are placed busiest-first and skipped where they'd collide.
  import { onMount } from "svelte"
  import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom"
  import { select } from "d3-selection"
  import type { MapPlace } from "../lib/map.ts"
  import { entityUrl } from "../lib/url.ts"
  import { labelWidth } from "../lib/format.ts"
  import { addInertia } from "../lib/inertia.ts"

  type Era = { id: string; name: string }
  type Box = [number, number, number, number] // x0, y0, x1, y1

  let {
    places,
    periods,
    basemap,
    mapWidth,
    mapHeight,
    home,
  }: { places: MapPlace[]; periods: Era[]; basemap: string; mapWidth: number; mapHeight: number; home: Box } = $props()

  const HEIGHT = 620
  const MAX_LABELS = 70

  let width = $state(1100)
  let era = $state("")
  let transform = $state<ZoomTransform>(fit(home, 1100))
  // Raw, not deeply reactive: these hold objects from props/points as-is.
  let selected = $state.raw<MapPlace>()
  let hovered = $state.raw<(typeof points)[number]>()
  let basemapSvg = $state("")
  let svg: SVGSVGElement
  let behavior: ZoomBehavior<SVGSVGElement, unknown>

  const shown = $derived(places.filter((p) => !era || p.eras.includes(era)))
  const points = $derived(
    shown
      .map((place) => {
        const [sx, sy] = transform.apply([place.x, place.y])
        return { place, sx, sy }
      })
      .filter(({ sx, sy }) => sx > -10 && sx < width + 10 && sy > -10 && sy < HEIGHT + 10),
  )
  const labels = $derived(placeLabels(points))
  const eraName = (id: string) => periods.find((p) => p.id === id)?.name

  function placeLabels(pts: typeof points) {
    const boxes: Box[] = []
    const out: typeof points = []
    // Points arrive busiest first, so the most-mentioned places get labels.
    for (const pt of pts) {
      if (out.length >= MAX_LABELS) break
      const box: Box = [pt.sx + 7, pt.sy - 9, pt.sx + 9 + labelWidth(pt.place.name), pt.sy + 6]
      if (box[2] > width) continue
      if (boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue
      boxes.push(box)
      out.push(pt)
    }
    return out
  }

  // The transform that fits a box of map units into the viewport.
  function fit([x0, y0, x1, y1]: Box, w: number): ZoomTransform {
    const pad = 40
    const k = Math.min((w - pad * 2) / Math.max(x1 - x0, 1), (HEIGHT - pad * 2) / Math.max(y1 - y0, 1), 40)
    return zoomIdentity.translate(w / 2 - (k * (x0 + x1)) / 2, HEIGHT / 2 - (k * (y0 + y1)) / 2).scale(k)
  }
  const zoomToBox = (box: Box) => behavior.transform(select(svg), fit(box, width))
  const zoomBy = (factor: number) => behavior.scaleBy(select(svg), factor)

  onMount(() => {
    fetch(basemap)
      .then((r) => r.text())
      // drop the file's own colors so the page theme applies (see global.css)
      .then((text) => (basemapSvg = text.replace(/<(style)[\s\S]*?\/\1>/, "")))
    behavior = zoom<SVGSVGElement, unknown>().on("zoom", (e) => (transform = e.transform))
    select(svg).call(behavior)
    addInertia(behavior, svg, "xy")
    const target = places.find((p) => `#${p.id}` === location.hash)
    if (target) {
      selected = target
      zoomToBox([target.x - 40, target.y - 30, target.x + 40, target.y + 30])
    } else zoomToBox(home)
  })

  // Keep zoom bounds in step with the measured width: no further out than the
  // whole basemap, no panning off its edges.
  $effect(() => {
    behavior
      ?.extent([
        [0, 0],
        [width, HEIGHT],
      ])
      .scaleExtent([Math.min(width / mapWidth, HEIGHT / mapHeight), 60])
      .translateExtent([
        [0, 0],
        [mapWidth, mapHeight],
      ])
  })

  // Choosing an era frames all of that era's places.
  function frameEra() {
    if (!era || !shown.length) return zoomToBox(home)
    const xs = shown.map((p) => p.x)
    const ys = shown.map((p) => p.y)
    zoomToBox([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
  }

  // Hovering and tapping pick the nearest dot within reach, so small dots are
  // still easy to hit.
  function nearest(e: PointerEvent | MouseEvent) {
    let best: (typeof points)[number] | undefined
    let bestD = 14 * 14
    for (const pt of points) {
      const d = (pt.sx - e.offsetX) ** 2 + (pt.sy - e.offsetY) ** 2
      if (d < bestD) [best, bestD] = [pt, d]
    }
    return best
  }

  function onKey(e: KeyboardEvent) {
    const step = 60 / transform.k
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    if (moves[e.key]) behavior.translateBy(select(svg), ...moves[e.key])
    else if (e.key === "+" || e.key === "=") zoomBy(1.5)
    else if (e.key === "-") zoomBy(1 / 1.5)
    else return
    e.preventDefault()
  }
</script>

<div class="map">
  <div class="viz-controls">
    <label>
      <span class="sr-only">Era</span>
      <select bind:value={era} onchange={frameEra}>
        <option value="">All eras</option>
        {#each periods as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    </label>
    <div class="viz-zoom" role="group" aria-label="Zoom">
      <button type="button" onclick={() => zoomBy(1 / 1.5)} aria-label="Zoom out">−</button>
      <button type="button" onclick={() => zoomBy(1.5)} aria-label="Zoom in">+</button>
      <button type="button" onclick={() => zoomToBox(home)}>Reset</button>
    </div>
    <span class="count">{shown.length} places{era ? ` in ${eraName(era)}` : ""}</span>
  </div>

  <div class="viz-frame" bind:clientWidth={width}>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <svg
      bind:this={svg}
      viewBox="0 0 {width} {HEIGHT}"
      height={HEIGHT}
      role="application"
      aria-label="Map of biblical places. Arrow keys pan, plus and minus zoom."
      tabindex="0"
      onkeydown={onKey}
      onpointermove={(e) => (hovered = nearest(e))}
      onpointerleave={() => (hovered = undefined)}
      onclick={(e) => {
        const pt = nearest(e)
        if (pt) selected = pt.place
      }}
    >
      <g transform={transform.toString()}>{@html basemapSvg}</g>
      {#each points as { place, sx, sy } (place.id)}
        <circle class="dot" cx={sx} cy={sy} r="3.5" />
      {/each}
      {#each labels as { place, sx, sy } (place.id)}
        <text x={sx + 7} y={sy + 4}>{place.name}</text>
      {/each}
      {#if selected}
        {@const [sx, sy] = transform.apply([selected.x, selected.y])}
        <circle class="ring" cx={sx} cy={sy} r="8" />
      {/if}
    </svg>

    {#if hovered}
      <div class="viz-tooltip" style="left: {hovered.sx + 12}px; top: {hovered.sy + 10}px">
        <strong>{hovered.place.name}</strong>
        {#if hovered.place.type}<span>{hovered.place.type}</span>{/if}
      </div>
    {/if}
  </div>

  <div class="viz-details" aria-live="polite">
    {#if selected}
      <p class="kind">
        Place{selected.type ? ` · ${selected.type}` : ""}
      </p>
      <h2>{selected.name}</h2>
      {#if selected.eras.length}
        <p class="sub">{selected.eras.map(eraName).join(" · ")}</p>
      {/if}
      <p><a href={entityUrl({ kind: "place", id: selected.id })}>Open place →</a></p>
    {:else}
      <p class="hint">
        Click a place for details. Scroll or pinch to zoom, drag to pan. Pick an era to see the places its events and people
        are tied to. Labels go to the most-mentioned places first; zoom in for more.
      </p>
    {/if}
  </div>
</div>

<style>
  .viz-frame {
    background: var(--water);
  }
  .count {
    margin-left: auto;
    color: var(--ink-3);
  }

  .dot {
    fill: var(--accent);
    stroke: var(--land);
    stroke-width: 1.5;
    paint-order: stroke;
  }
  .ring {
    fill: none;
    stroke: var(--ink);
    stroke-width: 2;
  }
  text {
    font-size: 12px;
    fill: var(--ink);
    stroke: var(--land);
    stroke-width: 3;
    stroke-linejoin: round;
    paint-order: stroke;
    pointer-events: none;
  }
</style>
