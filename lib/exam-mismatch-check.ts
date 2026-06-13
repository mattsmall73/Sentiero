// Detect-and-decline gate. Runs BEFORE marking, as its own focused call, and
// decides one thing only: are the student's answers a genuine attempt at THIS
// paper, or do they belong to a different question, text, or paper?
//
// Why a separate call rather than a clause inside the marking prompt: a gate
// buried in the large marking prompt slides into marking mode and rationalises
// a near-miss as "close enough" - in testing it marked a Hamlet answer handed
// in against a Measure for Measure question, because both are Shakespeare and
// share the same essay shape. A dedicated classifier with no marking apparatus
// to distract it, forced to name what the question is about and what the answer
// is about and compare them, catches that same-author / same-subject case.
//
// The bar is high and asymmetric: missing a true mismatch hands back false
// feedback, but wrongly flagging a real attempt tells a student who WAS
// answering that they answered the wrong thing. So when in any doubt, this
// treats the answer as a genuine attempt and lets marking proceed.

import Anthropic from "@anthropic-ai/sdk";

const MISMATCH_CHECK_MODEL = "claude-opus-4-8";

// Family-authored, final copy (not a voice-pass placeholder): shown to the
// student when the marker declines because the answer looks like it belongs to
// a different question or paper. Blame-free, plain English, no em-dashes, no
// jargon. The trailing full stop is the only edit on the family's wording, to
// match the first sentence.
export const MISMATCH_MESSAGE =
  "This looks like an answer to a different question. Please check the paper and try again.";

export const MISMATCH_CHECK_SYSTEM_PROMPT = `You are a gate that runs before an exam answer is marked. Your only job is to decide whether the student's answer is a genuine attempt at THIS paper's question(s), or whether it belongs to a different question, text, or paper.

Why this matters. If an answer to a different paper is marked, the student gets a confident score and a page of coaching on work that was never about this question: false feedback that looks authoritative. So a clear mismatch must be caught. But wrongly flagging a real attempt is just as harmful: it tells a student who genuinely was answering that they answered the wrong thing. The bar to flag a mismatch is therefore high and asymmetric.

How to decide, in order:
1. Work out what THIS question is about: the specific text, work, topic, source, or passage it names, and the thing it asks about (for example "Measure for Measure" and the Duke and Angelo; or "the causes of the First World War"; or "photosynthesis").
2. Work out what the ANSWER is actually about: the text, work, topic, characters, events, or material it discusses. Infer this from the CONTENT - the lines it quotes, the characters and scenes it names, the argument it makes - even when the answer never states which text it is about. For example, an answer built on "to be or not to be", Hamlet's hesitation and the sleep-and-death imagery is about Hamlet whether or not the word "Hamlet" appears in it.
3. Compare the two. It is a MISMATCH only when the answer is clearly about a DIFFERENT text, work, or topic than the question names. Same author or same subject does NOT make it a match: an answer about a different play by the same playwright is still a mismatch, because it does not address the text this question is about. For example, if the question is on Measure for Measure (or Coriolanus, or any other play) but the answer discusses Hamlet, Claudius and the "to be or not to be" soliloquy, that is a mismatch even though both are Shakespeare, and even if the answer never says the word "Hamlet". If the question is on a poem but the answer is about osmosis, that is a mismatch.

It is NOT a mismatch (these must pass as a genuine attempt):
- A weak, thin, confused, partial, rambling, or plain wrong answer that is still about the text or topic this question names. A poor answer to the right question is still the right question.
- An answer that takes an unusual or unconventional angle on this question.
- An answer that gets the analysis wrong but is clearly discussing the right text or topic.
- An answer where you cannot tell what it is about, or where it could plausibly be about this question. When in doubt, it is a genuine attempt.
- A blank or empty answer. That is a skip, not a mismatch.

Only call it a mismatch when you can actually name the different text or topic the answer is about. If you cannot name it, it is not a mismatch.

When the paper has several questions, judge the attempted answers against the questions they are filed under. Flag a mismatch only when the attempted answers are clearly about a different text or topic than this paper asks for and none of them genuinely addresses this paper.

Output a single JSON object, nothing else. No prose, no markdown:
{
  "question_is_about": string,
  "answer_is_about": string,
  "mismatch": boolean,
  "reason": string
}
- question_is_about: the text or topic this paper's question(s) name, in a few words.
- answer_is_about: the text or topic the answer actually discusses, in a few words.
- mismatch: true only when question_is_about and answer_is_about are clearly different works or topics.
- reason: one short sentence.`;

export function buildMismatchCheckMessage(input: {
  paper_title: string;
  paper_text: string;
  parsed_structure: string;
  answers_text: string;
}): string {
  return [
    `Paper: ${input.paper_title}`,
    "",
    "=== THE PAPER'S QUESTIONS ===",
    input.paper_text.trim(),
    "",
    "=== PARSED STRUCTURE (question numbers and text) ===",
    input.parsed_structure,
    "",
    "=== THE STUDENT'S ANSWERS ===",
    input.answers_text.trim(),
    "",
    "Decide whether the answers are a genuine attempt at THIS paper. Return the JSON only.",
  ].join("\n");
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      // fall through
    }
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }
  throw new Error("Mismatch check did not return valid JSON.");
}

// Returns whether the answers clearly belong to a different paper, plus a short
// internal note for logging (never shown to the student). Fails open: any error
// or unparseable response returns mismatch=false so a detection glitch never
// blocks a real attempt from being marked. That errs toward marking, by design.
export async function runMismatchCheck(
  client: Anthropic,
  input: {
    paper_title: string;
    paper_text: string;
    parsed_structure: string;
    answers_text: string;
  },
): Promise<{ mismatch: boolean; note: string }> {
  try {
    const response = await client.messages.create({
      model: MISMATCH_CHECK_MODEL,
      max_tokens: 1024,
      system: MISMATCH_CHECK_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: buildMismatchCheckMessage(input) }],
        },
      ],
    });
    const out = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const parsed = extractJson(out) as {
      mismatch?: unknown;
      question_is_about?: string;
      answer_is_about?: string;
      reason?: string;
    };
    const mismatch = parsed?.mismatch === true;
    const note = [
      parsed?.answer_is_about ? `answer about: ${parsed.answer_is_about}` : "",
      parsed?.question_is_about ? `question about: ${parsed.question_is_about}` : "",
      parsed?.reason ?? "",
    ]
      .filter(Boolean)
      .join("; ");
    return { mismatch, note };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.log(`[mismatch-check] check failed, proceeding to mark: ${message}`);
    return { mismatch: false, note: "" };
  }
}
