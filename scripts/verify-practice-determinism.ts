// Verification for the Practice tool's PROGRESS-SCORE consistency.
//
// The progress number is only meaningful if the same answer scores the same way
// each run (the band-consistency requirement the practice tool inherits). This
// is a REAL run, not a build check: it coaches ONE fixed borderline politics
// answer N times with the live PRACTICE_MARKING_SYSTEM_PROMPT and reports the
// spread of progress scores and the band each run landed in.
//
// Like the exam determinism harness, claude-opus-4-8 takes no temperature
// parameter, so any spread is the model's own run-to-run variance plus whatever
// discretion the prompt's banding leaves open. The lever is the prompt's
// band-boundary tie-break (round a borderline answer up, every run). Run this
// before and after a prompt change and compare the spread.
//
// The fixture is deliberately borderline (a real but uneven politics answer that
// sits on the Developing / Secure edge), which is exactly where a band flip would
// show up as a score swing.
//
// Run:  ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-practice-determinism.ts
//       ANTHROPIC_API_KEY=sk-... RUNS=8 npx tsx scripts/verify-practice-determinism.ts
// Without a key it exits 0 with a SKIP notice so CI without secrets stays quiet.

import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import {
  PRACTICE_MARKING_SYSTEM_PROMPT,
  buildPracticeMarkingUserMessage,
} from "../lib/practice-marking-prompt";
import type { MarkingGuide, PracticeCoaching } from "../lib/practice-db";

const MARKING_MODEL = "claude-opus-4-8";

const TOPIC = "UK pressure groups";
const QUESTION =
  "Evaluate the view that pressure groups undermine rather than strengthen democracy in the UK.";

const MARKING_GUIDE: MarkingGuide = {
  scale_max: 100,
  what_strong_answers_do:
    "A strong answer argues both sides with named, current examples (insider vs outsider groups, specific campaigns), weighs the strength of each side rather than listing, and reaches a clear, justified judgement on whether pressure groups strengthen or undermine democracy.",
  levels: [
    {
      label: "Strong",
      min: 80,
      max: 100,
      descriptor:
        "Sustained two-sided argument with precise examples, explicit weighing of competing views, and a clear judgement that follows from the analysis.",
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
      descriptor:
        "A few relevant assertions, no real example or development, no evaluation.",
    },
  ],
};

// Borderline on the Developing / Secure edge: two sides are gestured at and one
// example appears, but the weighing is thin and the judgement is asserted. This
// is the shape most likely to flip between bands run to run.
const ANSWER = `Pressure groups can undermine democracy because some have much more money and
access than others, so they get listened to more. For example big business groups can lobby
ministers directly which ordinary people cannot do, so it is unequal. On the other hand pressure
groups can strengthen democracy because they let people take part between elections and represent
minorities who might be ignored. Groups like trade unions speak for lots of workers. So overall
pressure groups both help and harm democracy depending on which group it is.`;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }
  throw new Error("Model did not return valid JSON.");
}

function spread(nums: number[]): { min: number; max: number; range: number; unique: number[] } {
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max, range: max - min, unique: [...new Set(nums)].sort((a, b) => a - b) };
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("SKIP: ANTHROPIC_API_KEY not set - this verification needs live coaching calls.");
    console.log(
      "Run it with: ANTHROPIC_API_KEY=sk-... RUNS=8 npx tsx scripts/verify-practice-determinism.ts",
    );
    return;
  }

  const runs = Math.max(2, Number(process.env.RUNS ?? 5));

  const userMessage = buildPracticeMarkingUserMessage({
    topic: TOPIC,
    question: QUESTION,
    marking_guide: JSON.stringify(MARKING_GUIDE, null, 2),
    answer: ANSWER,
  });
  const inputHash = createHash("sha256").update(userMessage, "utf8").digest("hex");

  console.log(`\nCoaching the same answer ${runs}x  |  model=${MARKING_MODEL} (no temperature)`);
  console.log(`Input sha256 (identical every run): ${inputHash}\n`);

  const client = new Anthropic({ apiKey });

  const scores: number[] = [];
  const bands: string[] = [];

  for (let i = 0; i < runs; i++) {
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
    const coaching = extractJson(out) as PracticeCoaching;
    scores.push(coaching.progress_score);
    bands.push((coaching.band_label || "?").trim());
    console.log(
      `  run ${i + 1}: progress ${coaching.progress_score}/${coaching.progress_max}  band ${
        coaching.band_label
      }${coaching.borderline ? "  (borderline, rounded up)" : ""}`,
    );
  }

  console.log("\n===== SPREAD =====");
  const s = spread(scores);
  const distinctBands = [...new Set(bands)];
  console.log(
    `Progress score: min ${s.min}, max ${s.max}, RANGE ${s.range}  | values [${s.unique.join(", ")}]`,
  );
  const flip =
    distinctBands.length > 1
      ? `BAND FLIP across ${distinctBands.join(" / ")}`
      : `stayed in ${distinctBands[0]}`;
  console.log(`Band: ${flip}`);

  if (distinctBands.length > 1) {
    console.log(
      "\nNOTE: the band flipped across runs on byte-identical input. The band-boundary tie-break in",
    );
    console.log(
      "PRACTICE_MARKING_SYSTEM_PROMPT (round a borderline answer up, every run) is the lever; tighten the",
    );
    console.log("level descriptors or the tie-break wording and re-run.");
  } else if (s.range > 0) {
    console.log(
      `\nNOTE: band held (${distinctBands[0]}) but the score moved within it by ${s.range}. Anchoring the`,
    );
    console.log("score to the middle of the band more firmly would collapse this. Not a band flip.");
  } else {
    console.log("\nPASS: identical progress score and band across all runs on byte-identical input.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
