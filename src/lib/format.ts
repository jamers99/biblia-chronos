import type { DateEstimate } from "./data/schema.ts"
import { spanOf } from "./chronology.ts"

// Years are astronomical (ISO 8601), as upstream: 0 is 1 BC, -1573 is 1574 BC.
const bc = (year: number) => 1 - year

export function formatYear(year: number): string {
  return year <= 0 ? `${bc(year)} BC` : `AD ${year}`
}

// A span of years: "1996–1706 BC", "AD 30–96", "4 BC – AD 30", or one year.
export function formatSpan(start: number, end: number): string {
  if (start === end) return formatYear(start)
  if (end <= 0) return `${bc(start)}–${bc(end)} BC`
  if (start > 0) return `AD ${start}–${end}`
  return `${formatYear(start)} – ${formatYear(end)}`
}

// A short label for a date estimate, e.g. "1996 BC" or "1897–1750 BC".
export function formatEstimate(d: DateEstimate | undefined): string {
  if (d?.display) return d.display
  const span = spanOf(d)
  return span ? formatSpan(span.start, span.end) : "—"
}

// Abbreviations Easton's uses mid-sentence before a capital ("A.D. Herod").
const ABBREVIATIONS = new Set(["B.C", "A.D", "A.V", "R.V", "St", "Mt", "cf", "i.e", "e.g", "viz", "comp", "ver", "ch"])

// The first sentence of a long description, for previews. A sentence ends at
// . ! or ? followed by a space and a new sentence — but not inside
// parentheses, where Easton's puts its scripture refs ("named (Gen. 11:27)
// before his brothers"), and not at an abbreviation: "1 Chr. 6:44" and
// "B.C. 459" carry on, so a summary never stops mid-citation or mid-date.
export function summarize(text: string | undefined, max = 220): string | undefined {
  if (!text) return undefined
  const first = text.trim().split("\n")[0]
  let depth = 0
  let end = first.length
  for (let i = 0; i < first.length; i++) {
    const c = first[i]
    if (c === "(") depth++
    else if (c === ")") depth = Math.max(0, depth - 1)
    else if (depth === 0 && ".!?".includes(c) && endsSentence(first, i)) {
      end = i + 1
      break
    }
  }
  const sentence = first.slice(0, end)
  return sentence.length <= max ? sentence : sentence.slice(0, max).replace(/\s+\S*$/, "") + "…"
}

// Whether the punctuation at `i` ends a sentence: it's last, or a space and
// something that can start a sentence follow, and it isn't an abbreviation.
function endsSentence(text: string, i: number): boolean {
  if (i + 1 === text.length) return true
  if (text[i + 1] !== " ") return false
  const next = text.slice(i + 1).trimStart()[0]
  if (!next || /[a-z0-9(]/.test(next)) return false
  const word = /(\S+)$/.exec(text.slice(0, i))?.[1] ?? ""
  return text[i] !== "." || !ABBREVIATIONS.has(word)
}

// Rough rendered width of a 12px sans label, for laying out SVG text without
// measuring it.
export const labelWidth = (text: string) => text.length * 6.6

// How to name a record in a link. People share names (there are many
// Zechariahs), so use the disambiguated display title when there is one.
export const label = (e: { name: string; displayTitle?: string }) => e.displayTitle ?? e.name
