// The timeline's kingdoms track: the united monarchy, then Israel and Judah side
// by side, each king a block coloured by his ruling house. Built at build time
// from data/overrides/kingdoms.json and the imported "Reign of X" events, so the
// island gets plain years and only has to scale them.

import type { Event, Kingdom } from "./data/schema.ts"
import { spanOf } from "./chronology.ts"

export type Reign = {
  id: string // the reign's event id, so it selects like any timeline item
  king: string // "Jeroboam II"
  house: string // "House of Jehu"
  tone: number // colour: 0 is the house of David, other houses cycle 1..TONES
  start: number
  end: number
  // 0 for the main line; 1+ for a reign that overlaps it (a co-regency or a
  // rival claimant), drawn as a thin stripe under the main block.
  sub: number
}

// A run of consecutive reigns by one house: a dynasty, as far as the track shows.
export type House = { name: string; tone: number; start: number; end: number }

export type KingdomRow = {
  id: string
  event: string // the kingdom's own span event, selectable from its label
  name: string
  region?: string
  fate?: string
  start: number
  end: number
  // The row it's drawn in, or "all" for a kingdom that overlaps no other (the
  // united monarchy), drawn across every row so the track forks at the split.
  row: number | "all"
  reigns: Reign[]
  houses: House[]
}

export type KingdomTrack = { rows: number; kingdoms: KingdomRow[] }

export const TONES = 5
const DAVID = "House of David"

// Reigns that overlap by a year or less are a hand-over, not a co-regency:
// upstream dates are whole years, so a king's last year is often his
// successor's first.
const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  Math.min(a.end, b.end) - Math.max(a.start, b.start) > 1

export function kingdomTrack(kingdoms: Kingdom[], events: Event[]): KingdomTrack {
  const spans = new Map(events.flatMap((e) => {
    const span = spanOf(e.date)
    return span ? [[e.id, { ...span, name: e.name }] as const] : []
  }))

  // Colours follow the order houses first appear, so neighbours always differ
  // and a house keeps its colour across kingdoms (Athaliah, of Ahab's house,
  // on Judah's throne).
  const tones = new Map<string, number>([[DAVID, 0]])
  const tone = (house: string) => {
    if (!tones.has(house)) tones.set(house, ((tones.size - 1) % TONES) + 1)
    return tones.get(house)!
  }

  const rows = kingdoms.map((k) => {
    const span = spans.get(k.event)!
    const reigns: Reign[] = k.reigns.flatMap((r) => {
      const s = spans.get(r.event)
      return s ? [{ id: r.event, king: s.name.replace(/^Reign of /, ""), house: r.house, tone: tone(r.house), start: s.start, end: s.end, sub: 0 }] : []
    })

    // Longest reigns claim the main line; shorter overlapping ones step down.
    const lanes: Reign[][] = []
    for (const r of [...reigns].sort((a, b) => b.end - b.start - (a.end - a.start))) {
      let lane = lanes.findIndex((l) => !l.some((o) => overlaps(o, r)))
      if (lane === -1) lane = lanes.push([]) - 1
      lanes[lane].push(r)
      r.sub = lane
    }

    const houses: House[] = []
    for (const r of reigns) {
      const last = houses[houses.length - 1]
      if (last?.name === r.house) last.end = Math.max(last.end, r.end)
      else houses.push({ name: r.house, tone: r.tone, start: r.start, end: r.end })
    }

    return {
      id: k.id,
      event: k.event,
      name: k.name,
      region: k.region,
      fate: k.fate,
      start: span.start,
      end: span.end,
      row: 0 as number | "all",
      reigns,
      houses,
    }
  })

  // Kingdoms that overlap in time get rows of their own, in file order; one
  // that overlaps none spans them all.
  let count = 0
  for (const k of rows) {
    const rivals = rows.filter((o) => o !== k && overlaps(o, k))
    if (!rivals.length) k.row = "all"
    else k.row = count++
  }
  return { rows: Math.max(1, count), kingdoms: rows }
}

// --- Labels -------------------------------------------------------------------

export type TrackLabel = { text: string; start: number; end: number; width: number }

// Place a row of labels left to right, each at the start of its range in
// pixels but sticking to the left edge while the range runs off-screen, and
// never overlapping the one before. A label that no longer fits in its range
// is dropped. Returns each kept label's x.
export function placeLabels<T extends TrackLabel>(labels: T[], edge = 6, gap = 12): (T & { x: number })[] {
  const out: (T & { x: number })[] = []
  let next = -Infinity
  for (const l of labels) {
    const x = Math.max(l.start + 4, edge, next)
    if (x + l.width > l.end - 4) continue
    out.push({ ...l, x })
    next = x + l.width + gap
  }
  return out
}
