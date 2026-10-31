// Written to dist/map/basemap.svg at build time; used by the map and by the
// locator maps on place pages.
import { basemapSvg } from "../../lib/geo.ts"

export const GET = () => new Response(basemapSvg(), { headers: { "Content-Type": "image/svg+xml" } })
