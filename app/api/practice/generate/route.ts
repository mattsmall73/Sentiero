import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  GENERATION_SYSTEM_PROMPT,
  buildGenerationUserMessage,
} from "@/lib/practice-generation-prompt";
import { createAttempt, createPrompt, MarkingGuide } from "@/lib/practice-db";

export const runtime = "nodejs";
export const maxDuration = 120;

const GENERATION_MODEL = "claude-opus-4-8";
// Politics first by decision: the hardest case (open essay questions with no
// fixed answer) and so the right stress test for the progress score.
const SUBJECT = "politics";

type Body = { topic?: string; user_name?: string | null };

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server is missing ANTHROPIC_API_KEY." }, { status: 500 });
  }
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json(
      { error: "Practice needs a database. Set POSTGRES_URL and redeploy." },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON." }, { status: 400 });
  }

  const topic = (body.topic ?? "").toString().trim();
  const userName = (body.user_name ?? "").toString().trim() || null;
  if (!topic) {
    return NextResponse.json({ error: "Name a topic to practise." }, { status: 400 });
  }
  if (topic.length > 200) {
    return NextResponse.json({ error: "That topic is a little long. Try a shorter one." }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  let question: string;
  let markingGuide: MarkingGuide;
  try {
    const response = await client.messages.create({
      model: GENERATION_MODEL,
      max_tokens: 4000,
      system: GENERATION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: buildGenerationUserMessage({ subject: SUBJECT, topic }) }],
        },
      ],
    });
    const out = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const parsed = extractJson(out) as { question?: string; marking_guide?: MarkingGuide };
    if (
      !parsed?.question ||
      typeof parsed.question !== "string" ||
      !parsed.marking_guide ||
      !Array.isArray(parsed.marking_guide.levels) ||
      parsed.marking_guide.levels.length === 0
    ) {
      return NextResponse.json(
        { error: "We couldn't build a question for that. Try naming the topic a little differently." },
        { status: 502 },
      );
    }
    question = parsed.question.trim();
    markingGuide = parsed.marking_guide;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not generate a question: ${message}` }, { status: 502 });
  }

  let attemptId: string;
  try {
    const promptId = await createPrompt({
      subject: SUBJECT,
      topic,
      question,
      marking_guide: markingGuide,
      user_name: userName,
    });
    attemptId = await createAttempt({ prompt_id: promptId, user_name: userName });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not save the question: ${message}` }, { status: 500 });
  }

  return NextResponse.json({ attempt_id: attemptId });
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
