import { createHash } from "node:crypto";
import { PARSING_SYSTEM_PROMPT } from "./exam-parsing-prompt";
import { TRANSCRIBE_MODEL, TRANSCRIBE_SYSTEM_PROMPT } from "./exam-extract-prompt";

// Parse-cache identity. Past papers don't change, so an identical paper + mark
// scheme should reuse a stored parse instead of paying for the Opus parse again.
// See the cache brief: name narrows but text decides, and the examiner's report
// is deliberately NOT part of the key.

const sha256Hex = (buf: Uint8Array) => createHash("sha256").update(buf).digest("hex");
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

// The cache key is the raw bytes of the uploaded paper + mark scheme files ONLY.
//
// Why bytes, not extracted text: extraction is an LLM transcription (Haiku for
// PDFs/images, default temperature) and for some formats embeds the upload's
// random-suffixed filename, so the SAME file extracts to DIFFERENT text on every
// upload. Hashing that text never matches. The raw file bytes are stable: a
// byte-identical file is the same paper, deterministically, and it's the
// realistic high-volume case (students downloading the same official board PDF
// get identical bytes). A byte hash is also known before extraction, so a hit
// can skip the Haiku transcription as well as the Opus parse.
//
// - The examiner's report is excluded on purpose: it has no field to land in the
//   parse output (the parse is pure structure), and the one thing that consumes
//   the report - marking - reads it fresh from its own column on every sit. So a
//   parse is report-invariant by schema, and two uploads of the same paper share
//   one cached parse whether a report was supplied or not.
// - The filename is NOT in the key: filenames are unreliable (two different
//   papers can both be "Paper 1.pdf"), so content, not name, authorises a reuse.
//
// Each field's byte length prefixes its digest so the boundary is unambiguous:
// paper "A" + scheme "BC" can never hash the same as paper "AB" + scheme "C".
export function computeCacheKey(paperBytes: Uint8Array, markSchemeBytes: Uint8Array): string {
  return sha256(
    `paper:${paperBytes.length}:${sha256Hex(paperBytes)}\n` +
      `mark_scheme:${markSchemeBytes.length}:${sha256Hex(markSchemeBytes)}`,
  );
}

// Version stamp for a cached parse: the parse model plus a hash of the parsing
// system prompt. A different model OR any edit to the prompt yields a different
// version, so:
//   - a bad parse can be invalidated by bumping the prompt (it stops being served
//     to every future user of that paper), and
//   - the roadmap's Opus->Sonnet parse swap auto-invalidates old caches instead
//     of serving stale structure.
// A different version is treated as a cache miss.
export function parseVersion(model: string): string {
  return `${model}:${sha256(PARSING_SYSTEM_PROMPT).slice(0, 16)}`;
}

// Cache key for a report's TRANSCRIPTION (not its parse - the report has no
// parse). The examiner's report is excluded from the parse key on purpose, but
// re-transcribing a byte-identical report file on every upload is pure waste:
// Haiku transcription of a multi-page PDF is slow. So cache the transcribed text
// keyed on the report file's bytes, stamped with the transcription model +
// prompt (a change invalidates stale text). This never affects the parse or the
// marking contract - marking still reads the report text fresh from its column;
// we only avoid re-transcribing the same file.
export function computeReportCacheKey(reportBytes: Uint8Array): string {
  const version = `${TRANSCRIBE_MODEL}:${sha256(TRANSCRIBE_SYSTEM_PROMPT).slice(0, 16)}`;
  return `${version}|${sha256Hex(reportBytes)}`;
}
