// Verification for the results-page "Overall" feedback block.
//
// This is a REAL run, not a build check. It calls the marking model with the
// live MARKING_SYSTEM_PROMPT on a fixture paper (one Shakespeare answer
// attempted, the Section 2 essay left blank - the scenario from the brief),
// renders the actual results HTML, and asserts the generated overall_summary
// satisfies the screen rules:
//   - no marking-meta jargon on screen (rubric / mark scheme / assessment
//     objective / AO)
//   - no em-dashes
//   - short enough to digest (word count band)
// Tone and "leads with the strength" still want a human read; the script
// prints the rendered block so that read is one glance away.
//
// Run:  ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-overall-feedback.ts
// Without a key it exits 0 with a SKIP notice (so CI without secrets is quiet),
// printing the live command to run.

import Anthropic from "@anthropic-ai/sdk";
import { MARKING_SYSTEM_PROMPT, buildMarkingUserMessage } from "../lib/exam-marking-prompt";
import { renderResultsHtml } from "../lib/exam-results-html";
import type { MarkingResults, ParsedPaper } from "../lib/exam-db";

const MARKING_MODEL = "claude-opus-4-8";

// A small but realistic fixture. Section 1 (Shakespeare) is attempted; Section 2
// (the essay) is deliberately left blank - a genuinely required section the
// student only partly reached, which is exactly the case the overall block has
// to handle warmly and without jargon.
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

const ANSWERS: Record<string, string> = {
  "1": `Shakespeare opens the soliloquy with the antithesis "To be, or not to be",
setting Hamlet's whole dilemma as a balanced weighing of two impossible choices.
The form itself, a soliloquy, lets the audience hear private thought, and the
hesitation in the long subordinate clauses ("Whether 'tis nobler...") shows a mind
that cannot settle. The imagery of sleep and death ("to sleep, perchance to dream")
softens death into rest before pulling it back into dread. Across the play this
same hesitation governs Hamlet, from the delayed revenge to the feigned madness,
so the speech reads as the still centre of his indecision rather than a single low
moment. Staged alone, downstage, the speech makes the audience complicit in his
weighing.`,
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

// Screen rules the overall_summary must satisfy every run.
const BANNED_JARGON: { label: string; re: RegExp }[] = [
  { label: "rubric", re: /\brubric\b/i },
  { label: "mark scheme", re: /\bmark[-\s]?scheme\b/i },
  { label: "assessment objective", re: /\bassessment objective(s)?\b/i },
  { label: "AO (e.g. AO2)", re: /\bAO\s?\d?\b/ },
];
const EM_DASH = /[—–]/; // em dash and en dash

function checkOverall(summary: string): { ok: boolean; problems: string[]; words: number } {
  const problems: string[] = [];
  for (const { label, re } of BANNED_JARGON) {
    if (re.test(summary)) problems.push(`leaked marking-meta jargon: "${label}"`);
  }
  if (EM_DASH.test(summary)) problems.push("contains an em-dash or en-dash");
  const words = summary.trim().split(/\s+/).filter(Boolean).length;
  // Brief aims ~60-75 words. Allow a little slack either side; a wall (the old
  // ~110-word block) must fail.
  if (words > 90) problems.push(`too long to digest: ${words} words (aim ~60-75)`);
  if (words < 30) problems.push(`suspiciously short: ${words} words`);
  return { ok: problems.length === 0, problems, words };
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("SKIP: ANTHROPIC_API_KEY not set - this verification needs a live marking call.");
    console.log("Run it with: ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-overall-feedback.ts");
    return;
  }

  const client = new Anthropic({ apiKey });
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
              answers_text: ANSWERS_TEXT,
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

  const html = renderResultsHtml({
    paper_title: PAPER_TITLE,
    user_name: "Sam",
    practised_at: new Date(),
    elapsed_seconds: 95 * 60,
    parsed: PARSED_STRUCTURE,
    answers: ANSWERS,
    marking,
  });

  const summary = marking.overall_summary ?? "";
  const { ok, problems, words } = checkOverall(summary);

  console.log("\n===== Rendered Overall block (what the student reads) =====\n");
  console.log(summary);
  console.log(`\n(${words} words)\n`);

  // Save the full rendered page so the human verify step ("read the rendered
  // results page") is a file-open away.
  const fs = await import("fs/promises");
  const outPath = "/tmp/sentiero-results-verify.html";
  await fs.writeFile(outPath, html, "utf8");
  console.log(`Full rendered results page written to ${outPath}`);

  if (!ok) {
    console.error("\nFAIL - overall_summary broke a screen rule:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("\nPASS - no jargon, no em-dashes, short enough to digest.");
  console.log("(Tone / leads-with-strength still wants a human read of the block above.)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
