// Verification for the coaching-specificity requirement: every piece of
// forward-looking advice must LAND on a concrete, do-able move tied to the
// student's own text, not dangle as an evocative phrase about good writing.
//
// This is the per-question coaching, not the bottom-of-page next steps (those
// are already concrete). The failure looks like:
//   "the thing that takes this into the top band is letting the play breathe
//    as a live performance, not only a text on the page."
// Beautiful, and useless: "let the play breathe" is a feeling, not an action.
//
// The rule is REQUIRE-IT-LANDS, not forbid-the-style. Lift is welcome; a
// dangling phrase that never resolves into an action is not. So the check
// flags a forward-looking field only when it carries a vibe-phrase AND offers
// no concrete action cue ("note", "quote", "where", "who", ...). A field that
// opens with lift and then names the move passes.
//
// A heuristic cannot judge warmth, or whether a move is honestly grounded in
// the mark scheme rather than invented. Per the brief, the real gate is a human
// reading the rendered page and asking of each line: "on their next answer,
// with a pen, could the student actually do this?" This script surfaces the
// coaching for that read and fails the clearest danglers as a backstop.
//
// Run:  ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-coaching-lands.ts
// Without a key it still runs the lands-check self-test on the brief's own
// before/after strings (proving the check has teeth), then exits 0.

import Anthropic from "@anthropic-ai/sdk";
import { MARKING_SYSTEM_PROMPT, buildMarkingUserMessage } from "../lib/exam-marking-prompt";
import { renderResultsHtml } from "../lib/exam-results-html";
import type { MarkingResults, ParsedPaper } from "../lib/exam-db";

const MARKING_MODEL = "claude-opus-4-8";

// An essay question is where top-band "good writing" advice lives, so it is the
// honest place to test for dangling poetry. The mark scheme genuinely rewards a
// performance reading, so the concrete move ("read for staging") can be drawn
// from the source rather than invented.
const PAPER_TITLE = "AQA A-level English Literature - Hamlet";

const PAPER_TEXT = `Section A: Shakespeare
Q1. "Hamlet is a play about a son who cannot act." Explore how far you agree with
this view of Hamlet, with close reference to Shakespeare's dramatic methods. [30 marks]`;

const MARK_SCHEME = `Q1 (30 marks). Mark in bands against the assessment focuses below.
- Band 5 (25-30): a perceptive, assured argument that reads Hamlet as drama
  written for performance, not only as words on the page. Top-band answers
  consider staging, the audience's position, asides and soliloquy as theatrical
  devices, pacing, and how a moment plays in the theatre, and use precise
  textual reference to support a sustained line of argument.
- Band 4 (19-24): a clear, well-structured argument with close textual analysis
  of language and form, beginning to consider dramatic method.
- Band 3 (13-18): a sound reading with relevant textual support, mostly treating
  the play as written text.
- Bands 1-2 (1-12): some relevant comment, limited or assertion-led.
Reward engagement with Shakespeare's dramatic methods and a personal, sustained
argument. Total available: 30 marks.`;

const ANSWERS: Record<string, string> = {
  "1": `Hamlet's inability to act is the engine of the play. In the "To be or not
to be" soliloquy Shakespeare gives him a mind that reasons itself out of action:
the balanced clauses and the abstract nouns ("conscience", "resolution") show
thought circling rather than moving forward. When he finds Claudius at prayer,
his language again delays him; he reasons that killing Claudius in prayer would
send him to heaven, and the long subordinate clauses let the moment pass. His
self-reproach in "O what a rogue and peasant slave am I" turns even his anger
inward, into more words. Across the play, then, Shakespeare uses Hamlet's dense,
self-interrupting language to dramatise a man who substitutes thinking for doing,
so I largely agree that the play is about a son who cannot act, though his final
decisiveness complicates it.`,
};

