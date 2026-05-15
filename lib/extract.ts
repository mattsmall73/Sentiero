import mammoth from "mammoth";

export type ExtractResult = {
  text: string | null;
  images: { mediaType: ImageMediaType; base64: string }[];
  sourceLabel: string | null;
};

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const IMAGE_TYPES: Record<string, ImageMediaType> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

const MAX_TEXT_CHARS = 120_000;

function clampText(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  return text.slice(0, MAX_TEXT_CHARS) + "\n\n[...document truncated...]";
}

export async function extractFromFile(file: File): Promise<ExtractResult> {
  const name = file.name || "upload";
  const type = (file.type || "").toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (type === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return {
      text: clampText(result.text || ""),
      images: [],
      sourceLabel: name,
    };
  }

  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.toLowerCase().endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: clampText(result.value || ""),
      images: [],
      sourceLabel: name,
    };
  }

  if (type in IMAGE_TYPES || /\.(jpe?g|png|gif|webp)$/i.test(name)) {
    const mediaType: ImageMediaType =
      IMAGE_TYPES[type] ??
      (name.match(/\.(jpe?g)$/i)
        ? "image/jpeg"
        : name.match(/\.png$/i)
          ? "image/png"
          : name.match(/\.gif$/i)
            ? "image/gif"
            : "image/webp");
    return {
      text: null,
      images: [{ mediaType, base64: buffer.toString("base64") }],
      sourceLabel: name,
    };
  }

  if (type.startsWith("text/") || /\.(txt|md|csv)$/i.test(name)) {
    return {
      text: clampText(buffer.toString("utf8")),
      images: [],
      sourceLabel: name,
    };
  }

  return {
    text: clampText(buffer.toString("utf8")),
    images: [],
    sourceLabel: name,
  };
}

export function extractFromPastedText(text: string): ExtractResult {
  return {
    text: clampText(text),
    images: [],
    sourceLabel: null,
  };
}
