import mammoth from "mammoth";

export type ExtractResult = {
  text: string | null;
  images: { mediaType: ImageMediaType; base64: string }[];
  // PDFs with no usable text layer (scans, photos saved as PDF) are sent to
  // Claude whole so it can read the pages visually.
  pdfs: { base64: string }[];
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

// Below this many characters per page we treat a PDF as scanned.
const MIN_PDF_CHARS_PER_PAGE = 100;

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
    let text = "";
    let pages = 1;
    try {
      const result = await pdfParse(buffer);
      text = (result.text || "").trim();
      pages = Math.max(1, result.numpages || 1);
    } catch (err) {
      console.warn("pdf-parse failed, sending PDF to the model instead", err);
    }
    if (text.length < MIN_PDF_CHARS_PER_PAGE * pages) {
      return {
        text: null,
        images: [],
        pdfs: [{ base64: buffer.toString("base64") }],
        sourceLabel: name,
      };
    }
    return {
      text: clampText(text),
      images: [],
      pdfs: [],
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
      pdfs: [],
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
      pdfs: [],
      sourceLabel: name,
    };
  }

  if (type.startsWith("text/") || /\.(txt|md|csv)$/i.test(name)) {
    return {
      text: clampText(buffer.toString("utf8")),
      images: [],
      pdfs: [],
      sourceLabel: name,
    };
  }

  return {
    text: clampText(buffer.toString("utf8")),
    images: [],
    pdfs: [],
    sourceLabel: name,
  };
}

export function extractFromPastedText(text: string): ExtractResult {
  return {
    text: clampText(text),
    images: [],
    pdfs: [],
    sourceLabel: null,
  };
}
