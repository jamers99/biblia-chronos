// The map's data: every locatable place, projected, with the eras it figures
// in, busiest first (the order labels are placed in). Pure — the page supplies
// the projection and how to date a place.

import type { Period, Place } from "./data/schema.ts"
import { periodsOverlapping, type Span } from "./chronology.ts"

export type MapPlace = {
  id: string
  name: string
  x: number
  y: number
  weight: number // verse count: busier places get labels first
  draft: boolean
  type?: string
  eras: string[] // period ids
}

export function mapPlaces(
  places: Place[],
  periods: Period[],
  project: (p: Place) => [number, number] | undefined,
  spansAt: (placeId: string) => Span[],
): MapPlace[] {
  return places.flatMap((p): MapPlace[] => {
    const xy = project(p)
    if (!xy) return []
    const eras = new Set(spansAt(p.id).flatMap((s) => periodsOverlapping(s, periods).map((e) => e.id)))
    return [
      {
        id: p.id,
        name: p.name,
        x: xy[0],
        y: xy[1],
        weight: p.scriptureRefs?.length ?? 0,
        draft: p.status === "draft",
        type: p.featureType,
        eras: periods.filter((e) => eras.has(e.id)).map((e) => e.id),
      },
    ]
  }).sort((a, b) => b.weight - a.weight)
}
