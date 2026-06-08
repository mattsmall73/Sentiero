// Verification for the "examiner's report is optional" change.
//
// This is a REAL run, not a build check. It marks a report-less paper
// (Sociology, which has no examiner's report) with the live marking model and
// asserts the two things the brief insists on:
//   1. The number contract holds - the mark scheme owns every number; an absent
//      report disturbs nothing. (total_mark = sum of awarded; total_available =
//      sum of available = the mark scheme's total.)
//   2. The output never mentions, hints at, or apologises for the missing
//      report. A report-less subject has not omitted anything. (This one still
//      wants a human read too - only a person catches a tonal slip - so the
//      script prints every student-facing string for that read.)
//
// Run:  ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-optional-report.ts
// Without a key it exits 0 with a SKIP notice, printing the live command.

import Anthropic from "@anthropic-ai/sdk";
import { MARKING_SYSTEM_PROMPT, buildMarkingUserMessage } from "../lib/exam-marking-prompt";
import { renderResultsHtml } from "../lib/exam-results-html";
import type { MarkingResults, ParsedPaper } from "../lib/exam-db";

const MARKING_MODEL = "claude-opus-4-8";

// A non-English subject with no examiner's report - exactly the case the brief
// is unblocking. The examiner report is passed as "" (the report-less path).
const PAPER_TITLE = "AQA A-level Sociology Paper 1 - Education with theory and methods";

const EXAMINER_REPORT = ""; // No report exists for this subject.

const PAPER_TEXT = `Section A: Education
Q1. Outline two ways in which the hidden curriculum may influence pupils. [4 marks]
Q2. Outline three reasons why working-class pupils may underachieve in education. [6 marks]`;

const MARK_SCHEME = `Q1 (4 marks): 2 marks for each of two correct ways, clearly outlined.
One mark for a relevant point identified, a second for development. Examples of
ways: teaching conformity and obedience; reinforcing gender roles; rewarding
punctuality; transmitting ruling-class ideology.

Q2 (6 marks): 2 marks for each of three reasons, clearly outlined. Examples:
material deprivation (cost of schooling, housing); cultural deprivation
(restricted speech code, less parental support); labelling and the self-fulfilling
prophecy; anti-school subcultures.

Total available: 10 marks.`;

const PARSED_STRUCTURE: ParsedPaper = {
  paper_title: PAPER_TITLE,
  total_marks: 10,
  sections: [
    {
      title: "Section A: Education",
      questions: [
        { number: "1", text: "Outline two ways in which the hidden curriculum may influence pupils.", marks: 4 },
        { number: "2", text: "Outline three reasons why working-class pupils may underachieve in education.", marks: 6 },
      ],
    },
  ],
};

const ANSWERS: Record<string, string> = {
  "1": `One way is that the hidden curriculum teaches pupils to obey authority
without question, because they spend the day following timetables and asking
permission, which prepares them to accept being told what to do. Another way is
that it reinforces gender roles, since the subjects and activities pupils are
quietly steered towards still differ for boys and girls.`,
  "2": `One reason is material deprivation: families on low incomes cannot always
afford the books, trips and quiet study space that help learning. A second is
cultural deprivation, where some pupils arrive with a restricted speech code that
does not match the elaborated code schools reward. A third is labelling, where
teachers form lower expectations of working-class pupils and a self-fulfilling
prophecy can follow.`,
};