const ANSWERS_TEXT = [
  "--- Section A: Shakespeare ---",
  "Q1 (30 marks): \"Hamlet is a play about a son who cannot act.\" Explore how far you agree, with close reference to Shakespeare's dramatic methods.",
  `Answer: ${ANSWERS["1"].trim()}`,
  "",
].join("\n");

const PARSED_STRUCTURE: ParsedPaper = {
  paper_title: PAPER_TITLE,
  total_marks: 30,
  sections: [
    {
      title: "Section A: Shakespeare",
      questions: [
        {
          number: "1",
          text: '"Hamlet is a play about a son who cannot act." Explore how far you agree, with close reference to Shakespeare\'s dramatic methods.',
          marks: 30,
        },
      ],
    },
  ],
};

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }
  throw new Error("Model did not return valid JSON.");
}

// Vibe-phrases about "good writing" that mean nothing on their own. Their
// presence is fine ONLY if the same field also offers a concrete action cue.
const VIBE_PHRASES: RegExp[] = [
  /let(ting|s)?\s+the\s+\w+\s+breathe/i,
  /\bbreathe(s|d)?\b/i,
  /live\s+performance/i,
  /come\s+alive|comes?\s+to\s+life|bring(s|ing)?\s+.{0,25}\bto\s+life/i,
  /make\s+(the\s+\w+|it|them)\s+sing/i,
  /leaps?\s+off\s+the\s+page|lift(s|ing)?\s+off\s+the\s+page|jump(s|ing)?\s+off\s+the\s+page/i,
  /on\s+the\s+page\b/i,
];

// Concrete signals that the advice has resolved into something do-able: an
// action verb, or a pointer at where in the text it applies.
const ACTION_CUES: RegExp[] = [
  /\b(note|quote|add|write|name|mark|circle|underline|annotate|label|number|list|pick|choose|swap|cut|replace|start|open|end|point|identify|track|count|read|say|deliver|pause)\b/i,
  /\bwhere\b/i,
  /\bwho\b/i,
  /\bwhich\s+(line|word|moment|phrase|quotation|character|speech|scene)\b/i,
  /\bin\s+your\s+(answer|essay|response|next)\b/i,
];

function hasVibe(text: string): RegExp | null {
  return VIBE_PHRASES.find((re) => re.test(text)) ?? null;
}
function hasAction(text: string): boolean {
  return ACTION_CUES.some((re) => re.test(text));
}

// True dangler = a vibe-phrase with no action cue to resolve it.
function dangles(text: string): RegExp | null {
  const vibe = hasVibe(text);
  if (vibe && !hasAction(text)) return vibe;
  return null;
}

function forwardLookingFields(m: MarkingResults): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [
    { where: "headline_next_step", text: m.headline_next_step ?? "" },
  ];
  for (const q of m.questions ?? []) {
    out.push({ where: `Q${q.number}.what_the_scheme_wanted`, text: q.what_the_scheme_wanted ?? "" });
    out.push({ where: `Q${q.number}.next_step`, text: q.next_step ?? "" });
    out.push({ where: `Q${q.number}.closing_line`, text: q.closing_line ?? "" });
  }
  return out;
}

function allStudentFacing(m: MarkingResults): { where: string; text: string }[] {
  const out = [{ where: "overall_summary", text: m.overall_summary ?? "" }, ...forwardLookingFields(m)];
  for (const q of m.questions ?? []) {
    out.push({ where: `Q${q.number}.what_worked`, text: q.what_worked ?? "" });
  }
  return out;
}

function checkAdviceLands(m: MarkingResults): string[] {
  const problems: string[] = [];
  for (const { where, text } of forwardLookingFields(m)) {
    if (!text.trim()) continue;
    const vibe = dangles(text);
    if (vibe) {
      problems.push(`${where} dangles (vibe /${vibe.source}/, no action cue): "${text.trim()}"`);
    }
  }
  return problems;
}

