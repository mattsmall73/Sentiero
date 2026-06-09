// Verification for detect-and-decline: the marker must refuse to mark an answer
// that belongs to a different question or paper, and must NEVER refuse a genuine
// (even weak or unconventional) attempt at the right question.
//
// This is a REAL run, not a build check. It calls the live MARKING_SYSTEM_PROMPT
// on one fixed Hamlet question with several different answers and asserts the
// status the model returns:
//   - TRUE MISMATCH  (a competent answer to a DIFFERENT text/paper) -> "mismatch"
//   - WEAK BUT VALID (thin / confused / unconventional / partial, on this paper)
//                                                                    -> marked
//   - STRONG         (a good answer to this paper)                   -> marked
//
// The weak-but-valid cases are the point: the expensive failure is a false
// positive that rejects a real attempt, so several are run and any one of them
// being declined fails the whole script. The bar errs toward marking.
//
// Run:  ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-mismatch-decline.ts
// Without a key it exits 0 with a SKIP notice (so CI without secrets is quiet),
// printing the live command to run.

import Anthropic from "@anthropic-ai/sdk";
import { MARKING_SYSTEM_PROMPT, buildMarkingUserMessage } from "../lib/exam-marking-prompt";
import type { ParsedPaper } from "../lib/exam-db";

const MARKING_MODEL = "claude-opus-4-8";

// A tight single-question fixture: the Hamlet soliloquy question. Every answer
// below is marked against THIS question, so a "mismatch" verdict can only come
// from the answer being about something else.
const PAPER_TITLE = "AQA English Literature Paper 1 - Shakespeare (Hamlet)";

const EXAMINER_REPORT = `Stronger responses tracked the shift in Hamlet's state across the speech and
used short, embedded quotation. The best answers were alert to staging and to
the pressure of the soliloquy form. Weaker responses retold the plot.`;

const PAPER_TEXT = `Section 1: Shakespeare - Hamlet
Read the extract from Act 3 Scene 1 (the "To be or not to be" soliloquy) and then
answer the question.
Q1. Starting with this speech, explore how Shakespeare presents Hamlet's state of
mind. Write about: how Shakespeare presents Hamlet's state of mind in this extract;
how Shakespeare presents Hamlet's state of mind in the play as a whole. [30 marks]`;

const MARK_SCHEME = `Q1 (30 marks): AO1, AO2, AO3 weighted as per the assessment grid.
Level 6 (26-30): critical, exploratory, conceptualised response; precise analysis
of language, form and structure.
Level 5 (21-25): thoughtful, developed response with apt references.
Level 4 (16-20): clear, explained response.
Level 3 (11-15): some explained response with some references.
Level 2 (6-10): supported, straightforward comment.
Level 1 (1-5): simple comment, little reference.
Indicative content: the soliloquy form; antithesis of "to be / not to be";
imagery of sleep and death; Hamlet's hesitation and the staging of private thought.
Total available: 30 marks.`;

const PARSED_STRUCTURE: ParsedPaper = {
  paper_title: PAPER_TITLE,
  total_marks: 30,
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
  ],
};

// --- The answers under test -------------------------------------------------

// TRUE MISMATCH: a competent, coherent answer to a DIFFERENT text/paper (the
// exact case the brief targets: an answer to one paper handed in against
// another). It never engages with Hamlet or the soliloquy at all.
const MISMATCH_OMM = `Steinbeck presents loneliness as the defining condition of ranch life in Of
Mice and Men. Crooks, isolated by the colour of his skin, keeps his room "swept
and fairly neat" as a guard against a world that will not let him belong, and his
bitterness towards Lennie ("I tell ya a guy gets too lonely") exposes how
isolation hardens into cruelty. Curley's wife, dismissed as "jail bait", drifts
the ranch looking for company because she has no name and no place of her own.
Even George and Lennie's dream of a place "to live off the fatta the lan" is
really a dream of not being alone, which is why its collapse is so devastating.`;

// WEAK BUT VALID (must be MARKED, never declined):
// 1) Thin and short, but plainly about this speech.
const WEAK_THIN = `Hamlet is really sad in this speech. He says "to be or not to be" which means
he is thinking about whether to keep living or not. His dad died and his mum
married his uncle so he is upset. He talks about sleep and death. He cannot make
up his mind what to do, which is the same in the rest of the play.`;

// 2) Confused / partly wrong reading, but still about the Hamlet extract.
const WEAK_CONFUSED = `In this soliloquy Hamlet is planning how he will kill Claudius and get revenge
for his father. "To be or not to be" shows he has decided to act and is psyching
himself up before he goes to confront the king. The sleep and death imagery is
him imagining Claudius dead. By the end of the speech he is determined and full
of confidence, which is why he kills Polonius straight after.`;