const ANSWERS_TEXT = [
  "--- Section A: Education ---",
  "Q1 (4 marks): Outline two ways in which the hidden curriculum may influence pupils.",
  `Answer: ${ANSWERS["1"].trim()}`,
  "",
  "Q2 (6 marks): Outline three reasons why working-class pupils may underachieve in education.",
  `Answer: ${ANSWERS["2"].trim()}`,
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

// Phrases that would betray the report's absence to the student. The bare word
// "report" is not banned (a question could legitimately ask a student to report
// findings), and "the examiner wants..." is allowed coaching - so we target the
// report's ABSENCE and the artefact "examiner's report" specifically.
const ABSENCE_PATTERNS: RegExp[] = [
  /examiner'?s\s+report/i,
  /\bno\s+(examiner'?s\s+)?report\b/i,
  /without\s+(an?\s+)?(examiner'?s\s+)?report/i,
  /(missing|absent|lack\s+of|absence\s+of)\s+(an?\s+)?(examiner'?s\s+)?report/i,
  /report\s+(was|is|isn'?t|wasn'?t|has)\s+\w*\s*(not\s+)?(provided|available|included|present|supplied|uploaded|given)/i,
  /(don'?t|do not|didn'?t|did not)\s+have\s+(an?\s+)?(examiner'?s\s+)?report/i,
];

function studentFacingStrings(m: MarkingResults): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [
    { where: "overall_summary", text: m.overall_summary ?? "" },
    { where: "headline_next_step", text: m.headline_next_step ?? "" },
  ];
  for (const q of m.questions ?? []) {
    out.push({ where: `Q${q.number}.what_worked`, text: q.what_worked ?? "" });
    out.push({ where: `Q${q.number}.what_the_scheme_wanted`, text: q.what_the_scheme_wanted ?? "" });
    out.push({ where: `Q${q.number}.next_step`, text: q.next_step ?? "" });
    out.push({ where: `Q${q.number}.closing_line`, text: q.closing_line ?? "" });
  }
  return out;
}

function checkNoAbsenceMention(m: MarkingResults): string[] {
  const problems: string[] = [];
  for (const { where, text } of studentFacingStrings(m)) {
    for (const re of ABSENCE_PATTERNS) {
      if (re.test(text)) {
        problems.push(`${where} mentions the report's absence: "${text.trim()}"`);
        break;
      }
    }
  }
  return problems;
}

function checkNumberContract(m: MarkingResults): string[] {
  const problems: string[] = [];
  const sumAwarded = (m.questions ?? []).reduce((a, q) => a + (q.mark_awarded ?? 0), 0);
  const sumAvailable = (m.questions ?? []).reduce((a, q) => a + (q.mark_available ?? 0), 0);
  if (m.total_mark !== sumAwarded) {
    problems.push(`total_mark ${m.total_mark} != sum of awarded ${sumAwarded}`);
  }
  if (m.total_available !== sumAvailable) {
    problems.push(`total_available ${m.total_available} != sum of available ${sumAvailable}`);
  }
  // The mark scheme owns the total: it is 10 marks for this fixture.
  if (m.total_available !== 10) {
    problems.push(`total_available ${m.total_available} != mark scheme total 10`);
  }
  for (const q of m.questions ?? []) {
    const expected = q.number === "1" ? 4 : q.number === "2" ? 6 : null;
    if (expected !== null && q.mark_available !== expected) {
      problems.push(`Q${q.number} mark_available ${q.mark_available} != scheme ${expected}`);
    }
    if (q.mark_awarded > q.mark_available) {
      problems.push(`Q${q.number} awarded ${q.mark_awarded} > available ${q.mark_available}`);
    }
  }
  return problems;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("SKIP: ANTHROPIC_API_KEY not set - this verification needs a live marking call.");
    console.log("Run it with: ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-optional-report.ts");
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
              examiner_report_text: EXAMINER_REPORT, // "" - the report-less path
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
    user_name: "Jordan",
    practised_at: new Date(),
    elapsed_seconds: 20 * 60,
    parsed: PARSED_STRUCTURE,
    answers: ANSWERS,
    marking,
  });

  console.log("\n===== Student-facing output (read this for tonal slips) =====\n");
  for (const { where, text } of studentFacingStrings(marking)) {
    if (text.trim()) console.log(`[${where}]\n${text.trim()}\n`);
  }
  console.log(`Totals: ${marking.total_mark} / ${marking.total_available}\n`);

  const fs = await import("fs/promises");
  const outPath = "/tmp/sentiero-optional-report-verify.html";
  await fs.writeFile(outPath, html, "utf8");
  console.log(`Full rendered results page written to ${outPath}`);

  const contractProblems = checkNumberContract(marking);
  const absenceProblems = checkNoAbsenceMention(marking);
  const problems = [...contractProblems, ...absenceProblems];

  if (problems.length > 0) {
    console.error("\nFAIL - report-less run broke a rule:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("\nPASS - number contract holds and the output never mentions the absent report.");
  console.log("(Tone still wants a human read of the strings above.)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
