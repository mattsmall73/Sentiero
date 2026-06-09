// Verification for detect-and-decline (lib/exam-mismatch-check.ts): the gate
// must refuse an answer that belongs to a different question or paper, and must
// NEVER refuse a genuine (even weak or unconventional) attempt at the right one.
//
// This is a REAL run, not a build check. It calls the live mismatch-check on the
// exact decision the submit route makes - runMismatchCheck - across several
// answer/question pairings and asserts the verdict:
//   - TRUE MISMATCH  (an answer to a DIFFERENT text/paper) -> mismatch = true
//   - WEAK BUT VALID (thin / confused / unconventional / partial, right text)
//                                                          -> mismatch = false
//   - STRONG         (a good answer to this question)      -> mismatch = false
//
// The headline case is the one the first attempt got wrong: a competent Hamlet
// answer handed in against a Measure for Measure question. Same playwright, same
// essay shape, different play - it must be caught. The weak-but-valid cases are
// the false-positive guard: the expensive failure is rejecting a real attempt,
// so several are run and any one being flagged fails the whole script.
//
// Run:  ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-mismatch-decline.ts
// Without a key it exits 0 with a SKIP notice (so CI without secrets is quiet),
// printing the live command to run.

import Anthropic from "@anthropic-ai/sdk";
import { runMismatchCheck } from "../lib/exam-mismatch-check";
import type { ParsedPaper } from "../lib/exam-db";

// --- Two paper fixtures -----------------------------------------------------

// Paper A: the Hamlet soliloquy question.
const HAMLET = {
  title: "AQA English Literature Paper 1 - Shakespeare (Hamlet)",
  paper_text: `Section 1: Shakespeare - Hamlet
Read the extract from Act 3 Scene 1 (the "To be or not to be" soliloquy) and then
answer the question.
Q1. Starting with this speech, explore how Shakespeare presents Hamlet's state of
mind. Write about: how Shakespeare presents Hamlet's state of mind in this extract;
how Shakespeare presents Hamlet's state of mind in the play as a whole. [30 marks]`,
  parsed: {
    paper_title: "AQA English Literature Paper 1 - Shakespeare (Hamlet)",
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
  } as ParsedPaper,
};

// Paper B: a Measure for Measure question - same playwright, same essay shape,
// a different play. This is the pairing the first attempt marked by mistake.
const MEASURE = {
  title: "AQA English Literature Paper 1 - Shakespeare (Measure for Measure)",
  paper_text: `Section 1: Shakespeare - Measure for Measure
Read the extract from Act 2 Scene 2 (Isabella's plea to Angelo) and then answer
the question.
Q1. Starting with this extract, explore how Shakespeare presents the abuse of
power. Write about: how Shakespeare presents the abuse of power in this extract;
how Shakespeare presents the abuse of power in the play as a whole. [30 marks]`,
  parsed: {
    paper_title: "AQA English Literature Paper 1 - Shakespeare (Measure for Measure)",
    total_marks: 30,
    sections: [
      {
        title: "Section 1: Shakespeare - Measure for Measure",
        questions: [
          {
            number: "1",
            text: "Starting with this extract, explore how Shakespeare presents the abuse of power.",
            marks: 30,
          },
        ],
      },
    ],
  } as ParsedPaper,
};

// --- The answers under test -------------------------------------------------

// A competent, on-topic Hamlet answer. Genuine against HAMLET; a mismatch
// against MEASURE.
const HAMLET_ANSWER = `Shakespeare opens the soliloquy with the antithesis "To be, or not to be",
setting Hamlet's dilemma as a balanced weighing of two impossible choices. The
soliloquy form lets the audience hear private thought, and the hesitation of the
long subordinate clauses ("Whether 'tis nobler...") shows a mind that cannot
settle. The imagery of "to sleep, perchance to dream" softens death into rest
before pulling it back into dread. Across the play this same hesitation governs
Hamlet, from the delayed revenge to the feigned madness, so the speech reads as
the still centre of his indecision.`;

// A competent answer to a different text entirely (Of Mice and Men).
const OMM_ANSWER = `Steinbeck presents loneliness as the defining condition of ranch life in Of
Mice and Men. Crooks, isolated by the colour of his skin, keeps his room "swept
and fairly neat" as a guard against a world that will not let him belong. Curley's
wife, dismissed as "jail bait", drifts the ranch looking for company because she
has no name and no place of her own. Even George and Lennie's dream of a place "to
live off the fatta the lan" is really a dream of not being alone.`;

