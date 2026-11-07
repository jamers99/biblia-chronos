// The text match's rules: does a verse's text state a fact? Pure functions
// over plain strings, used by scripts/audit-scan.ts.
//
// The rules look for the *shape* of a statement ("Isaac, Abraham's son",
// "Abraham begat Isaac"), not just two names near a family word, which would
// pass grandparents and uncles too. They can't tell namesakes apart: a match
// shows the text supports the fact, not that the verse is about this person.
//
// Each rule has a name, and RULES says what it means to a reader.

export const RULES: Record<string, string> = {
  "son-of": "the verse calls one the son or daughter of the other",
  possessive: "the verse calls one the other's son or daughter",
  "named-child": "the verse names the child at birth",
  begat: "the verse says one begat the other",
  bare: "the verse says she bare him",
  "mother-named": "the verse names his mother",
  "born-to": "the verse says the child was born to the parent",
  "son-chain": "the verse's chain of names makes the child the son of the one before",
  "sons-of-list": "the verse lists the child among the sons of the parent",
  wife: "the verse calls her his wife",
  "took-to-wife": "the verse says he took her to wife",
  "tribe-of": "the verse names the tribe",
  descent: "worked out from recorded parents back to the tribe's founder",
  listed: "named in the passage that lists them",
  "in-passage": "named in the event's passage (not necessarily as taking part)",
  went: "the verse has them going to or staying at the place",
  died: "the verse has them dying or buried there",
  "same-place": "the verse says one place is the other",
  "place-in": "the verse places one within the other",
  "place-near": "the verse puts one place near the other",
  "territory-list": "listed under the tribe's heading in the list of its towns",
  "reign-length": "the verse gives the length of the reign, matching the dates",
  "age-at-fatherhood": "the verse gives the father's age at the birth, matching the dates",
  "age-at-death": "the verse gives the age at death, matching the dates",
}

// --- Names ----------------------------------------------------------------------

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// A whole-word, case-sensitive pattern for any of a record's names.
// Possessives ("Abraham's") still match, since ' isn't a word character.
export function namePattern(names: string[]): string {
  const alts = [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) => b.length - a.length)
  return `(?<![\\w-])(?:${alts.map(escape).join("|")})(?![\\w-])`
}

export const mentions = (text: string, names: string) => new RegExp(names).test(text)

// --- KJV numbers ----------------------------------------------------------------

const UNITS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, score: 20, threescore: 60, fourscore: 80,
}

// "an hundred and five" → 105, "two and thirty" → 32, "threescore and ten" →
// 70, "nine hundred and thirty" → 930. Undefined if it isn't a number.
export function kjvNumber(words: string): number | undefined {
  let total = 0
  let group = 0
  let any = false
  for (const w of words.toLowerCase().split(/[\s-]+/).filter(Boolean)) {
    if (w === "and") continue
    if (w === "hundred") group = (group || 1) * 100
    else if (w === "thousand") {
      total += (group || 1) * 1000
      group = 0
    } else if (w in UNITS) group += UNITS[w]
    else return undefined
    any = true
  }
  return any ? total + group : undefined
}

const NUMBER_WORDS = [...Object.keys(UNITS), "hundred", "thousand"].sort((a, b) => b.length - a.length)
const NUM = `(?:(?:${NUMBER_WORDS.join("|")})(?:\\s+and\\s+|\\s+|-)?)+`

// All the "N years" numbers in a verse that follow any of `leads`
// ("lived", "reigned").
export function yearsAfter(text: string, ...leads: string[]): number[] {
  const re = new RegExp(`\\b(?:${leads.join("|")})\\s+(${NUM})\\s*years`, "gi")
  return [...text.matchAll(re)].map((m) => kjvNumber(m[1])).filter((n) => n !== undefined)
}

// --- Rule tables ----------------------------------------------------------------

// A rule: its name, its pattern, and whether it may read across a verse's
// clauses. Most may not: KJV verses chain statements with ; and :, and "Ram
// begat Amminadab; and Amminadab begat Naashon" mustn't make Ram Naashon's
// father. The first rule that matches names the match.
type Rule = [name: string, pattern: RegExp, wholeVerse?: true]

const clauses = (text: string) => text.split(/[.;:?!]/)

function firstRule(text: string, rules: Rule[]): string | undefined {
  const parts = clauses(text)
  for (const [name, re, whole] of rules) if (whole ? re.test(text) : parts.some((c) => re.test(c))) return name
  return undefined
}

