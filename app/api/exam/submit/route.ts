// Body size: Vercel Functions cap requests at 4.5MB by default. The submit
// payload is a JSON object of all answers, so long extended-response papers
// can approach the limit. There is no App Router route-segment config to
// raise this. Fix is Vercel → Project → Settings → Functions → Fluid Compute
// (raises to ~100MB on Pro).

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { MARKING_SYSTEM_PROMPT, buildMarkingUserMessage } from "@/lib/exam-marking-prompt";
import { MISMATCH_MESSAGE, runMismatchCheck } from "@/lib/exam-mismatch-check";
import { getSessionWithPaper, submitSession, MarkingResults } from "@/lib/exam-db";
import { renderResultsHtml } from "@/lib/exam-results-html";

export const runtime = "nodejs";
export const maxDuration = 300;

const MARKING_MODEL = "claude-opus-4-8";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server is missing ANTHROPIC_API_KEY." }, { status: 500 });
  }
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  let body: { session_id?: string; answers?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON." }, { status: 400 });
  }
  if (!body.session_id) {
    return NextResponse.json({ error: "Missing session_id." }, { status: 400 });
  }

  const row = await getSessionWithPaper(body.session_id);
  if (!row) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (row.session.submitted_at) {
    return NextResponse.json({ error: "Already submitted.", session_id: body.session_id });
  }

  const finalAnswers = body.answers ?? row.session.answers ?? {};

  const answersText = formatAnswersForPrompt(row.paper.parsed_structure, finalAnswers);

  const client = new Anthropic({ apiKey });

  // Detect-and-decline gate, before any marking (see lib/exam-mismatch-check.ts).
  // A clear answer-to-a-different-paper mismatch returns no mark and no coaching:
  // we leave the session unsubmitted - no submitted_at, no stored results - so
  // the answers stay editable and the student can re-check the upload, and show a
  // short, blame-free nudge instead of a results page. The note is the check's
  // internal reason; it is logged, never shown to the student. Running this first
  // also skips the long marking call when we are going to decline anyway.
  const check = await runMismatchCheck(client, {
    paper_title: row.paper.title ?? row.paper.parsed_structure.paper_title ?? "Paper",
    paper_text: row.paper.paper_text,
    parsed_structure: JSON.stringify(row.paper.parsed_structure, null, 2),
    answers_text: answersText,
  });
  if (check.mismatch) {
    console.log(`[mismatch-decline] session=${body.session_id} ${check.note}`);
    return NextResponse.json({ status: "mismatch", message: MISMATCH_MESSAGE });
  }

  let marking: MarkingResults;
  try {
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
                paper_title: row.paper.title ?? row.paper.parsed_structure.paper_title ?? "Paper",
                examiner_report_text: row.paper.examiner_report_text ?? "",
                paper_text: row.paper.paper_text,
                mark_scheme_text: row.paper.mark_scheme_text,
                parsed_structure: JSON.stringify(row.paper.parsed_structure, null, 2),
                answers_text: answersText,
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
    marking = extractJson(out) as MarkingResults;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Marking failed: ${message}` }, { status: 502 });
  }

  if (
    !marking ||
    !Array.isArray(marking.questions) ||
    typeof marking.total_mark !== "number" ||
    typeof marking.total_available !== "number"
  ) {
    return NextResponse.json(
      { error: "The marker returned an unexpected shape. Try again." },
      { status: 502 },
    );
  }

  const html = renderResultsHtml({
    paper_title: row.paper.title ?? row.paper.parsed_structure.paper_title ?? "Paper",
    user_name: row.session.user_name,
    practised_at: new Date(row.session.created_at),
    elapsed_seconds: row.session.timer_state?.elapsed_seconds ?? 0,
    parsed: row.paper.parsed_structure,
    answers: finalAnswers,
    marking,
  });

  try {
    await submitSession({
      session_id: body.session_id,
      marking_results: marking,
      results_html: html,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not save results: ${message}` }, { status: 500 });
  }

  return NextResponse.json({ session_id: body.session_id });
}

function formatAnswersForPrompt(
  parsed: { sections: { title: string; questions: { number: string; text: string; marks: number }[] }[] },
  answers: Record<string, string>,
): string {
  const blocks: string[] = [];
  for (const section of parsed.sections) {
    blocks.push(`--- ${section.title} ---`);
    for (const q of section.questions) {
      const a = (answers[q.number] ?? "").trim();
      blocks.push(`Q${q.number} (${q.marks} marks): ${q.text}`);
      blocks.push(a ? `Answer: ${a}` : `Answer: (left blank)`);
      blocks.push("");
    }
  }
  return blocks.join("\n");
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
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      // fall through
    }
  }
  throw new Error("Model did not return valid JSON.");
}