// 3) Unconventional angle: leans almost entirely on staging/performance with
//    little close language analysis. Valid, just not the usual essay shape.
const WEAK_UNCONVENTIONAL = `If I were directing this, I would have Hamlet alone at the very front of a bare,
dark stage, no one else on, a single light. He would speak the lines slowly, with
long pauses on "to be" and "not to be", almost talking himself in and out of it.
The audience should feel like they are inside his head, eavesdropping. Later in
the play he is just as hesitant, so I would stage the soliloquies the same way to
show the same trapped, circling mind each time.`;

// STRONG (must be MARKED): a good answer to this question.
const STRONG = `Shakespeare opens the soliloquy with the antithesis "To be, or not to be",
setting Hamlet's dilemma as a balanced weighing of two impossible choices. The
soliloquy form lets the audience hear private thought, and the hesitation of the
long subordinate clauses ("Whether 'tis nobler...") shows a mind that cannot
settle. The imagery of "to sleep, perchance to dream" softens death into rest
before pulling it back into dread. Across the play this same hesitation governs
Hamlet, from the delayed revenge to the feigned madness, so the speech reads as
the still centre of his indecision rather than a single low moment.`;

type Case = { name: string; answer: string; expectMismatch: boolean };

const CASES: Case[] = [
  { name: "TRUE MISMATCH: Of Mice and Men answer vs the Hamlet question", answer: MISMATCH_OMM, expectMismatch: true },
  { name: "WEAK but valid: thin and short, on this speech", answer: WEAK_THIN, expectMismatch: false },
  { name: "WEAK but valid: confused / partly wrong reading of the extract", answer: WEAK_CONFUSED, expectMismatch: false },
  { name: "WEAK but valid: unconventional staging-led answer", answer: WEAK_UNCONVENTIONAL, expectMismatch: false },
  { name: "STRONG: good answer to this question", answer: STRONG, expectMismatch: false },
];

function answersText(answer: string): string {
  return [
    "--- Section 1: Shakespeare - Hamlet ---",
    "Q1 (30 marks): Starting with this speech, explore how Shakespeare presents Hamlet's state of mind.",
    `Answer: ${answer.trim()}`,
    "",
  ].join("\n");
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }
  throw new Error("Model did not return valid JSON.");
}

async function markOne(client: Anthropic, answer: string): Promise<{ status?: string; questions?: unknown; mismatch_note?: string }> {
  const response = await client.messages.create({
    model: MARKING_MODEL,
    max_tokens: 16000,
    system: MARKING_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildMarkingUserMessage({
              paper_title: PAPER_TITLE,
              examiner_report_text: EXAMINER_REPORT,
              paper_text: PAPER_TEXT,
              mark_scheme_text: MARK_SCHEME,
              parsed_structure: JSON.stringify(PARSED_STRUCTURE, null, 2),
              answers_text: answersText(answer),
            }),
          },
        ],
      },
    ],
  });
  const out = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return extractJson(out) as { status?: string; questions?: unknown; mismatch_note?: string };
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("SKIP: ANTHROPIC_API_KEY not set - this verification needs live marking calls.");
    console.log("Run it with: ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-mismatch-decline.ts");
    return;
  }

  const client = new Anthropic({ apiKey });
  const failures: string[] = [];

  for (const c of CASES) {
    const result = await markOne(client, c.answer);
    const declined = result.status === "mismatch";
    // A marked result must carry a questions array; a decline must not pretend
    // to mark. Treat "declined" purely off the status field the route reads.
    const ok = declined === c.expectMismatch;

    console.log(`\n----- ${c.name} -----`);
    console.log(`expected: ${c.expectMismatch ? "DECLINE" : "MARK"}   got: ${declined ? "DECLINE" : "MARK"}   ${ok ? "OK" : "FAIL"}`);
    if (declined) {
      console.log(`mismatch_note (internal, never shown): ${result.mismatch_note ?? "(none)"}`);
    }

    if (!ok) {
      if (c.expectMismatch) {
        failures.push(`${c.name}: a true mismatch was MARKED (false negative - the bug we are fixing)`);
      } else {
        failures.push(`${c.name}: a genuine attempt was DECLINED (false positive - the harm in reverse)`);
      }
    } else if (!c.expectMismatch && !Array.isArray(result.questions)) {
      failures.push(`${c.name}: marked but returned no questions array (unexpected shape)`);
    }
  }

  if (failures.length > 0) {
    console.error("\nFAIL - detect-and-decline broke:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("\nPASS - the true mismatch declined; every genuine attempt (weak, confused, unconventional, strong) was marked.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