// "Abraham's", and "Moses’" (the KJV drops the s after an s).
const POSS = `(?:[’']s|(?<=s)[’'])`
const NAME = `[A-Z][\\w’'-]*`
// Between a verb and the child: only names, "and", and commas ("Judah begat
// Pharez and Zara"), so "begat Ram, and Ram begat …" can't reach past Ram.
const LIST = `(?:(?:${NAME}|and|also),?\\s+)*?`
// A list before the child may also carry ordinals ("Jeriah the first,
// Amariah the second") and "duke", but never "X his son" (a chain).
const ORDINAL = `the\\s+(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eldest|firstborn|chief)`
const ITEMS = `(?:(?:(?:duke\\s+)?(?!\\S+\\s+his\\s+son)${NAME}(?:\\s+${ORDINAL})?|and|also),?\\s+)*?(?:duke\\s+)?`

// Which rule shows `P` is a parent of `C`, if any (both from namePattern).
export function parentRule(text: string, P: string, C: string): string | undefined {
  const kin = `(?:son|daughter|sons|daughters)`
  const rules: Rule[] = [
    ["son-of", new RegExp(`${C},?\\s+(?:(?:which|that|who)\\s+was\\s+)?(?:the\\s+|a\\s+)?${kin}\\s+of\\s+${P}`)],
    ["possessive", new RegExp(`${P}${POSS}\\s+(?:\\w+\\s+)?${kin},?\\s+${C}|${C},?\\s+${P}${POSS}\\s+(?:\\w+\\s+)?${kin}`)],
    // "Abraham called the name of his son … Isaac"
    ["named-child", new RegExp(`${P}\\s+called\\s+(?:the\\s+)?(?:his\\s+)?name\\s+of\\s+(?:his|her)\\s+(?:son|daughter)[^]*?${C}`)],
    // "Abraham begat Isaac", "Seth lived … and begat Enos"
    ["begat", new RegExp(`${P}(?:(?!\\bbegat\\b)[^])*\\bbegat\\s+${LIST}${C}`)],
    // "Jochebed … bare unto Amram Aaron and Moses", "Sarah bare to him, Isaac"
    ["bare", new RegExp(`${P}(?:(?!\\bbare\\b)[^])*\\bbare\\s+(?:(?:un)?to\\s+(?:him|${NAME}),?\\s+)?${LIST}${C}|\\bbare\\s+(?:un)?to\\s+${P}\\s+${LIST}${C}`)],
    // "Rehoboam … reigned seventeen years …; And his mother's name was Naamah"
    ["mother-named", new RegExp(`${C}[^]*\\bhis\\s+mother[’']s\\s+name\\s+(?:also\\s+)?was\\s+${P}`), true],
    // "unto Enoch was born Irad", "unto David were sons born"
    ["born-to", new RegExp(`\\bunto\\s+${P}\\s+(?:was|were)\\s+(?:sons\\s+)?born\\s+${LIST}${C}`)],
    // "he begat of Hodesh his wife, Jobab"
    ["begat", new RegExp(`\\bbegat\\s+(?:children\\s+)?of\\s+${P}(?:\\s+his\\s+wife)?,?\\s+${LIST}${C}`), true],
    // "Shemaiah his son, Gog his son": each the son of the one before; the
    // first link starts a list ("the sons of Joel; Shemaiah his son").
    ["son-chain", new RegExp(`(?:[;:]\\s*${P}|${P}\\s+his\\s+son),\\s+${C}\\s+his\\s+son\\b`), true],
  ]
  // Lists: "The sons of Ham; Cush, and Mizraim", and the other way round,
  // "Azrikam, … and Hanan. All these were the sons of Azel." ("Children of
  // Israel" means Israelites, so it isn't a head.) Not for a child given his
  // own father in the verse: "of the sons of Merari, Kish the son of Abdi".
  const lists: Rule[] = [
    ["sons-of-list", new RegExp(`\\b(?:sons|daughters)\\s+of\\s+${P}(?:\\s+(?:were|are|was))?[;:,]?\\s+(?:were,?\\s+)?${ITEMS}${C}`), true],
    ["sons-of-list", new RegExp(`${C}(?:,?\\s+(?:and\\s+)?${NAME})*,?\\s*(?:[.;:]\\s*)?(?:all\\s+)?these\\s+(?:were|are|be)\\s+the\\s+sons\\s+of\\s+${P}`, "i"), true],
  ]
  const ownFather = new RegExp(`${C},?\\s+(?:the|his)\\s+son\\b`).test(text)
  return firstRule(text, ownFather ? rules : [...rules, ...lists])
}

