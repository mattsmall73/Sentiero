// Transcription model + prompt for server-side extraction of PDFs and images
// (see lib/exam-extract.ts). Factored into its own module so the report
// transcription cache can version-stamp cached text by the model + prompt that
// produced it - mirroring how the parse cache stamps parses. A change here
// invalidates cached report text instead of serving a stale transcription.

export const TRANSCRIBE_MODEL = "claude-haiku-4-5-20251001";

export const TRANSCRIBE_SYSTEM_PROMPT =
  "You are a faithful transcriber. Extract the full text from the attached file as plain text, preserving question numbering, marks (e.g. '[4 marks]'), and section headings exactly as printed. Do not summarise. Do not add commentary. Output the transcribed text only.";
