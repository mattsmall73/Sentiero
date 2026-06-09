// Verification for detect-and-decline. Two gates now guard the marking path and
// the submit route declines if EITHER fires, so this checks the EFFECTIVE
// decision the route makes:
//   gate 1: runMismatchCheck (lib/exam-mismatch-check.ts), a focused pre-check
//           that runs before marking.
//   gate 2: the marking pass itself, which sets answer_mismatch.detected.
// decline = gate1.mismatch OR gate2.detected.
//
// It must DECLINE an answer that belongs to a different question/text, and must
// NEVER decline a genuine (even weak or unconventional) attempt at the right
// one. The false-positive guard is strict: for a genuine attempt BOTH gates
// must stay quiet.
//
// Headline cases are the two same-author regressions: a Hamlet answer handed in
// against a Measure for Measure question, and against a Coriolanus question
// (the one that slipped through and got marked). Same playwright, same essay
// shape, different play - the answer never names "Hamlet", so the gates must
// read the play from the content (the "to be or not to be" soliloquy).
//
// This is a REAL run, not a build check, and it is heavy: every case makes a
// pre-check call and a full marking call.
// Run:  ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-mismatch-decline.ts
// Without a key it exits 0 with a SKIP notice (so CI without secrets is quiet).

import Anthropic from "@anthropic-ai/sdk";
import { runMismatchCheck } from "../lib/exam-mismatch-check";
import { MARKING_SYSTEM_PROMPT, buildMarkingUserMessage } from "../lib/exam-marking-prompt";
import type { MarkingResults, ParsedPaper } from "../lib/exam-db";

const MARKING_MODEL = "claude-opus-4-8";

// A generic level-based scheme reused by the single-question fixtures: the
// scheme text is not what the gates key on (they compare question vs answer
// content), but the marking pass needs something to mark against.
const GENERIC_SCHEME = `30 marks. Level 6 (26-30): critical, exploratory analysis of language, form and
structure. Level 5 (21-25): thoughtful, developed, apt references. Level 4
(16-20): clear, explained. Level 3 (11-15): some explained response. Level 2
(6-10): supported comment. Level 1 (1-5): simple comment. Total available: 30.`;

type Paper = { title: string; paper_text: string; mark_scheme: string; parsed: ParsedPaper };

function singleQuestionPaper(title: string, sectionTitle: string, qText: string, paperText: string): Paper {
  return {
    title,
    paper_text: paperText,
    mark_scheme: GENERIC_SCHEME,
    parsed: {
      paper_title: title,
      total_marks: 30,
      sections: [{ title: sectionTitle, questions: [{ number: "1", text: qText, marks: 30 }] }],
    } as ParsedPaper,
  };
}

const HAMLET = singleQuestionPaper(
  "AQA English Literature Paper 1 - Shakespeare (Hamlet)",
  "Section 1: Shakespeare - Hamlet",
  "Starting with this speech, explore how Shakespeare presents Hamlet's state of mind.",
  `Section 1: Shakespeare - Hamlet
Read the extract from Act 3 Scene 1 (the "To be or not to be" soliloquy) and then
answer the question.
Q1. Starting with this speech, explore how Shakespeare presents Hamlet's state of
mind. Write about: this extract; and the play as a whole. [30 marks]`,
);

const MEASURE = singleQuestionPaper(
  "AQA English Literature Paper 1 - Shakespeare (Measure for Measure)",
  "Section 1: Shakespeare - Measure for Measure",
  "Starting with this extract, explore how Shakespeare presents the abuse of power.",
  `Section 1: Shakespeare - Measure for Measure
Read the extract from Act 2 Scene 2 (Isabella's plea to Angelo) and then answer
the question.
Q1. Starting with this extract, explore how Shakespeare presents the abuse of
power. Write about: this extract; and the play as a whole. [30 marks]`,
);

// The case that slipped through and got marked: a Coriolanus question.
const CORIOLANUS = singleQuestionPaper(
  "AQA English Literature Paper 1 - Shakespeare (Coriolanus)",
  "Section 1: Shakespeare - Coriolanus",
  "Starting with this extract, explore how Shakespeare presents Coriolanus's pride.",
  `Section 1: Shakespeare - Coriolanus
Read the extract from Act 3 Scene 1 (Coriolanus before the citizens) and then
answer the question.
Q1. Starting with this extract, explore how Shakespeare presents Coriolanus's
pride. Write about: this extract; and the play as a whole. [30 marks]`,
);

// A competent Hamlet answer that never names the play - genuine against HAMLET,
// a mismatch against MEASURE and CORIOLANUS.
const HAMLET_ANSWER = `The speaker opens with the antithesis "To be, or not to be", weighing two
impossible choices. The soliloquy form lets the audience hear private thought,
and the hesitation of the long subordinate clauses ("Whether 'tis nobler...")
shows a mind that cannot settle. The imagery of "to sleep, perchance to dream"
softens death into rest before pulling it back into dread. This same hesitation
runs through the whole play, from the delayed revenge to the feigned madness.`;

