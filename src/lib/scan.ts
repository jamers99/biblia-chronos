// The text match's rules: does a verse's text state a fact? Pure
// functions over plain strings, used by scripts/audit-scan.ts.
//
// The rules look for the *shape* of a statement ("Isaac, Abraham's son",
// "Abraham begat Isaac"), not just two names near a family word, which would
// pass grandparents and uncles too. They can't tell namesakes apart: a match
// shows the text supports the fact, not that the verse is about this person.

// --- Names --------------------------------------------------------------------

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// A whole-word, case-sensitive pattern for any of a record's names.
// Possessives ("Abraham's") still match, since ' isn't a word character.
export function namePattern(names: string[]): string {
  const alts = [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) => b.length - a.length)
  return `(?<![\\w-])(?:${alts.map(escape).join("|")})(?![\\w-])`
}

export const mentions = (text: string, names: string) => new RegExp(names).test(text)

// --- KJV numbers -----------------------------------------------------------------

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

// "Abraham's", and "Moses’" (the KJV drops the s after an s)
const POSS = `(?:[’']s|(?<=s)[’'])`

// A run of number words, for building patterns.
const NUM = `(?:(?:an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|score|threescore|fourscore|hundred|thousand)(?:\\s+and\\s+|\\s+|-)?)+`

// All the "N years" numbers in a verse that follow `lead` (a regex source).
export function yearsAfter(text: string, lead: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(new RegExp(`${lead}\\s+(${NUM})\\s*years`, "gi"))) {
    const n = kjvNumber(m[1])
    if (n !== undefined) out.push(n)
  }
  return out
}

// --- Relationship rules ------------------------------------------------------------

// Clauses: KJV verses chain statements with ; and :, and a rule should not
// read across them ("Ram begat Amminadab; and Amminadab begat Naashon").
const clauses = (text: string) => text.split(/[.;:?!]/)

// Between a verb and the child: only names, "and", and commas ("Judah begat
// Pharez and Zara"), so "begat Ram, and Ram begat …" can't reach past Ram.
const LIST = `(?:(?:[A-Z][\\w’'-]*|and|also),?\\s+)*?`

// A list of names before the child: names, "and", ordinals ("Jeriah the
// first, Amariah the second"), "duke", with commas; never "X his son".
const ORDINAL = `the\\s+(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eldest|firstborn|chief)`
const ITEMS = `(?:(?:(?:duke\\s+)?(?!\\S+\\s+his\\s+son)[A-Z][\\w’'-]*(?:\\s+${ORDINAL})?|and|also),?\\s+)*?(?:duke\\s+)?`

// Which rule shows `parent` is a parent of `child`, if any. Both are name
// patterns from namePattern.
export function parentRule(text: string, parent: string, child: string): string | undefined {
  const P = parent
  const C = child
  const kin = `(?:son|daughter|sons|daughters)`
  const tests: [string, RegExp][] = [
    ["son-of", new RegExp(`${C},?\\s+(?:(?:which|that|who)\\s+was\\s+)?(?:the\\s+|a\\s+)?${kin}\\s+of\\s+${P}`)],
    ["possessive", new RegExp(`${P}${POSS}\\s+(?:\\w+\\s+)?${kin},?\\s+${C}`)],
    ["possessive", new RegExp(`${C},?\\s+${P}${POSS}\\s+(?:\\w+\\s+)?${kin}`)],
  ]
  for (const clause of clauses(text)) {
    for (const [rule, re] of tests) if (re.test(clause)) return rule
    // "Abraham called the name of his son … Isaac"
    if (new RegExp(`${P}\\s+called\\s+(?:the\\s+)?(?:his\\s+)?name\\s+of\\s+(?:his|her)\\s+(?:son|daughter)[^]*?${C}`).test(clause))
      return "named-child"
    // "Abraham begat Isaac", "Seth lived … and begat Enos"
    if (new RegExp(`${P}(?:(?!\\bbegat\\b)[^])*\\bbegat\\s+${LIST}${C}`).test(clause)) return "begat"
    // "Jochebed … bare unto Amram Aaron and Moses"
    if (new RegExp(`${P}(?:(?!\\bbare\\b)[^])*\\bbare\\s+(?:(?:un)?to\\s+(?:him|[A-Z][\\w’'-]*),?\\s+)?${LIST}${C}`).test(clause)) return "bare"
    if (new RegExp(`\\bbare\\s+(?:unto|to)\\s+${P}\\s+${LIST}${C}`).test(clause)) return "bare"
  }
  // "Rehoboam … reigned seventeen years …; And his mother's name was Naamah"
  if (new RegExp(`${C}[^]*\\bhis\\s+mother[’']s\\s+name\\s+(?:also\\s+)?was\\s+${P}`).test(text)) return "mother-named"
  // "unto Enoch was born Irad", "unto David were sons born …: his firstborn
  // was Amnon"
  for (const clause of clauses(text))
    if (new RegExp(`\\bunto\\s+${P}\\s+(?:was|were)\\s+(?:sons\\s+)?born\\s+${LIST}${C}`).test(clause)) return "born-to"
  // "he begat of Hodesh his wife, Jobab, and Zibia"
  if (new RegExp(`\\bbegat\\s+(?:children\\s+)?of\\s+${P}(?:\\s+his\\s+wife)?,?\\s+${LIST}${C}`).test(text)) return "begat"
  // A chain: "Shemaiah his son, Gog his son, Shimei his son" makes each the
  // son of the one before; the first link starts a list ("sons of Joel;").
  if (new RegExp(`(?:[;:]\\s*${P}|${P}\\s+his\\s+son),\\s+${C}\\s+his\\s+son\\b`).test(text)) return "son-chain"

  // Lists. "The sons of Ham; Cush, and Mizraim", "Of the sons of Hebron;
  // Jeriah the first, Amariah the second", and the other way round: "Azrikam,
  // … and Hanan. All these were the sons of Azel." Only names, "and", and
  // ordinals may stand between the head and the child, so a list can't run
  // on into other words. ("Children of Israel" means Israelites, so it isn't
  // a head.)
  if (new RegExp(`${C},?\\s+(?:the|his)\\s+son\\b`).test(text)) return undefined // "Kish the son of Abdi" is Abdi's
  const head = new RegExp(`\\b(?:sons|daughters)\\s+of\\s+${P}(?:\\s+(?:were|are|was))?[;:,]?\\s+(?:were,?\\s+)?${ITEMS}${C}`)
  if (head.test(text)) return "sons-of-list"
  const tail = new RegExp(`${C}(?:,?\\s+(?:and\\s+)?[A-Z][\\w’'-]*)*,?\\s*(?:[.;:]\\s*)?(?:all\\s+)?these\\s+(?:were|are|be)\\s+the\\s+sons\\s+of\\s+${P}`, "i")
  if (tail.test(text)) return "sons-of-list"
  return undefined
}

