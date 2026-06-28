import type { DateEstimate } from "./data/schema.ts"

// Upstream years use negative = BCE (e.g. -1574). We present, not reinterpret.
export function formatYear(year: number): string {
  return year < 0 ? `${-year} BC` : `AD ${year}`
}

// A short label for a date estimate, e.g. "1996 BC" or "1897–1750 BC".
export function formatEstimate(d: DateEstimate | undefined): string {
  if (!d) return "—"
  if (d.display) return d.display
  const { earliest, latest } = d
  if (earliest !== undefined && latest !== undefined && earliest !== latest)
    return `${formatYear(earliest)} – ${formatYear(latest)}`
  const single = earliest ?? latest
  return single === undefined ? "—" : formatYear(single)
}
