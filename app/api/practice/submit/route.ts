import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  PRACTICE_MARKING_SYSTEM_PROMPT,
  buildPracticeMarkingUserMessage,
} from "@/lib/practice-marking-prompt";
import {
  getAttemptWithPrompt,
  saveCoaching,
  updateAttemptAnswer,
  PracticeCoaching,
} from "@/lib/practice-db";
import { renderPracticeResultsHtml } from "@/lib/practice-results-html";

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

  let body: { attempt_id?: string; answer?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON." }, { status: 400 });
  }
  if (!body.attempt_id) {
    return NextResponse.json({ error: "Missing attempt_id." }, { status: 400 });
  }

  const row = await getAttemptWithPrompt(body.attempt_id);
  if (!row) {
    return NextResponse.json({ error: "Practice not found." }, { status: 404 });
  }

  // Trust the answer in the body (the live editor) over the autosaved copy, but
  // fall back to the saved answer so a missed autosave never loses work.
  const answer = (body.answer ?? row.attempt.answer ?? "").toString();

  const client = new Anthropic({ apiKey });

  let coaching: PracticeCoaching;
  try {
    const response = await client.messages.create({
      model: MARKING_MODEL,
      max_tokens: 4000,
      system: PRACTICE_MARKING_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildPracticeMarkingUserMessage({
                subject: row.prompt.subject,
                level: row.prompt.level ?? "",
                topic: row.prompt.topic,
                question: row.prompt.question,
                marking_guide: JSON.stringify(row.prompt.marking_guide, null, 2),
                answer,
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
    coaching = extractJson(out) as PracticeCoaching;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Coaching failed: ${message}` }, { status: 502 });
  }

  if (
    !coaching ||
    typeof coaching.progress_score !== "number" ||
    typeof coaching.what_worked !== "string"
  ) {
    return NextResponse.json(
      { error: "The coaching came back in an unexpected shape. Try again." },
      { status: 502 },
    );
  }
  // Normalise the score into range so a stray value never breaks the dial.
  const max = typeof coaching.progress_max === "number" && coaching.progress_max > 0 ? coaching.progress_max : 100;
  coaching.progress_max = max;
  coaching.progress_score = Math.max(0, Math.min(max, Math.round(coaching.progress_score)));

  const html = renderPracticeResultsHtml({
    subject: row.prompt.subject,
    level: row.prompt.level ?? "",
    topic: row.prompt.topic,
    question: row.prompt.question,
    user_name: row.attempt.user_name,
    practised_at: new Date(row.attempt.created_at),
    answer,
    coaching,
  });

  try {
    // Persist the latest answer first, so the working page and the stored
    // results never disagree if the student got here without a final autosave.
    await updateAttemptAnswer({ attempt_id: body.attempt_id, answer });
    await saveCoaching({ attempt_id: body.attempt_id, coaching_results: coaching, results_html: html });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not save the coaching: ${message}` }, { status: 500 });
  }

  return NextResponse.json({ attempt_id: body.attempt_id });
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
