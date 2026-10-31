// The map's projection and basemap, used at build time only. Places are
// projected here into "map units" (the basemap's pixel space), so the browser
// gets plain x/y numbers and never loads d3-geo.

import { geoMercator, geoPath } from "d3-geo"
import type { Coordinates } from "./data/schema.ts"
import land from "../../data/geo/land.json"
import lakes from "../../data/geo/lakes.json"
import rivers from "../../data/geo/rivers.json"

// The basemap's extent (see data/geo/README.md): Spain to India.
const WEST = -12
const EAST = 80
const SOUTH = 4
const NORTH = 50

export const MAP_W = 1600
const projection = geoMercator().fitWidth(MAP_W, {
  type: "MultiPoint",
  coordinates: [
    [WEST, SOUTH],
    [EAST, NORTH],
  ],
})
export const MAP_H = Math.round(projection([WEST, SOUTH])![1])

export function project(c: Coordinates): [number, number] | undefined {
  if (c.lng < WEST || c.lng > EAST || c.lat < SOUTH || c.lat > NORTH) return undefined
  const [x, y] = projection([c.lng, c.lat])!
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
}

// The basemap as a standalone SVG. It carries its own colors (an <img> can't
// see the page's CSS variables), including a dark variant. Strokes don't
// scale, so coastlines stay hairlines when the map is zoomed. Class names are
// prefixed: when the map inlines this file, its <style> applies page-wide.
export function basemapSvg(): string {
  const path = geoPath(projection).digits(1)
  const d = (geo: unknown) => path(geo as Parameters<typeof path>[0]) ?? ""
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_W} ${MAP_H}" width="${MAP_W}" height="${MAP_H}">
<style>
  .bm-water, .bm-lake { fill: #dde6e7 }
  .bm-land { fill: #f1ebdf; stroke: #c9bda8; stroke-width: 0.75 }
  .bm-river { fill: none; stroke: #9db8c4; stroke-width: 1 }
  .bm-lake { stroke: #9db8c4; stroke-width: 0.75 }
  .bm-land, .bm-river, .bm-lake { vector-effect: non-scaling-stroke }
  @media (prefers-color-scheme: dark) {
    .bm-water, .bm-lake { fill: #1a2326 }
    .bm-land { fill: #2b2823; stroke: #4a443a }
    .bm-river, .bm-lake { stroke: #3d5560 }
  }
</style>
<rect class="bm-water" width="${MAP_W}" height="${MAP_H}"/>
<path class="bm-land" d="${d(land)}"/>
<path class="bm-river" d="${d(rivers)}"/>
<path class="bm-lake" d="${d(lakes)}"/>
</svg>`
}