// WEAK BUT VALID Hamlet answers (must pass as genuine against HAMLET):
const WEAK_THIN = `Hamlet is really sad in this speech. He says "to be or not to be" which means
he is thinking about whether to keep living or not. His dad died and his mum
married his uncle so he is upset. He talks about sleep and death and he cannot
make up his mind, which is the same in the rest of the play.`;

const WEAK_CONFUSED = `In this soliloquy Hamlet is planning how he will kill Claudius and get revenge
for his father. "To be or not to be" shows he has decided to act and is psyching
himself up before he confronts the king. By the end of the speech he is full of
confidence, which is why he kills Polonius straight after.`;

const WEAK_UNCONVENTIONAL = `If I were directing this, I would have Hamlet alone at the very front of a bare,
dark stage, one light. He would speak slowly, with long pauses on "to be" and "not
to be", almost talking himself in and out of it, so the audience feel they are
inside his head. Later in the play he is just as hesitant, so I would stage the
other soliloquies the same way.`;

type Case = {
  name: string;
  paper: typeof HAMLET;
  answer: string;
  expectMismatch: boolean;
};

const CASES: Case[] = [
  // The headline regression: the case the first attempt marked by mistake.
  { name: "TRUE MISMATCH: Hamlet answer vs a Measure for Measure question (same author, different play)", paper: MEASURE, answer: HAMLET_ANSWER, expectMismatch: true },
  // A wider mismatch for good measure.
  { name: "TRUE MISMATCH: Of Mice and Men answer vs the Hamlet question", paper: HAMLET, answer: OMM_ANSWER, expectMismatch: true },
  // False-positive guard: genuine attempts at the right question.
  { name: "WEAK but valid: thin and short, on this speech", paper: HAMLET, answer: WEAK_THIN, expectMismatch: false },
  { name: "WEAK but valid: confused / partly wrong reading of the extract", paper: HAMLET, answer: WEAK_CONFUSED, expectMismatch: false },
  { name: "WEAK but valid: unconventional staging-led answer", paper: HAMLET, answer: WEAK_UNCONVENTIONAL, expectMismatch: false },
  { name: "STRONG: good answer to this question", paper: HAMLET, answer: HAMLET_ANSWER, expectMismatch: false },
];

function answersText(paper: typeof HAMLET, answer: string): string {
  const q = paper.parsed.sections[0].questions[0];
  return [
    `--- ${paper.parsed.sections[0].title} ---`,
    `Q${q.number} (${q.marks} marks): ${q.text}`,
    `Answer: ${answer.trim()}`,
    "",
  ].join("\n");
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("SKIP: ANTHROPIC_API_KEY not set - this verification needs live model calls.");
    console.log("Run it with: ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-mismatch-decline.ts");
    return;
  }

  const client = new Anthropic({ apiKey });
  const failures: string[] = [];

  for (const c of CASES) {
    const { mismatch, note } = await runMismatchCheck(client, {
      paper_title: c.paper.title,
      paper_text: c.paper.paper_text,
      parsed_structure: JSON.stringify(c.paper.parsed, null, 2),
      answers_text: answersText(c.paper, c.answer),
    });
    const ok = mismatch === c.expectMismatch;

    console.log(`\n----- ${c.name} -----`);
    console.log(`expected: ${c.expectMismatch ? "DECLINE" : "MARK"}   got: ${mismatch ? "DECLINE" : "MARK"}   ${ok ? "OK" : "FAIL"}`);
    console.log(`note (internal, never shown): ${note || "(none)"}`);

    if (!ok) {
      failures.push(
        c.expectMismatch
          ? `${c.name}: a true mismatch was MARKED (false negative - the bug we are fixing)`
          : `${c.name}: a genuine attempt was DECLINED (false positive - the harm in reverse)`,
      );
    }
  }

  if (failures.length > 0) {
    console.error("\nFAIL - detect-and-decline broke:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("\nPASS - both mismatches declined; every genuine attempt (weak, confused, unconventional, strong) was marked.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
