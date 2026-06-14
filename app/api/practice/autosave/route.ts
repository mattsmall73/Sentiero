import { NextRequest, NextResponse } from "next/server";
import { updateAttemptAnswer } from "@/lib/practice-db";

export const runtime = "nodejs";

// Autosaves the freeform answer as the student types. Not gated on submission:
// an answer stays editable after coaching so "back to your answer" returns to
// the working page with the work intact (the back-navigation requirement).
export async function POST(req: NextRequest) {
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

  try {
    await updateAttemptAnswer({ attempt_id: body.attempt_id, answer: body.answer ?? "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
