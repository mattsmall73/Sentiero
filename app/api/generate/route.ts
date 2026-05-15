import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { extractFromFile, extractFromPastedText, type ExtractResult } from "@/lib/extract";
import { SYSTEM_PROMPT, buildUserMessage } from "@/lib/system-prompt";
import { insertGuide } from "@/lib/db";
import { extractTitleFromHtml } from "@/lib/title";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = "claude-sonnet-4-20250514";

function parseTotalMinutes(raw: FormDataEntryValue | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s || s === "null" || s === "undefined") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function parseName(raw: FormDataEntryValue | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s.slice(0, 80) : null;
}

function stripHtmlFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return t.trim();
}

async function readInput(req: NextRequest): Promise<{
  extracted: ExtractResult;
  totalMinutes: number | null;
  userName: string | null;
}> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    const pasted = form.get("text");
    const totalMinutes = parseTotalMinutes(form.get("total_minutes"));
    const userName = parseName(form.get("user_name"));

    let extracted: ExtractResult = { text: null, images: [], sourceLabel: null };
    if (file instanceof File && file.size > 0) {
      extracted = await extractFromFile(file);
    } else if (typeof pasted === "string" && pasted.trim().length > 0) {
      extracted = extractFromPastedText(pasted);
    }
    return { extracted, totalMinutes, userName };
  }

  const body = (await req.json().catch(() => ({}))) as {
    text?: string;
    total_minutes?: number | null;
    user_name?: string | null;
  };
  const extracted: ExtractResult =
    typeof body.text === "string" && body.text.trim().length > 0
      ? extractFromPastedText(body.text)
      : { text: null, images: [], sourceLabel: null };
  return {
    extracted,
    totalMinutes:
      typeof body.total_minutes === "number" && Number.isFinite(body.total_minutes) && body.total_minutes > 0
        ? Math.round(body.total_minutes)
        : null,
    userName: parseName(body.user_name ?? null),
  };
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Server not configured: ANTHROPIC_API_KEY missing." }, { status: 500 });
  }

  let extracted: ExtractResult;
  let totalMinutes: number | null;
  let userName: string | null;
  try {
    ({ extracted, totalMinutes, userName } = await readInput(req));
  } catch (err) {
    console.error("Input parse failed", err);
    return NextResponse.json({ error: "Could not read upload. Try a different file." }, { status: 400 });
  }

  const hasText = !!(extracted.text && extracted.text.trim().length > 0);
  const hasImages = extracted.images.length > 0;
  if (!hasText && !hasImages) {
    return NextResponse.json(
      { error: "Add a file or paste some text before generating." },
      { status: 400 },
    );
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userText = buildUserMessage({
    extractedText: extracted.text,
    images: extracted.images,
    totalMinutes,
    userName,
    sourceLabel: extracted.sourceLabel,
  });

  const content: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];
  for (const img of extracted.images) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.base64 },
    });
  }
  content.push({ type: "text", text: userText });

  let html: string;
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) {
      return NextResponse.json({ error: "Generation returned no content." }, { status: 502 });
    }
    html = stripHtmlFences(textBlock.text);
  } catch (err) {
    console.error("Anthropic call failed", err);
    return NextResponse.json({ error: "Generation failed. Try again in a moment." }, { status: 502 });
  }

  if (!html.toLowerCase().includes("<!doctype html") && !html.toLowerCase().includes("<html")) {
    return NextResponse.json({ error: "Generation produced an unexpected format." }, { status: 502 });
  }

  const title = extractTitleFromHtml(html);

  try {
    const id = await insertGuide({ htmlContent: html, title, userName });
    return NextResponse.json({ id, title });
  } catch (err) {
    console.error("DB insert failed", err);
    return NextResponse.json({ error: "Could not save the guide." }, { status: 500 });
  }
}
