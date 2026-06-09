import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { TRANSCRIBE_MODEL, TRANSCRIBE_SYSTEM_PROMPT } from "./exam-extract-prompt";

// Server-side extraction for Exam Practice. PDFs and images are transcribed by
// Haiku; .docx via mammoth; .txt read directly. There is NO client-side
// extraction and no in-browser pdfjs-dist anywhere — this is the iPad-safe
// pattern, and the whole point of doing it server-side.

type ContentBlock = Exclude<
  Anthropic.MessageCreateParams["messages"][number]["content"],
  string
>[number];

export type ExtractionResult = {
  blocks: ContentBlock[];
  textNotes: string[];
  fileName: string;
};

export async function extractFile(file: File): Promise<ExtractionResult> {
  const fileName = file.name;
  const buf = Buffer.from(await file.arrayBuffer());
  const lower = fileName.toLowerCase();
  const mime = file.type;

  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    return {
      fileName,
      textNotes: [],
      blocks: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") },
        },
      ],
    };
  }

  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(lower)) {
    const mediaType = (mime.startsWith("image/") ? mime : "image/png") as
      | "image/png"
      | "image/jpeg"
      | "image/gif"
      | "image/webp";
    return {
      fileName,
      textNotes: [],
      blocks: [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType, data: buf.toString("base64") },
        },
      ],
    };
  }

  if (lower.endsWith(".docx")) {
    try {
      const result = await mammoth.extractRawText({ buffer: buf });
      return {
        fileName,
        blocks: [],
        textNotes: [`--- Contents of ${fileName} ---\n${result.value}`],
      };
    } catch {
      return {
        fileName,
        blocks: [],
        textNotes: [`(Could not read ${fileName}; please paste its contents instead.)`],
      };
    }
  }

  if (lower.endsWith(".doc")) {
    return {
      fileName,
      blocks: [],
      textNotes: [`(${fileName} is an old .doc format. Please re-save as .docx or paste the text.)`],
    };
  }

  if (lower.endsWith(".txt") || mime.startsWith("text/")) {
    return {
      fileName,
      blocks: [],
      textNotes: [`--- Contents of ${fileName} ---\n${buf.toString("utf-8")}`],
    };
  }

  return {
    fileName,
    blocks: [],
    textNotes: [`(Skipped ${fileName} — unsupported file type.)`],
  };
}

// Fetches a file from a (Vercel Blob) URL into an in-memory File, without
// extracting. Split out so callers that need the raw bytes (e.g. the parse cache
// hashing the file) can fetch once and both hash and extract from the same File.
export async function fetchFileFromUrl(url: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not fetch file (${res.status}).`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "";
  let name = "upload";
  try {
    name = decodeURIComponent(new URL(url).pathname.split("/").pop() || name);
  } catch {
    // keep fallback name
  }
  return new File([arrayBuffer], name, { type: contentType });
}

// Fetches a file from a (Vercel Blob) URL and extracts its text server-side,
// reusing the same path as /api/exam/transcribe. The blob's stored
// content-type plus the filename extension drive type detection in
// extractFile, so a generic content-type still resolves via the extension.
export async function extractTextFromUrl(url: string): Promise<string> {
  const file = await fetchFileFromUrl(url);
  return extractTextOnly(file);
}

export async function extractTextOnly(file: File, pastedText?: string): Promise<string> {
  const result = await extractFile(file);
  if (result.textNotes.length > 0) {
    return result.textNotes.join("\n\n");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set; cannot extract text from PDFs or images.");
  }
  if (result.blocks.length === 0) {
    return pastedText?.trim() ?? "";
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: TRANSCRIBE_MODEL,
    max_tokens: 8000,
    system: TRANSCRIBE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          ...result.blocks,
          { type: "text", text: "Transcribe this exam-paper artefact in full as plain text." },
        ],
      },
    ],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