// Which rule shows `a` and `b` were married, if any (either way round).
export function partnerRule(text: string, a: string, b: string): string | undefined {
  const W = `(?:wife|wives|husband|concubine)`
  const rules = (x: string, y: string): Rule[] => [
    // "Lamech took unto him two wives: the name of the one was Adah"
    ["took-to-wife", new RegExp(`${x}\\s+took\\s+unto\\s+him\\s+\\w+\\s+${W}[^.]*?\\bname\\s+of\\s+the\\s+(?:one|other)\\s+(?:was\\s+)?${y}`), true],
    // "Abram's wife was Sarai", "Zipporah, Moses' wife", "the wife of Uriah"
    ["wife", new RegExp(`${x}${POSS}\\s+${W},?\\s+(?:\\w+\\s+){0,2}?${y}|${y},?\\s+(?:${x}${POSS}\\s+${W}|(?:the\\s+)?${W}\\s+of\\s+${x})`)],
    // "Adam knew Eve his wife", "Felix came with his wife Drusilla",
    // "Adam called his wife's name Eve"
    ["wife", new RegExp(`${x}(?:(?!\\b(?:his|her)\\s+${W})[^])*?(?:${y},?\\s+(?:his|her)\\s+${W}|\\b(?:his|her)\\s+${W}(?:${POSS}\\s+name)?,?\\s+${y})`)],
    // "Isaac … took Rebekah to wife", "took a wife, … Keturah"
    ["took-to-wife", new RegExp(`${x}(?:(?!\\btook\\b)[^])*\\btook\\s+(?:him\\s+|unto\\s+him\\s+)?(?:${y}[^]*?\\bto\\s+(?:be\\s+)?(?:his\\s+)?${W}|(?:a\\s+)?${W},?\\s+(?:\\w+\\s+){0,4}?${y})`)],
  ]
  return firstRule(text, [...rules(a, b), ...rules(b, a)])
}

// --- Places ---------------------------------------------------------------------

// "Luz, which is Bethel"; "Kirjath-arba; the same is Hebron" (the KJV often
// puts a ; before it, so this reads across clauses).
export const sameRule = (text: string, a: string, b: string) => {
  const is = `[,;]?\\s+(?:(?:which|that|the\\s+same)\\s+is\\s+(?:called\\s+)?|(?:which\\s+)?(?:is\\s+)?called\\s+)`
  return firstRule(text, [["same-place", new RegExp(`${a}${is}${b}|${b}${is}${a}`), true]])
}

// "Bethlehem of Judaea", "Hebron in the land of Canaan"
export const inRule = (text: string, place: string, container: string) =>
  firstRule(text, [
    ["place-in", new RegExp(`${place},?\\s+(?:(?:which|that)\\s+(?:is|are|were)\\s+)?(?:in|of|within)\\s+(?:the\\s+(?:land|country|coasts?|borders|tribe|wilderness)\\s+of\\s+)?${container}`)],
  ])

// "Bethphage, nigh unto the mount of Olives"
export const nearRule = (text: string, place: string, other: string) =>
  firstRule(text, [
    ["place-near", new RegExp(`${place},?\\s+(?:(?:which|that)\\s+is\\s+)?(?:nigh|near|by|beside|before|over\\s+against)\\s+(?:unto\\s+|to\\s+)?(?:the\\s+\\w+\\s+of\\s+)?${other}`)],
  ])

const MOVE = /\b(?:went|go|goeth|came|come|cometh|journeyed|fled|dwelt|dwell|abode|sojourned|returned|departed|entered|arrived|sailed|passed|removed|pitched|brought|carried|led|walked|lodged|tarried)\b/
const DIE = /\b(?:died|dead|die|slew|slain|buried|death|killed)\b/

// Both named in one clause with a verb of going or staying.
export const wentRule = (text: string, person: string, place: string) =>
  clauses(text).some((c) => mentions(c, person) && mentions(c, place) && MOVE.test(c)) ? "went" : undefined

// Both named in the verse, with a death.
export const diedRule = (text: string, person: string, place: string) =>
  mentions(text, person) && mentions(text, place) && DIE.test(text) ? "died" : undefined
