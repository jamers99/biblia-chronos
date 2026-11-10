// Review mode's submissions: verdicts on facts, sent as a pre-filled GitHub
// issue and read back by `npm run review:apply` (scripts/review-apply.ts) into
// data/reviews.json. Pure, so the browser and the script share one format.
//
// An issue body holds a fenced block, one verdict per line:
//
//   ```review
//   wrong parent-of:hur_1505>caleb_838@3f9a1c Caleb's father is Hezron (1 Chr 2:18)
//   right occurred-at:paul-arrives-at-rome>rome_1019@b21c00
//   ```
//
// The fact's key (id@hash) ties the verdict to the data the reviewer saw. The
// rest of the body is for people and is ignored.

export const REPO = "jamers99/biblia-chronos"
export const VERDICTS = ["right", "wrong", "unsure"] as const
export type Verdict = (typeof VERDICTS)[number]
export type Pending = Record<string, { verdict: Verdict; note?: string }>

export const NOTE_MAX = 300
// GitHub turns away a new-issue link much past 8,000 characters, and some
// browsers cut it shorter. This leaves room.
export const URL_MAX = 7000

const KEY = /^[a-z-]+:[^\s@`]+@[0-9a-f]{6}$/
const newIssue = (params: Record<string, string>) =>
  `https://github.com/${REPO}/issues/new?${new URLSearchParams(params).toString().replace(/\+/g, "%20")}`

// One line of a note: no line breaks or backticks, which would end the block.
export const cleanNote = (note: string) => note.replace(/[\r\n`]+/g, " ").replace(/\s+/g, " ").trim().slice(0, NOTE_MAX)

export function submissionBody(pending: Pending): string {
  const lines = Object.entries(pending)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, { verdict, note }]) => [verdict, key, note && cleanNote(note)].filter(Boolean).join(" "))
  return [
    "Reviewed in the app's review mode. Anything you add outside the block is read by a person, not by the apply step.",
    "",
    "```review",
    ...lines,
    "```",
    "",
  ].join("\n")
}

export function submissionUrl(pending: Pending): string {
  const n = Object.keys(pending).length
  return newIssue({ template: "review.md", title: `Review: ${n} fact${n === 1 ? "" : "s"}`, body: submissionBody(pending) })
}

// Whether a submission still fits in one link.
export const fits = (pending: Pending) => submissionUrl(pending).length <= URL_MAX

export type Parsed = { reviews: { key: string; verdict: Verdict; note?: string }[]; errors: string[] }

export function parseSubmission(body: string): Parsed {
  const out: Parsed = { reviews: [], errors: [] }
  const block = /```review[^\S\n]*\r?\n([\s\S]*?)\r?\n?```/.exec(body)
  if (!block) return { ...out, errors: ["no ```review block found"] }
  const seen = new Set<string>()
  for (const raw of block[1].split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const [verdict, key, ...rest] = line.split(/\s+/)
    if (!VERDICTS.includes(verdict as Verdict)) out.errors.push(`"${line.slice(0, 80)}": the verdict must be right, wrong, or unsure`)
    else if (!key || !KEY.test(key)) out.errors.push(`"${line.slice(0, 80)}": not a fact key (id@hash)`)
    else if (seen.has(key)) out.errors.push(`${key}: listed twice`)
    else {
      seen.add(key)
      const note = cleanNote(rest.join(" "))
      out.reviews.push({ key, verdict: verdict as Verdict, ...(note ? { note } : {}) })
    }
  }
  return out
}

// "Report a problem": a plain issue, described in the reporter's own words.
export function reportUrl(about: { title: string; page?: string; fact?: string }): string {
  const body = [
    ...(about.page ? [`Page: ${about.page}`] : []),
    ...(about.fact ? [`Fact: \`${about.fact}\``] : []),
    "",
    "What's wrong, or what should change? A verse or source helps.",
    "",
    "",
  ].join("\n")
  return newIssue({ template: "report.md", title: about.title, body })
}
