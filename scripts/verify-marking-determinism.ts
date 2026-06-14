// Verification for marking REPRODUCIBILITY (the 13/9/13 swing investigation).
//
// This is a REAL run, not a build check. It marks ONE fixed answer N times with
// the live MARKING_SYSTEM_PROMPT and reports the spread of marks across runs.
//
// IMPORTANT: claude-opus-4-8 does NOT accept a temperature (or top_p / top_k)
// parameter - the Opus 4.7/4.8 family removed sampling controls, and sending one
// returns 400 "temperature is deprecated for this model". So there is no
// temperature knob to turn down: this harness sends exactly what the product
// sends (no sampling param) and measures the spread that remains. That spread is
// the model's own run-to-run nondeterminism plus any discretion the prompt leaves
// open - it is NOT sampling noise, because there is no sampling parameter in play.
//
// What the harness isolates:
//
//   1. BYTE-IDENTICAL INPUT. The marking user message is built ONCE, hashed, and
//      the exact same string is sent on every run. The script prints the hash so
//      you can see the input never varied. (In production the same guarantee holds
//      structurally: marking reads paper_text / mark_scheme_text /
//      examiner_report_text / parsed_structure straight from immutable DB columns,
//      and buildMarkingUserMessage is a pure function - no cache or report path
//      mutates the marking input between sits. The caches live upstream at upload.)
//      So any spread the harness reports is the model call, not the input.
//
//   2. PROMPT ANCHORING - the real lever here. The fixture is a 30-mark,
//      level-banded essay question, the same shape as the reported case. The
//      per-question spread table flags whether the variance is a within-band
//      wobble or a band-boundary FLIP (e.g. Level 3 11-15 <-> Level 2 6-10, which
//      is exactly the 13<->9 swing). Since temperature can't be lowered, tightening
//      the mark scheme's within-band / boundary guidance in MARKING_SYSTEM_PROMPT
//      is the lever to test: run this harness before and after a prompt change and
//      compare the spread.
//
// Run:  ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-marking-determinism.ts
//       ANTHROPIC_API_KEY=sk-... RUNS=8 npx tsx scripts/verify-marking-determinism.ts
// Without a key it exits 0 with a SKIP notice (so CI without secrets is quiet),
// printing the live command to run.

import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { MARKING_SYSTEM_PROMPT, buildMarkingUserMessage } from "../lib/exam-marking-prompt";
import type { MarkingResults, ParsedPaper } from "../lib/exam-db";

const MARKING_MODEL = "claude-opus-4-8";

// A realistic 30-mark, level-banded essay question - the shape that swung 13/9/13.
// Shared with verify-overall-feedback.ts so the fixture stays one recognisable case.
const PAPER_TITLE = "AQA English Literature Paper 1 - Shakespeare and the 19th-century novel";

const EXAMINER_REPORT = `Stronger responses to the Hamlet extract tracked the shift in Hamlet's
state across the speech and used short, embedded quotation to anchor each point.
The best answers were alert to staging and to the pressure of the soliloquy form.
Weaker responses retold the plot. In Section 2, the strongest essays kept a clear
line of argument about the whole novel rather than narrating chapter by chapter.
Many candidates managed their time poorly and left Section 2 thin or unstarted.`;

const PAPER_TEXT = `Section 1: Shakespeare - Hamlet
Read the extract from Act 3 Scene 1 (the "To be or not to be" soliloquy) and then
answer the question.
Q1. Starting with this speech, explore how Shakespeare presents Hamlet's state of
mind. Write about: how Shakespeare presents Hamlet's state of mind in this extract;
how Shakespeare presents Hamlet's state of mind in the play as a whole. [30 marks]

Section 2: The 19th-century novel
Q2. Answer ONE question on the novel you have studied. Explore how far the novel
presents its central character as trapped by circumstance. [30 marks]`;

const MARK_SCHEME = `Q1 (30 marks): AO1, AO2, AO3 weighted as per the assessment grid.
Level 6 (26-30): critical, exploratory, conceptualised response; precise analysis
of language, form and structure; perceptive use of subject terminology.
Level 5 (21-25): thoughtful, developed response; examines effects of writer's
methods with apt references.
Level 4 (16-20): clear, explained response; clear understanding of methods.
Level 3 (11-15): some explained response with some references.
Level 2 (6-10): supported, straightforward response; some awareness of meaning.
Level 1 (1-5): simple comments; reference to detail.
Indicative content: the soliloquy form; antithesis of "to be / not to be";
imagery of sleep and death; Hamlet's hesitation and the staging of private thought.

Q2 (30 marks): same level descriptors applied to the chosen novel. Reward a
sustained argument about character and circumstance over plot narration.
Total available: 60 marks.`;

const PARSED_STRUCTURE: ParsedPaper = {
  paper_title: PAPER_TITLE,
  total_marks: 60,
  sections: [
    {
      title: "Section 1: Shakespeare - Hamlet",
      questions: [
        {
          number: "1",
          text: "Starting with this speech, explore how Shakespeare presents Hamlet's state of mind.",
          marks: 30,
        },
      ],
    },
    {
      title: "Section 2: The 19th-century novel",
      questions: [
        {
          number: "2",
          text: "Explore how far the novel presents its central character as trapped by circumstance.",
          marks: 30,
        },
      ],
    },
  ],
};