// Prove the lands-check has teeth using the brief's own canonical examples plus
// a "lift that lands" case (must pass) and a plain dangler (must fail).
function selfTestLandsCheck(): boolean {
  const cases: { label: string; text: string; expectDangle: boolean }[] = [
    {
      label: "brief BEFORE (dangling)",
      text: "the thing that takes this kind of writing into the top band is letting the play breathe as a live performance, not only as a text on the page.",
      expectDangle: true,
    },
    {
      label: "brief AFTER (lands)",
      text: "You analysed Hamlet's words closely. The next step is to note how a line would be staged, where an actor pauses, who else is on stage hearing it, because that performance reading is what the top band rewards.",
      expectDangle: false,
    },
    {
      label: "lift that lands (style kept, resolves)",
      text: "Let the play breathe: note where each speech would pause on stage and who is there to overhear it.",
      expectDangle: false,
    },
    {
      label: "plain concrete (no vibe)",
      text: "Quote one line of Gertrude's and say how an actor might deliver it.",
      expectDangle: false,
    },
    {
      label: "plain dangler (vibe, no action)",
      text: "Make the writing sing and come alive on the page.",
      expectDangle: true,
    },
  ];
  let ok = true;
  for (const c of cases) {
    const got = dangles(c.text) !== null;
    const pass = got === c.expectDangle;
    if (!pass) ok = false;
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${c.label} -> ${got ? "flagged" : "clear"} (expected ${c.expectDangle ? "flagged" : "clear"})`);
  }
  return ok;
}

async function runLive(client: Anthropic): Promise<string[]> {
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
              examiner_report_text: "", // report-less; advice must still land from the scheme
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

  console.log("\n===== Coaching (read each line: 'with a pen, could the student do this?') =====\n");
  for (const { where, text } of allStudentFacing(marking)) {
    if (text.trim()) console.log(`[${where}]\n${text.trim()}\n`);
  }
  console.log(`Mark: ${marking.total_mark} / ${marking.total_available}`);

  const fs = await import("fs/promises");
  const outPath = "/tmp/sentiero-coaching-lands.html";
  await fs.writeFile(
    outPath,
    renderResultsHtml({
      paper_title: PAPER_TITLE,
      user_name: "Jordan",
      practised_at: new Date(),
      elapsed_seconds: 55 * 60,
      parsed: PARSED_STRUCTURE,
      answers: ANSWERS,
      marking,
    }),
    "utf8",
  );
  console.log(`(rendered page: ${outPath})`);

  const problems: string[] = [];
  // Number contract, kept honest even here.
  const sumAvailable = (marking.questions ?? []).reduce((a, q) => a + (q.mark_available ?? 0), 0);
  if (marking.total_available !== 30) problems.push(`total_available ${marking.total_available} != 30`);
  if (marking.total_available !== sumAvailable) problems.push(`total_available != sum of available ${sumAvailable}`);
  // The actual point of this script: every forward-looking line must land.
  problems.push(...checkAdviceLands(marking));
  return problems;
}

async function main() {
  console.log("Lands-check self-test (runs with or without an API key):");
  const selfOk = selfTestLandsCheck();
  if (!selfOk) {
    console.error("\nFAIL - the lands-check logic is wrong; fix it before trusting the live run.");
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("\nSKIP live run: ANTHROPIC_API_KEY not set.");
    console.log("Run it with: ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-coaching-lands.ts");
    console.log("Then READ /tmp/sentiero-coaching-lands.html - the human read is the real gate:");
    console.log("  - could the student do each line on their next answer, with a pen?");
    console.log("  - did the warmth survive (it should land, not turn clinical)?");
    console.log("  - is each concrete move honestly grounded in the mark scheme, not invented?");
    return;
  }

  const problems = await runLive(new Anthropic({ apiKey }));
  if (problems.length > 0) {
    console.error("\nFAIL:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("\nPASS (backstop) - no forward-looking line dangles, and the numbers hold.");
  console.log("This is necessary, not sufficient: now READ the page for warmth, do-ability,");
  console.log("and honest specificity. A script cannot judge those.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
