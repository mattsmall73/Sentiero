import { createHash } from "node:crypto";
import { PARSING_SYSTEM_PROMPT } from "./exam-parsing-prompt";

// Parse-cache identity. Past papers don't change, so an identical paper + mark
// scheme should reuse a stored parse instead of paying for the Opus parse again.
// See the cache brief: name narrows but text decides, and the examiner's report
// is deliberately NOT part of the key.

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

// The cache key is the extracted text of the paper + mark scheme ONLY.
//
// - The examiner's report is excluded on purpose: it has no field to land in the
//   parse output (the parse is pure structure), and the one thing that consumes
//   the report - marking - reads it fresh from its own column on every sit. So a
//   parse is report-invariant by schema, and two uploads of the same paper share
//   one cached parse whether a report was supplied or not.
// - The filename is NOT in the key: filenames are unreliable (two different
//   papers can both be "Paper 1.pdf"), so text, not name, authorises a reuse.
//
// Length-prefixing each field makes the boundary unambiguous, so paper "A" +
// scheme "BC" can never hash the same as paper "AB" + scheme "C".
export function computeCacheKey(paperText: string, markSchemeText: string): string {
  const paper = paperText.trim();
  const markScheme = markSchemeText.trim();
  return sha256(`paper:${paper.length}:${paper}\nmark_scheme:${markScheme.length}:${markScheme}`);
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
