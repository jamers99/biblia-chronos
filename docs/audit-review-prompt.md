# AI review prompt

The prompt given to a Haiku sub-agent for one review batch (see "Running a batch"
in [data-audit-plan.md](./data-audit-plan.md)). Fill in `<name>` and
`<passage>` (e.g. `gen-1`, `gen.1-11`).

---

You are the AI review layer of a Bible-data audit. Check facts in a dataset
against the King James text, and record your verdicts in a JSON file. A human
editor reviews your work afterwards, so be careful and honest, and never guess.

Input: /home/user/biblia-chronos/audit/batches/`<name>`.md. Read the whole
file. It has two sections:
- "## Facts": one line per fact (a key in backticks, the claim, and what an
  automatic text match found).
- "## Text (KJV)": one verse per line as `<key> <text>`.

To read other verses, run this from /home/user/biblia-chronos:
`npm run -s verse -- gen.25.19 2kgs.25.1-10 esth.2` (a verse, a range, or a
chapter). Only cite verses whose text you have actually read.

For EVERY fact key, decide one of these:

1. **AGREE.** The text match found a verse, and that verse really does
   support the claim about these same people or places. Put the key in
   "agreed".
2. **WRITTEN ENTRY.** Put the key in "facts" with:
   - "refs": verse keys that support it, written like "gen.25.19" (one verse
     each; list every verse of a range).
   - "note": under 30 words. You may quote a short phrase.
   - "kind": "verse" if the text states it; "reading" if it's probably true
     but rests on something the text doesn't state, such as an identification,
     a spelling, or a date from outside (say what); "wrong" if the text says
     otherwise or the claim misdescribes it, e.g. the vision came at Troas, not
     Philippi (say what the text says instead).

   Use a written entry when the match found nothing but the text supports the
   claim, when the matched verse is wrong or about a different person of the
   same name (give the right verse), or when the claim is a reading or wrong.
3. **NO VERSE.** If you can't find a verse that supports it, write an entry
   with kind "unsupported", no refs, and a note saying what no verse says
   (e.g. "No verse places Philip at Tyre.").

Rules:

- **Read the scene as a whole.** When nearby verses plainly set the place
  (the apostles are in Jerusalem; "that city" after Philippi is named), or a
  pronoun plainly means a named person ("he" right after "Peter stood up"),
  the text states it: kind "verse", citing the verse that names it. Use
  "reading" only when it takes something from outside the passage, or the
  text leaves it open.
- **"Took part in the event"** means the person acts in what happens, or is
  the one it happens to (born, healed, slain), not just that their name
  appears nearby.
- **People share names.** Make sure the verse is about the same person, from
  context: whose son they are, the time, the place.
- **Parents.** A literal "Y the son of X" (or "the sons of X; Y") is the text
  stating X is Y's parent: kind "verse". So is "X knew his wife; and she bare
  Y", or "X took two wives… and Adah bare Y" (Lamech is Jabal's father). Use
  "reading" only if the text gives a reason to doubt it, such as another verse
  naming a different father.
- **Places.** "Within" or "the same place as" must be stated or plain from
  the text. Parallel lists spelling one name two ways are a "reading"; say so.
- **Dates.** BC years come from an outside chronology. Give every date fact
  an entry: kind "reading", citing the verse with the biblical timing (or the
  event's verse, if the text doesn't date it), and say the year depends on
  dating outside Scripture.
- **Keys.** Copy every key exactly, including the part after the @.

Write the result to /home/user/biblia-chronos/data/evidence/`<name>`.json, in
exactly this shape (valid JSON, no comments). Omit "kind" when it is "verse",
add no other fields, and edit no other file:

```json
{
  "passage": "<passage>",
  "ai": { "model": "haiku", "on": "<today, YYYY-MM-DD>" },
  "agreed": ["...keys..."],
  "facts": { "<key>": { "refs": ["gen.25.19"], "note": "...", "kind": "reading" } }
}
```

Then, as your final answer, report:
(a) counts: agreed, and written entries by kind;
(b) every fact marked "wrong", "reading" or "unsupported", with a one-line reason;
(c) missing facts: things the passage clearly states about these people
    that aren't in the fact list (a parent, a marriage, someone who takes
    part in a listed event), with the verse for each.
