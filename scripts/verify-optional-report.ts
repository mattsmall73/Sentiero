// Verification for the "examiner's report is optional" change.
//
// This is a REAL run, not a build check. It marks the SAME answers twice:
//   PRESENT - with a distinctive examiner's report
//   ABSENT  - report-less (the "" path)
// and checks the two failure modes this feature can introduce:
//
//   1. Regression guard (the bug we hit): when a report IS present, its
//      specific stagecraft must still reach the coaching. The present-case
//      report carries distinctive tokens that do NOT appear in the mark scheme
//      ("signpost", "Rosenthal", a named study); if none surface in the
//      coaching, the report is being ignored even though it is there.
//   2. Absence guard: when a report is absent, the output must never mention,
//      hint at, or apologise for its absence - and must never name the artefact
//      "examiner's report" in either case (it is internal meta).
//
// The number contract (the mark scheme owns every number) is checked in both
// cases. Keyword signals are directional, not proof - a human read of the two
// printed outputs side by side is still the real gate, especially for tone and
// for how richly the present-case coaching uses the report.
//
// Run:  ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-optional-report.ts
// Without a key it exits 0 with a SKIP notice.

import Anthropic from "@anthropic-ai/sdk";
import { MARKING_SYSTEM_PROMPT, buildMarkingUserMessage } from "../lib/exam-marking-prompt";
import { renderResultsHtml } from "../lib/exam-results-html";
import type { MarkingResults, ParsedPaper } from "../lib/exam-db";

const MARKING_MODEL = "claude-opus-4-8";

const PAPER_TITLE = "AQA A-level Sociology Paper 1 - Education with theory and methods";

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

// PRESENT-case report. Carries stagecraft that the mark scheme does NOT: the
// word "signpost", a named study ("Rosenthal and Jacobson"), and a specific
// half-marks-without-a-study observation. If the report is genuinely used, at
// least one of these should colour the coaching.
const EXAMINER_REPORT_PRESENT = `Examiners' report (Education).
On Q1 the strongest scripts signposted each way before developing it (opening
"The first way is...") and tied it straight to a named perspective; weaker
answers left the second "way" as a bare assertion and lost the development mark.
On Q2 markers specifically rewarded candidates who named a supporting study, for
example Rosenthal and Jacobson on the self-fulfilling prophecy. In the examiners'
sample, answers that asserted labelling without a named study were capped at half
marks for that reason. Many candidates also conflated material and cultural
deprivation rather than keeping them distinct.`;

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

// Phrases that betray the report's absence, plus the artefact name itself (which
// is internal meta and must never surface in either case). The bare word
// "report" is fine (a question may ask a student to report findings), and "the
// examiner wants..." is allowed coaching.
const ABSENCE_PATTERNS: RegExp[] = [
  /examiner'?s\s+report/i,
  /\bno\s+(examiner'?s\s+)?report\b/i,
  /without\s+(an?\s+)?(examiner'?s\s+)?report/i,
  /(missing|absent|lack\s+of|absence\s+of)\s+(an?\s+)?(examiner'?s\s+)?report/i,
  /report\s+(was|is|isn'?t|wasn'?t|has)\s+\w*\s*(not\s+)?(provided|available|included|present|supplied|uploaded|given)/i,
  /(don'?t|do not|didn'?t|did not)\s+have\s+(an?\s+)?(examiner'?s\s+)?report/i,
];

// Tokens unique to EXAMINER_REPORT_PRESENT (absent from the mark scheme). If the
// report is being used, the coaching should echo at least one of these ideas.
const REPORT_STAGECRAFT_SIGNALS: RegExp[] = [
  /signpost/i,
  /rosenthal/i,
  /named?\s+study/i,
  /name\s+a\s+study/i,
  /\bstudy\b/i,
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
        problems.push(`${where} names/flags the report: "${text.trim()}"`);
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
  if (m.total_mark !== sumAwarded) problems.push(`total_mark ${m.total_mark} != sum awarded ${sumAwarded}`);
  if (m.total_available !== sumAvailable) problems.push(`total_available ${m.total_available} != sum available ${sumAvailable}`);
  if (m.total_available !== 10) problems.push(`total_available ${m.total_available} != mark scheme total 10`);
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

function reportStagecraftSurfaced(m: MarkingResults): string[] {
  const hits: string[] = [];
  for (const { where, text } of studentFacingStrings(m)) {
    for (const re of REPORT_STAGECRAFT_SIGNALS) {
      if (re.test(text)) hits.push(`${where} echoes report stagecraft (/${re.source}/): "${text.trim()}"`);
    }
  }
  return hits;
}

async function runCase(
  client: Anthropic,
  label: string,
  reportText: string,
): Promise<MarkingResults> {
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
              examiner_report_text: reportText,
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

  console.log(`\n===== ${label} - student-facing output (read for tone + report use) =====\n`);
  for (const { where, text } of studentFacingStrings(marking)) {
    if (text.trim()) console.log(`[${where}]\n${text.trim()}\n`);
  }
  console.log(`Totals: ${marking.total_mark} / ${marking.total_available}`);

  const fs = await import("fs/promises");
  const slug = label.toLowerCase().replace(/[^a-z]+/g, "-");
  const outPath = `/tmp/sentiero-optional-report-${slug}.html`;
  await fs.writeFile(
    outPath,
    renderResultsHtml({
      paper_title: PAPER_TITLE,
      user_name: "Jordan",
      practised_at: new Date(),
      elapsed_seconds: 20 * 60,
      parsed: PARSED_STRUCTURE,
      answers: ANSWERS,
      marking,
    }),
    "utf8",
  );
  console.log(`(rendered page: ${outPath})`);
  return marking;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("SKIP: ANTHROPIC_API_KEY not set - this verification needs live marking calls.");
    console.log("Run it with: ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-optional-report.ts");
    return;
  }
  const client = new Anthropic({ apiKey });

  const present = await runCase(client, "PRESENT (report supplied)", EXAMINER_REPORT_PRESENT);
  const absent = await runCase(client, "ABSENT (report-less)", "");

  const problems: string[] = [];

  // Both cases: number contract holds, and the artefact is never named.
  for (const [label, m] of [["PRESENT", present], ["ABSENT", absent]] as const) {
    for (const p of checkNumberContract(m)) problems.push(`[${label}] ${p}`);
    for (const p of checkNoAbsenceMention(m)) problems.push(`[${label}] ${p}`);
  }

  // Regression guard: the present-case report must actually colour the coaching.
  const surfaced = reportStagecraftSurfaced(present);
  console.log("\n===== Regression guard: did the present report reach the coaching? =====");
  if (surfaced.length === 0) {
    problems.push(
      "[PRESENT] report stagecraft did not surface in any coaching field - the report looks ignored even though it was supplied. Read the PRESENT output above against the ABSENT one.",
    );
  } else {
    for (const h of surfaced) console.log(`  + ${h}`);
  }

  if (problems.length > 0) {
    console.error("\nFAIL:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("\nPASS - numbers hold in both cases, the report is used when present, and its");
  console.log("absence is never surfaced when it is missing. Still read both outputs for tone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
