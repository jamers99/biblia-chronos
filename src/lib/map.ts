// The map's data: every locatable place, projected, with the eras it figures
// in, busiest first (the order labels are placed in). Pure — the page supplies
// the projection and how to date a place.

import type { EdgeType, Period, Place } from "./data/schema.ts"
import { periodsOverlapping, type Span } from "./chronology.ts"

export type MapPlace = {
  id: string
  name: string
  x: number
  y: number
  weight: number // verse count: busier places get labels first
  type?: string
  eras: string[] // period ids
}

// Some places would only stack on another's dot: another name for the same
// place (Antipatris is Aphek), or a spot inside a city (Jerusalem's gates).
// The map draws them as that place; this is the id a place is drawn as.
export function mapStandIn(
  place: Place,
  outgoing: (id: string, type: EdgeType) => string[],
  placeById: (id: string) => Place | undefined,
  seen = new Set<string>(),
): string {
  seen.add(place.id)
  const target =
    outgoing(place.id, "alias-of")[0] ??
    outgoing(place.id, "part-of").find((id) => placeById(id)?.featureType === "City")
  const next = target && !seen.has(target) ? placeById(target) : undefined
  return next ? mapStandIn(next, outgoing, placeById, seen) : place.id
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
        type: p.featureType,
        eras: periods.filter((e) => eras.has(e.id)).map((e) => e.id),
      },
    ]
  }).sort((a, b) => b.weight - a.weight)
}