// Which rule shows `a` and `b` were married, if any.
export function partnerRule(text: string, a: string, b: string): string | undefined {
  const W = `(?:wife|wives|husband|concubine)`
  for (const [x, y] of [
    [a, b],
    [b, a],
  ]) {
    // "Lamech took unto him two wives: the name of the one was Adah"
    if (new RegExp(`${x}\\s+took\\s+unto\\s+him\\s+\\w+\\s+${W}[^.]*?\\bname\\s+of\\s+the\\s+(?:one|other)\\s+(?:was\\s+)?${y}`).test(text))
      return "took-to-wife"
    for (const clause of clauses(text)) {
      if (new RegExp(`${x}${POSS}\\s+${W},?\\s+(?:\\w+\\s+){0,2}?${y}`).test(clause)) return "wife"
      if (new RegExp(`${y},?\\s+(?:${x}${POSS}\\s+${W}|(?:the\\s+)?${W}\\s+of\\s+${x})`).test(clause)) return "wife"
      if (new RegExp(`name\\s+of\\s+${x}${POSS}\\s+${W}\\s+was\\s+${y}`).test(clause)) return "wife"
      // "Adam knew Eve his wife", "Felix came with his wife Drusilla",
      // "Adam called his wife's name Eve"
      if (new RegExp(`${x}(?:(?!\\b(?:his|her)\\s+${W})[^])*?(?:${y},?\\s+(?:his|her)\\s+${W}|\\b(?:his|her)\\s+${W}(?:${POSS}\\s+name)?,?\\s+${y})`).test(clause))
        return "wife"
      if (new RegExp(`${x}(?:(?!\\btook\\b)[^])*\\btook\\s+(?:him\\s+|unto\\s+him\\s+)?${y}[^]*?\\bto\\s+(?:be\\s+)?(?:his\\s+)?${W}`).test(clause))
        return "took-to-wife"
      if (new RegExp(`${x}(?:(?!\\btook\\b)[^])*\\btook\\s+(?:him\\s+)?(?:a\\s+)?${W},?\\s+(?:\\w+\\s+){0,4}?${y}`).test(clause))
        return "took-to-wife"
    }
  }
  return undefined
}

// Places: "Luz, which is Bethel"; "Bethlehem of Judaea", "Hebron in the land
// of Canaan"; "Bethphage, nigh unto the mount of Olives".
export function sameRule(text: string, a: string, b: string): string | undefined {
  for (const [x, y] of [
    [a, b],
    [b, a],
  ])
    // "Kirjath-arba; the same is Hebron": the KJV often puts a ; before it.
    if (new RegExp(`${x}[,;]?\\s+(?:(?:which|that|the\\s+same)\\s+is\\s+(?:called\\s+)?|(?:which\\s+)?(?:is\\s+)?called\\s+)${y}`).test(text))
      return "same-place"
  return undefined
}

export function inRule(text: string, place: string, container: string): string | undefined {
  for (const clause of clauses(text))
    if (new RegExp(`${place},?\\s+(?:(?:which|that)\\s+is\\s+|(?:which|that)\\s+(?:are|were)\\s+)?(?:in|of|within)\\s+(?:the\\s+(?:land|country|coast|coasts|borders|tribe|wilderness)\\s+of\\s+)?${container}`).test(clause))
      return "place-in"
  return undefined
}

export function nearRule(text: string, place: string, other: string): string | undefined {
  for (const clause of clauses(text))
    if (new RegExp(`${place},?\\s+(?:(?:which|that)\\s+is\\s+)?(?:nigh|near|by|beside|before|over\\s+against)\\s+(?:unto\\s+|to\\s+)?(?:the\\s+\\w+\\s+of\\s+)?${other}`).test(clause))
      return "place-near"
  return undefined
}

const MOVE = /\b(?:went|go|goeth|came|come|cometh|journeyed|fled|dwelt|dwell|abode|sojourned|returned|departed|entered|arrived|sailed|passed|removed|pitched|brought|carried|led|walked|lodged|tarried)\b/

export function wentRule(text: string, person: string, place: string): string | undefined {
  for (const clause of clauses(text))
    if (new RegExp(person).test(clause) && new RegExp(place).test(clause) && MOVE.test(clause)) return "went"
  return undefined
}

export function diedRule(text: string, person: string, place: string): string | undefined {
  if (new RegExp(person).test(text) && new RegExp(place).test(text) && /\b(?:died|dead|die|slew|slain|buried|death|killed)\b/.test(text))
    return "died"
  return undefined
}