// A genuinely borderline Q1 answer - has real analysis but is uneven - so it sits
// near a band edge, which is exactly where sampling noise shows up as a mark swing.
// Q2 is left blank (a rightful focusing choice on this paper).
const ANSWERS: Record<string, string> = {
  "1": `Shakespeare opens with "To be, or not to be", which sets up Hamlet's choice
between living and dying. The soliloquy form means we hear his private thoughts and
nobody else is there, so it feels honest. He uses the metaphor of sleep, "to sleep,
perchance to dream", to make death sound peaceful, but then he worries about the
dreams which could be bad. This shows he cannot make his mind up. Later in the play
Hamlet also delays killing Claudius, so this links to his hesitation. The language
of "slings and arrows" is a metaphor for the troubles he faces. Overall the speech
shows a confused state of mind because he keeps going back and forth.`,
  "2": "",
};

const ANSWERS_TEXT = [
  "--- Section 1: Shakespeare - Hamlet ---",
  "Q1 (30 marks): Starting with this speech, explore how Shakespeare presents Hamlet's state of mind.",
  `Answer: ${ANSWERS["1"].trim()}`,
  "",
  "--- Section 2: The 19th-century novel ---",
  "Q2 (30 marks): Explore how far the novel presents its central character as trapped by circumstance.",
  "Answer: (left blank)",
  "",
].join("\n");

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }
  throw new Error("Model did not return valid JSON.");
}

function bandFor(mark: number): string {
  if (mark >= 26) return "L6 (26-30)";
  if (mark >= 21) return "L5 (21-25)";
  if (mark >= 16) return "L4 (16-20)";
  if (mark >= 11) return "L3 (11-15)";
  if (mark >= 6) return "L2 (6-10)";
  if (mark >= 1) return "L1 (1-5)";
  return "0";
}

function spread(nums: number[]): { min: number; max: number; range: number; unique: number[] } {
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max, range: max - min, unique: [...new Set(nums)].sort((a, b) => a - b) };
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("SKIP: ANTHROPIC_API_KEY not set - this verification needs live marking calls.");
    console.log(
      "Run it with: ANTHROPIC_API_KEY=sk-... RUNS=8 npx tsx scripts/verify-marking-determinism.ts",
    );
    return;
  }

  const runs = Math.max(2, Number(process.env.RUNS ?? 5));

  // Build the marking input ONCE and reuse the identical bytes on every run. The
  // hash proves step 2: the answer / mark scheme / examiner's report reaching the
  // marking call are byte-identical across all runs, so anything that varies below
  // is the model call, not the input.
  const userMessage = buildMarkingUserMessage({
    paper_title: PAPER_TITLE,
    examiner_report_text: EXAMINER_REPORT,
    paper_text: PAPER_TEXT,
    mark_scheme_text: MARK_SCHEME,
    parsed_structure: JSON.stringify(PARSED_STRUCTURE, null, 2),
    answers_text: ANSWERS_TEXT,
  });
  const inputHash = createHash("sha256").update(userMessage, "utf8").digest("hex");

  console.log(`\nMarking the same answer ${runs}x  |  model=${MARKING_MODEL} (no temperature - unsupported)`);
  console.log(`Input sha256 (identical every run): ${inputHash}\n`);

  const client = new Anthropic({ apiKey });

  const totals: number[] = [];
  const perQuestion: Record<string, number[]> = {};

  for (let i = 0; i < runs; i++) {
    const response = await client.messages.create({
      model: MARKING_MODEL,
      max_tokens: 16000,
      system: MARKING_SYSTEM_PROMPT,
      messages: [{ role: "user", content: [{ type: "text", text: userMessage }] }],
    });
    const out = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const marking = extractJson(out) as MarkingResults;

    totals.push(marking.total_mark);
    const q1 = marking.questions.map((q) => `Q${q.number}=${q.mark_awarded}/${q.mark_available}`).join("  ");
    console.log(`  run ${i + 1}: total ${marking.total_mark}/${marking.total_available}   ${q1}`);
    for (const q of marking.questions) {
      (perQuestion[q.number] ??= []).push(q.mark_awarded);
    }
  }

  console.log("\n===== SPREAD =====");
  const t = spread(totals);
  console.log(
    `Total mark: min ${t.min}, max ${t.max}, RANGE ${t.range}  | distinct values seen: [${t.unique.join(", ")}]`,
  );
  for (const [num, marks] of Object.entries(perQuestion)) {
    const s = spread(marks);
    const bands = [...new Set(marks.map(bandFor))];
    const flip = bands.length > 1 ? `  BAND FLIP across ${bands.join(" / ")}` : `  stayed in ${bands[0]}`;
    console.log(
      `Q${num}: min ${s.min}, max ${s.max}, RANGE ${s.range}  | values [${s.unique.join(", ")}]${flip}`,
    );
  }

  // There is no temperature to tune on this model, so a nonzero range is the
  // model's own nondeterminism plus prompt band-discretion - the only lever is the
  // prompt. A zero range means marking is already reproducible on this fixture.
  if (t.range > 0) {
    console.log(
      `\nNOTE: total-mark range ${t.range} on byte-identical input (hash above). This is NOT sampling`,
    );
    console.log(
      "noise - claude-opus-4-8 has no temperature parameter. It is the model's own run-to-run variance",
    );
    console.log(
      "plus the discretion the mark scheme's level bands leave open. To tighten it, give the prompt a",
    );
    console.log(
      "within-band tie-break and an explicit boundary rule (which side of Level 3/Level 2 a borderline",
    );
    console.log("answer falls), then re-run this harness and compare the spread.");
  } else {
    console.log("\nPASS: zero spread across runs on byte-identical input. Marking is reproducible on this fixture.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