const OMM_ANSWER = `Steinbeck presents loneliness as the defining condition of ranch life in Of
Mice and Men. Crooks, isolated by the colour of his skin, keeps his room "swept
and fairly neat" as a guard against a world that will not let him belong. Curley's
wife, dismissed as "jail bait", drifts the ranch looking for company. Even George
and Lennie's dream of a place "to live off the fatta the lan" is a dream of not
being alone.`;

// WEAK BUT VALID Hamlet answers (must pass as genuine against HAMLET):
const WEAK_THIN = `Hamlet is really sad in this speech. He says "to be or not to be" which means
he is thinking about whether to keep living or not. His dad died and his mum
married his uncle so he is upset. He talks about sleep and death and he cannot
make up his mind, which is the same in the rest of the play.`;

const WEAK_CONFUSED = `In this soliloquy Hamlet is planning how he will kill Claudius and get revenge
for his father. "To be or not to be" shows he has decided to act and is psyching
himself up before he confronts the king. By the end he is full of confidence,
which is why he kills Polonius straight after.`;

const WEAK_UNCONVENTIONAL = `If I were directing this, I would have Hamlet alone at the front of a bare,
dark stage, one light. He would speak slowly, with long pauses on "to be" and "not
to be", talking himself in and out of it, so the audience feel they are inside his
head. Later in the play he is just as hesitant, so I would stage the other
soliloquies the same way.`;

type TestCase = { name: string; paper: Paper; answer: string; expectMismatch: boolean };

const CASES: TestCase[] = [
  { name: "TRUE MISMATCH: Hamlet answer vs a Coriolanus question (the case that slipped through)", paper: CORIOLANUS, answer: HAMLET_ANSWER, expectMismatch: true },
  { name: "TRUE MISMATCH: Hamlet answer vs a Measure for Measure question", paper: MEASURE, answer: HAMLET_ANSWER, expectMismatch: true },
  { name: "TRUE MISMATCH: Of Mice and Men answer vs the Hamlet question", paper: HAMLET, answer: OMM_ANSWER, expectMismatch: true },
  { name: "WEAK but valid: thin and short, on this speech", paper: HAMLET, answer: WEAK_THIN, expectMismatch: false },
  { name: "WEAK but valid: confused / partly wrong reading of the extract", paper: HAMLET, answer: WEAK_CONFUSED, expectMismatch: false },
  { name: "WEAK but valid: unconventional staging-led answer", paper: HAMLET, answer: WEAK_UNCONVENTIONAL, expectMismatch: false },
  { name: "STRONG: good answer to this question", paper: HAMLET, answer: HAMLET_ANSWER, expectMismatch: false },
];

function answersText(paper: Paper, answer: string): string {
  const q = paper.parsed.sections[0].questions[0];
  return [
    `--- ${paper.parsed.sections[0].title} ---`,
    `Q${q.number} (${q.marks} marks): ${q.text}`,
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

// Gate 2: run the real marking pass and read its answer_mismatch flag.
async function runMarkingFlag(
  client: Anthropic,
  paper: Paper,
  answer: string,
): Promise<{ detected: boolean; note: string }> {
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
              paper_title: paper.title,
              examiner_report_text: "",
              paper_text: paper.paper_text,
              mark_scheme_text: paper.mark_scheme,
              parsed_structure: JSON.stringify(paper.parsed, null, 2),
              answers_text: answersText(paper, answer),
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
  const marking = extractJson(out) as MarkingResults;
  return {
    detected: marking.answer_mismatch?.detected === true,
    note: marking.answer_mismatch?.note ?? "",
  };
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
    const pre = await runMismatchCheck(client, {
      paper_title: c.paper.title,
      paper_text: c.paper.paper_text,
      parsed_structure: JSON.stringify(c.paper.parsed, null, 2),
      answers_text: answersText(c.paper, c.answer),
    });
    const mark = await runMarkingFlag(client, c.paper, c.answer);
    const decline = pre.mismatch || mark.detected; // what the route does
    const ok = decline === c.expectMismatch;

    console.log(`\n----- ${c.name} -----`);
    console.log(
      `expected: ${c.expectMismatch ? "DECLINE" : "MARK"}   got: ${decline ? "DECLINE" : "MARK"}   ${ok ? "OK" : "FAIL"}`,
    );
    console.log(`  pre-check gate:  ${pre.mismatch ? "mismatch" : "ok"}${pre.note ? ` (${pre.note})` : ""}`);
    console.log(`  marking gate:    ${mark.detected ? "mismatch" : "ok"}${mark.note ? ` (${mark.note})` : ""}`);

    if (!ok) {
      failures.push(
        c.expectMismatch
          ? `${c.name}: a true mismatch was MARKED (both gates missed it)`
          : `${c.name}: a genuine attempt was DECLINED (false positive - by ${pre.mismatch ? "pre-check" : "marking"} gate)`,
      );
    }
  }

  if (failures.length > 0) {
    console.error("\nFAIL - detect-and-decline broke:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("\nPASS - every mismatch declined (caught by at least one gate); every genuine attempt was marked (both gates quiet).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
