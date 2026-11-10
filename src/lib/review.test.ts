import { test } from "node:test"
import assert from "node:assert/strict"
import { URL_MAX, fits, parseSubmission, reportUrl, submissionBody, submissionUrl, type Pending } from "./review.ts"

const pending: Pending = {
  "parent-of:hur_1505>caleb_838@3f9a1c": { verdict: "wrong", note: "Caleb's father is Hezron\n(1 Chr 2:18) `x`" },
  "occurred-at:paul-arrives-at-rome>rome_1019@b21c00": { verdict: "right" },
}

test("a submission reads back as it was written, notes on one line", () => {
  const { reviews, errors } = parseSubmission(submissionBody(pending))
  assert.deepEqual(errors, [])
  assert.deepEqual(reviews, [
    { key: "occurred-at:paul-arrives-at-rome>rome_1019@b21c00", verdict: "right" },
    { key: "parent-of:hur_1505>caleb_838@3f9a1c", verdict: "wrong", note: "Caleb's father is Hezron (1 Chr 2:18) x" },
  ])
})

test("parsing ignores text around the block and reports bad lines", () => {
  const body = "Thanks!\r\n\r\n```review\r\nright date:e@abcdef\r\nmaybe date:f@abcdef\r\nwrong nonsense\r\nright date:e@abcdef\r\n```\r\nMore words"
  const { reviews, errors } = parseSubmission(body)
  assert.deepEqual(reviews, [{ key: "date:e@abcdef", verdict: "right" }])
  assert.equal(errors.length, 3)
  assert.deepEqual(parseSubmission("no block").errors, ["no ```review block found"])
})

test("links go to the repository's templates and stay under the length limit", () => {
  const link = new URL(submissionUrl(pending))
  assert.equal(link.pathname, "/jamers99/biblia-chronos/issues/new")
  assert.equal(link.searchParams.get("template"), "review.md")
  assert.equal(link.searchParams.get("title"), "Review: 2 facts")
  assert.ok(fits(pending))
  const many: Pending = {}
  for (let i = 0; i < 400; i++) many[`participated-in:someone_${i}>an-event-with-a-long-name@abcdef`] = { verdict: "right" }
  assert.ok(!fits(many) && submissionUrl(many).length > URL_MAX)

  const report = new URL(reportUrl({ title: "Problem: Abraham", page: "https://x/people/abraham/", fact: "date:e@abcdef" }))
  assert.equal(report.searchParams.get("template"), "report.md")
  assert.match(report.searchParams.get("body")!, /Fact: `date:e@abcdef`/)
})
