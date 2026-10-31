import type { DateEstimate } from "./data/schema.ts"

// Upstream years use negative = BCE (e.g. -1574). We present, not reinterpret.
export function formatYear(year: number): string {
  return year < 0 ? `${-year} BC` : `AD ${year}`
}

// A span of years: "1996–1706 BC", "AD 30–96", "4 BC – AD 30", or one year.
export function formatSpan(start: number, end: number): string {
  if (start === end) return formatYear(start)
  if (end < 0) return `${-start}–${-end} BC`
  if (start >= 0) return `AD ${start}–${end}`
  return `${formatYear(start)} – ${formatYear(end)}`
}

// A short label for a date estimate, e.g. "1996 BC" or "1897–1750 BC".
export function formatEstimate(d: DateEstimate | undefined): string {
  if (!d) return "—"
  if (d.display) return d.display
  const { earliest, latest } = d
  if (earliest !== undefined && latest !== undefined) return formatSpan(earliest, latest)
  const single = earliest ?? latest
  return single === undefined ? "—" : formatYear(single)
}

// The first sentence (or so) of a long description, for previews.
export function summarize(text: string | undefined, max = 220): string | undefined {
  if (!text) return undefined
  const first = text.trim().split(/\n/)[0]
  const sentence = first.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? first
  return sentence.length <= max ? sentence : sentence.slice(0, max).replace(/\s+\S*$/, "") + "…"
}
