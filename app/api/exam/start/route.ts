import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import Anthropic from "@anthropic-ai/sdk";
import { PARSING_SYSTEM_PROMPT, buildParsingUserMessage } from "@/lib/exam-parsing-prompt";
import { extractTextFromUrl } from "@/lib/exam-extract";
import { createPaper, createSession, findCachedParse, ParsedPaper } from "@/lib/exam-db";
import { computeCacheKey, parseVersion } from "@/lib/exam-cache";

export const runtime = "nodejs";
export const maxDuration = 300;

const PARSING_MODEL = "claude-opus-4-8";

type Body = {
  examiner_report_blob_url?: string;
  paper_blob_url?: string;
  mark_scheme_blob_url?: string;
  total_minutes?: number;
  user_name?: string | null;
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server is missing ANTHROPIC_API_KEY." }, { status: 500 });
  }
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json(
      { error: "Exam Practice needs a database. Set POSTGRES_URL and redeploy." },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON." }, { status: 400 });
  }

  const examinerReportUrl = (body.examiner_report_blob_url ?? "").toString().trim();
  const paperUrl = (body.paper_blob_url ?? "").toString().trim();
  const markSchemeUrl = (body.mark_scheme_blob_url ?? "").toString().trim();
  const userName = (body.user_name ?? "").toString().trim() || null;
  const totalMinutes =
    typeof body.total_minutes === "number" && body.total_minutes > 0
      ? Math.floor(body.total_minutes)
      : 0;

  // The examiner's report is optional: most subjects don't have one. Only the
  // paper and mark scheme are required.
  if (!paperUrl || !markSchemeUrl) {
    return NextResponse.json(
      { error: "Missing uploaded files for the paper or mark scheme." },
      { status: 400 },
    );
  }
  if (!totalMinutes) {
    return NextResponse.json(
      { error: "Set a total time (in minutes) for the paper." },
      { status: 400 },
    );
  }

  // Only blobs we actually received get cleaned up (the report may be absent).
  const blobUrls = [examinerReportUrl, paperUrl, markSchemeUrl].filter(Boolean);
  // Always clean up the uploaded blobs before returning — on success or on any
  // error. The extracted text lives in the database; we never keep originals.
  async function cleanupBlobs() {
    await Promise.all(
      blobUrls.map((url) =>
        del(url).catch(() => {
          // best effort — a failed cleanup shouldn't mask the real outcome
        }),
      ),
    );
  }

  // Server-side extraction. Fetch each blob and pull text out in Node, where
  // PDFs/images/Word docs read reliably (the client-side path failed silently
  // on iPad Safari). The paper and mark scheme are required; an unreadable one
  // is a hard error. The examiner's report is optional, so a missing or
  // unreadable report is treated as "no report" and never blocks the run.
  let paperText: string;
  let markSchemeText: string;
  try {
    [paperText, markSchemeText] = await Promise.all([
      extractTextFromUrl(paperUrl),
      extractTextFromUrl(markSchemeUrl),
    ]);
    paperText = paperText.trim();
    markSchemeText = markSchemeText.trim();
  } catch {
    await cleanupBlobs();
    return NextResponse.json(
      {
        error:
          "We couldn't read one of your files. It might be image-based or password-protected. Try a different file.",
      },
      { status: 422 },
    );
  }

  if (!paperText || !markSchemeText) {
    await cleanupBlobs();
    return NextResponse.json(
      {
        error:
          "We couldn't read one of your files. It might be image-based or password-protected. Try a different file.",
      },
      { status: 422 },
    );
  }

  // null means "no report for this subject". Stored as NULL, coerced to "" only
  // where the prompts need a string. An unreadable report falls back to null
  // rather than failing the whole paper.
  let examinerReportText: string | null = null;
  if (examinerReportUrl) {
    try {
      const extracted = (await extractTextFromUrl(examinerReportUrl)).trim();
      examinerReportText = extracted.length > 0 ? extracted : null;
    } catch {
      examinerReportText = null;
    }
  }

  // Parse cache. Past papers don't change, so if we've already parsed this exact
  // paper + mark scheme (same text, same parse version) we reuse the stored parse
  // and skip the expensive Opus call. The examiner's report is NOT part of the
  // key and is never reused: this upload's own report is stored below and feeds
  // marking fresh, exactly as before. Extraction (above) still runs every time --
  // it's what produces the text we hash.
  const cacheKey = computeCacheKey(paperText, markSchemeText);
  const cacheVersion = parseVersion(PARSING_MODEL);

  let parsed: ParsedPaper | null = null;
  let totalMarks: number | null = null;
  let cacheHit = false;

  try {
    const cached = await findCachedParse(cacheKey, cacheVersion);
    if (cached && Array.isArray(cached.parsed_structure?.sections) && cached.parsed_structure.sections.length > 0) {
      parsed = cached.parsed_structure;
      totalMarks = cached.total_marks;
      cacheHit = true;
    }
  } catch {
    // A cache lookup failure must never break ingest -- fall through to a fresh
    // parse as if it were a miss.
    parsed = null;
  }

  if (!cacheHit) {
    const client = new Anthropic({ apiKey });
    try {
      const response = await client.messages.create({
        model: PARSING_MODEL,
        max_tokens: 8000,
        system: PARSING_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildParsingUserMessage({
                  total_minutes: totalMinutes,
                  examiner_report_text: examinerReportText ?? "",
                  paper_text: paperText,
                  mark_scheme_text: markSchemeText,
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
      parsed = extractJson(out) as ParsedPaper;
    } catch {
      await cleanupBlobs();
      return NextResponse.json(
        {
          error:
            "We couldn't make sense of this paper. Check that all three uploads are the right documents.",
        },
        { status: 502 },
      );
    }

    if (!parsed || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
      await cleanupBlobs();
      return NextResponse.json(
        {
          error:
            "We couldn't make sense of this paper. Check that all three uploads are the right documents.",
        },
        { status: 502 },
      );
    }
    totalMarks = typeof parsed.total_marks === "number" ? parsed.total_marks : null;
  }

  let paperId: string;
  let sessionId: string;
  try {
    paperId = await createPaper({
      title: parsed!.paper_title || null,
      examiner_report_text: examinerReportText,
      paper_text: paperText,
      mark_scheme_text: markSchemeText,
      parsed_structure: parsed!,
      total_marks: totalMarks,
      cache_key: cacheKey,
      parse_version: cacheVersion,
    });
    sessionId = await createSession({
      paper_id: paperId,
      user_name: userName,
      total_minutes: totalMinutes,
    });
  } catch (err) {
    await cleanupBlobs();
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not save the session: ${message}` }, { status: 500 });
  }

  // Extraction and parsing succeeded — the text is in the database now, so the
  // original uploads are no longer needed.
  await cleanupBlobs();

  // `cached` reports whether the Opus parse was skipped via the cache. The client
  // ignores it; it exists so a real run can confirm a hit without DB inspection.
  return NextResponse.json({ session_id: sessionId, cached: cacheHit });
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
