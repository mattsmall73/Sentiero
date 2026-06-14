// Verification for the coaching CEILING (knowing when to stop).
//
// The coach must anchor the top of the scale to the stated level: when an answer
// would score full marks at that level, it recognises the ceiling and releases
// the student instead of manufacturing another next step; when an answer still
// has real marks to gain, it keeps pushing with concrete steps. This is a REAL
// run: it coaches two answers to the same A-level question and reports, for each,
// whether the ceiling fired (at_ceiling) and whether a next step was produced.
//
// What a pass looks like (human read still required on the wording):
//   - STRONG answer: at_ceiling true, no manufactured next_step, a release line.
//   - MID answer:    at_ceiling false, a concrete next_step present.
// If the strong answer still gets a next step, the coach is marking against
// infinity, not the A-level ceiling. If the mid answer fires the ceiling, the
// stop is firing early. Both are failures.
//
// Run:  ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-coaching-ceiling.ts
// Without a key it exits 0 with a SKIP notice so CI without secrets stays quiet.

import Anthropic from "@anthropic-ai/sdk";
import {
  PRACTICE_MARKING_SYSTEM_PROMPT,
  buildPracticeMarkingUserMessage,
} from "../lib/practice-marking-prompt";
import type { MarkingGuide, PracticeCoaching } from "../lib/practice-db";

const MARKING_MODEL = "claude-opus-4-8";

const SUBJECT = "Politics";
const LEVEL = "A-level";
const TOPIC = "UK pressure groups";
const QUESTION =
  "Evaluate the view that pressure groups undermine rather than strengthen democracy in the UK.";

const MARKING_GUIDE: MarkingGuide = {
  scale_max: 100,
  what_strong_answers_do:
    "A strong A-level answer argues both sides with named, current examples, weighs the strength of each side rather than listing, and reaches a clear, justified judgement on whether pressure groups strengthen or undermine democracy.",
  levels: [
    {
      label: "Strong",
      min: 80,
      max: 100,
      descriptor:
        "Sustained two-sided argument with precise examples, explicit weighing of competing views, and a clear judgement that follows from the analysis - everything the A-level standard asks for.",
    },
    {
      label: "Secure",
      min: 60,
      max: 79,
      descriptor:
        "Both sides covered with at least one developed example each and some evaluation, but the judgement is asserted more than argued, or one side is thinner.",
    },
    {
      label: "Developing",
      min: 40,
      max: 59,
      descriptor:
        "Relevant points on at least one side with a general example, but largely descriptive, little weighing of views, and no clear judgement.",
    },
    {
      label: "Building",
      min: 0,
      max: 39,
      descriptor: "A few relevant assertions, no real example or development, no evaluation.",
    },
  ],
};

// A genuinely strong A-level answer: two sides, precise examples, explicit
// weighing, a judgement that follows. Should reach the A-level ceiling - and the
// coach should release rather than demand undergraduate-style methodological rigour.
const STRONG_ANSWER = `Pressure groups can be argued to undermine democracy, but on balance they strengthen
it. The strongest case against them is inequality of access: insider groups such as the BMA or the CBI
enjoy privileged, routine access to ministers and civil servants that ordinary citizens and outsider
groups cannot match, which distorts policy toward the well-resourced. Elite "revolving door" lobbying
sharpens this, and a handful of wealthy campaigns can drown out diffuse public interests, as critics
argued over fossil-fuel lobbying on climate policy. Set against this, however, pressure groups deepen
democracy in ways elections cannot. They provide participation between elections, represent intense
minority interests that majoritarian voting ignores (Stonewall on LGBT rights, the RNIB for disabled
people), and supply expertise and scrutiny that improve legislation. Outsider methods, from the
Gurkha Justice Campaign to environmental direct action, have forced issues onto the agenda that
parties had ducked. The inequality objection is real but is better met by reforming lobbying
transparency than by treating groups as anti-democratic. Weighing the two, the participation,
representation and scrutiny they add outweigh the access inequality they create, so pressure groups
strengthen UK democracy more than they undermine it, provided their influence stays transparent.`;

// A mid answer: both sides gestured at, one example, thin weighing, asserted
// judgement. Real marks still to gain - the coach must keep pushing.
const MID_ANSWER = `Pressure groups can undermine democracy because some have much more money and access
than others, so they get listened to more. For example big business groups can lobby ministers directly
which ordinary people cannot do, so it is unequal. On the other hand pressure groups can strengthen
democracy because they let people take part between elections and represent minorities who might be
ignored. So overall pressure groups both help and harm democracy depending on which group it is.`;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }
  throw new Error("Model did not return valid JSON.");
}

async function coach(client: Anthropic, answer: string): Promise<PracticeCoaching> {
  const userMessage = buildPracticeMarkingUserMessage({
    subject: SUBJECT,
    level: LEVEL,
    topic: TOPIC,
    question: QUESTION,
    marking_guide: JSON.stringify(MARKING_GUIDE, null, 2),
    answer,
  });
  const response = await client.messages.create({
    model: MARKING_MODEL,
    max_tokens: 4000,
    system: PRACTICE_MARKING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: [{ type: "text", text: userMessage }] }],
  });
  const out = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return extractJson(out) as PracticeCoaching;
}

function report(label: string, c: PracticeCoaching) {
  const nextStep = (c.next_step || "").trim();
  console.log(`\n----- ${label} -----`);
  console.log(`progress: ${c.progress_score}/${c.progress_max}  band: ${c.band_label}  at_ceiling: ${c.at_ceiling === true}`);
  console.log(`next_step ${nextStep ? `PRESENT: ${nextStep}` : "(none)"}`);
  if (c.encouragement) console.log(`release/encouragement: ${c.encouragement}`);
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("SKIP: ANTHROPIC_API_KEY not set - this verification needs live coaching calls.");
    console.log("Run it with: ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-coaching-ceiling.ts");
    return;
  }

  const client = new Anthropic({ apiKey });

  console.log(`Coaching two ${LEVEL} answers to the same question  |  model=${MARKING_MODEL}`);

  const strong = await coach(client, STRONG_ANSWER);
  report("STRONG answer (expect: at_ceiling true, no next step, a release)", strong);

  const mid = await coach(client, MID_ANSWER);
  report("MID answer (expect: at_ceiling false, a concrete next step)", mid);

  console.log("\n===== READ =====");
  const strongReleased = strong.at_ceiling === true && !(strong.next_step || "").trim();
  const midPushed = mid.at_ceiling !== true && Boolean((mid.next_step || "").trim());
  console.log(`STRONG released at the ceiling: ${strongReleased ? "yes" : "NO - still being corrected"}`);
  console.log(`MID still pushed with a next step: ${midPushed ? "yes" : "NO - stop fired early"}`);
  console.log(
    "\nHuman read still required: does the STRONG release land as honest recognition (not flattery),",
  );
  console.log("and does it avoid demanding rigour beyond A-level? Only a person can judge the wording.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
