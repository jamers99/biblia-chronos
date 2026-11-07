import { test } from "node:test"
import assert from "node:assert/strict"
import { inRule, kjvNumber, namePattern, parentRule, partnerRule, sameRule, wentRule, yearsAfter } from "./scan.ts"

const n = (...names: string[]) => namePattern(names)

test("kjvNumber reads the KJV's number words", () => {
  assert.equal(kjvNumber("an hundred and five"), 105)
  assert.equal(kjvNumber("two and thirty"), 32)
  assert.equal(kjvNumber("threescore and ten"), 70)
  assert.equal(kjvNumber("nine hundred and thirty"), 930)
  assert.equal(kjvNumber("forty"), 40)
  assert.equal(kjvNumber("many"), undefined)
  assert.deepEqual(yearsAfter("And Seth lived an hundred and five years, and begat Enos", "lived"), [105])
})

test("namePattern matches whole names, possessives included, and alternate names", () => {
  assert.ok(new RegExp(n("Abraham", "Abram")).test("the generations of Isaac, Abraham’s son"))
  assert.ok(!new RegExp(n("Ram")).test("And Abram went up"))
  assert.ok(new RegExp(n("Kirjath-arba")).test("Kirjath-arba; the same is Hebron"))
})

test("parentRule finds parent statements by their shape", () => {
  const gen25 = "And these are the generations of Isaac, Abraham’s son: Abraham begat Isaac:"
  assert.equal(parentRule(gen25, n("Abraham"), n("Isaac")), "possessive")
  assert.equal(parentRule("And Seth lived an hundred and five years, and begat Enos:", n("Seth"), n("Enos")), "begat")
  assert.equal(parentRule("Then stood up Joshua the son of Nun", n("Nun"), n("Joshua")), "son-of")
  assert.equal(parentRule("And Judah begat Phares and Zara of Thamar", n("Judah"), n("Zara")), "begat")
  assert.equal(
    parentRule("and she bare unto Amram Aaron and Moses, and Miriam their sister.", n("Amram"), n("Moses")),
    "bare",
  )
  assert.equal(parentRule("The sons of Ham; Cush, and Mizraim, and Put, and Canaan.", n("Ham"), n("Canaan")), "sons-of-list")
})

test("parentRule doesn't pass grandparents, chains, or someone else's son", () => {
  // Ram is Naashon's grandfather
  assert.equal(parentRule("And Ram begat Amminadab, and Amminadab begat Naashon", n("Ram"), n("Naashon")), undefined)
  // a chain: Libni is Mahli's son, Shimei is Libni's
  const chain = "The sons of Merari; Mahli, Libni his son, Shimei his son, Uzza his son,"
  assert.equal(parentRule(chain, n("Merari"), n("Mahli")), "sons-of-list")
  assert.equal(parentRule(chain, n("Merari"), n("Libni")), undefined)
  assert.equal(parentRule(chain, n("Merari"), n("Shimei")), undefined)
  // a clan: Kish is of the sons of Merari, but the son of Abdi
  const clan = "and of the sons of Merari, Kish the son of Abdi, and Azariah the son of Jehalelel"
  assert.equal(parentRule(clan, n("Merari"), n("Kish")), undefined)
  assert.equal(parentRule(clan, n("Abdi"), n("Kish")), "son-of")
  // two names in one verse with "son" isn't enough
  const exod = "And Eleazar Aaron’s son took him one of the daughters of Putiel to wife; and she bare him Phinehas"
  assert.equal(parentRule(exod, n("Aaron"), n("Phinehas")), undefined)
  assert.equal(parentRule(exod, n("Aaron"), n("Eleazar")), "possessive")
})

test("partnerRule finds marriages", () => {
  const gen11 = "And Abram and Nahor took them wives: the name of Abram’s wife was Sarai; and the name of Nahor’s wife, Milcah"
  assert.equal(partnerRule(gen11, n("Sarai", "Sarah"), n("Abram", "Abraham")), "wife")
  assert.equal(partnerRule("And Isaac was forty years old when he took Rebekah to wife", n("Isaac"), n("Rebekah")), "took-to-wife")
  assert.equal(partnerRule("Isaac and Rebekah went down", n("Isaac"), n("Rebekah")), undefined)
})

test("place rules: the same place, a place within another, going there", () => {
  assert.equal(sameRule("And he called the name of that place Bethel: but the name of that city was called Luz at the first.", n("Luz"), n("Bethel")), undefined)
  assert.equal(sameRule("Kirjath-arba; the same is Hebron in the land of Canaan", n("Hebron"), n("Kirjath-arba")), "same-place")
  assert.equal(inRule("Now when Jesus was born in Bethlehem of Judaea", n("Bethlehem"), n("Judaea")), "place-in")
  assert.equal(wentRule("And Abram went up out of Egypt", n("Abram"), n("Egypt")), "went")
  assert.equal(wentRule("Abram; Egypt", n("Abram"), n("Egypt")), undefined)
})

test("partnerRule reads the KJV's other ways of saying wife", () => {
  assert.equal(partnerRule("And Adam knew Eve his wife; and she conceived", n("Adam"), n("Eve")), "wife")
  assert.equal(partnerRule("And Adam called his wife’s name Eve", n("Eve"), n("Adam")), "wife")
  assert.equal(partnerRule("Then Jethro, Moses’ father in law, took Zipporah, Moses’ wife", n("Zipporah"), n("Moses")), "wife")
  assert.equal(partnerRule("when Felix came with his wife Drusilla, which was a Jewess", n("Felix"), n("Drusilla")), "wife")
  assert.equal(
    partnerRule("And Lamech took unto him two wives: the name of the one was Adah, and the name of the other Zillah.", n("Lamech"), n("Zillah")),
    "took-to-wife",
  )
  // his wife is someone else
  assert.equal(partnerRule("And Abram took Sarai his wife, and Lot his brother’s son", n("Abram"), n("Lot")), undefined)
})
