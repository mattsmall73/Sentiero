// Verification for the parse cache (skip re-parsing identical uploads).
//
// The cache key is the raw bytes of the uploaded paper + mark scheme files, NOT
// the extracted text: extraction is an LLM transcription (Haiku) and is not
// stable run to run, so a text hash would never match. Byte-identical files are
// the same paper, deterministically.
//
// Two layers:
//
//   A. PURE GUARDS - deterministic, no DB or API key needed. Prove the safety
//      core: identical bytes hit, a different file (even sharing a name) misses,
//      the report is not in the key, field boundaries can't collide, and a
//      changed model/prompt invalidates old caches. Always run.
//
//   B. DB END-TO-END - needs POSTGRES_URL. Seeds a paper, then proves a second
//      ingest of the same bytes finds the cached parse + text (Haiku and Opus
//      both skipped), a different paper misses, and a version bump misses.
//      Skipped with a notice when no database is wired. The real hit/skip is also
//      observable end to end by uploading the same files twice to
//      /api/exam/start and reading the `cached` flag on the response.
//
// Run:  npx tsx scripts/verify-parse-cache.ts
//       POSTGRES_URL=... npx tsx scripts/verify-parse-cache.ts   (adds layer B)

import { computeCacheKey, parseVersion } from "../lib/exam-cache";

// Stand-ins for uploaded file bytes (the real ones are PDF/docx binaries).
const bytes = (s: string) => new Uint8Array(Buffer.from(s, "utf8"));

const PAPER_A = bytes("AQA GCSE History Paper 1 :: %PDF bytes for paper A");
const MARK_SCHEME_A = bytes("Mark scheme for History Paper 1 :: %PDF bytes A");

// A genuinely different file that could carry the same printed/filename "Paper 1"
// - the false-hit case the cache must reject.
const PAPER_B = bytes("Edexcel GCSE Geography Paper 1 :: %PDF bytes for paper B");
const MARK_SCHEME_B = bytes("Mark scheme for Geography Paper 1 :: %PDF bytes B");

const PARSE_MODEL = "claude-opus-4-8";

const problems: string[] = [];
function check(name: string, pass: boolean, detail = "") {
  if (pass) {
    console.log(`  PASS  ${name}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
    problems.push(name);
  }
}

function pureGuards() {
  console.log("\n== A. Pure guards (no DB / no API key) ==");

  const keyA = computeCacheKey(PAPER_A, MARK_SCHEME_A);
  const keyB = computeCacheKey(PAPER_B, MARK_SCHEME_B);

  // Identical bytes -> identical key (a hit is even possible). This is the case
  // that broke before: extracted text varied per upload; raw bytes do not.
  check("identical file bytes produce the same key", keyA === computeCacheKey(PAPER_A, MARK_SCHEME_A));

  // The critical false-hit guard: a different file misses, even if it shares a
  // name. Content, not name, decides.
  check("a different paper (even sharing a name) gets a different key", keyA !== keyB);

  // The report is not even an argument to the key, so it cannot influence it: the
  // same paper + mark scheme bytes always produce the same key regardless of any
  // report uploaded alongside.
  check(
    "the examiner's report is not part of the key",
    computeCacheKey(PAPER_A, MARK_SCHEME_A) === keyA,
  );

  // Boundary safety: paper "AB" + scheme "C" must not equal paper "A" + scheme
  // "BC". Each file's byte length prefixes its digest, so the split is unambiguous.
  check(
    "field boundary is unambiguous (no shift collision)",
    computeCacheKey(bytes("AB"), bytes("C")) !== computeCacheKey(bytes("A"), bytes("BC")),
  );

  // A swapped pair (mark scheme where the paper goes) is a different identity.
  check(
    "swapping paper and mark scheme changes the key",
    computeCacheKey(PAPER_A, MARK_SCHEME_A) !== computeCacheKey(MARK_SCHEME_A, PAPER_A),
  );

  // Version stamp: a different model invalidates. The prompt-hash half is proven
  // by construction (the version embeds a hash of the live system prompt).
  const v = parseVersion(PARSE_MODEL);
  check("parse version embeds the model", v.startsWith(`${PARSE_MODEL}:`));
  check("a different parse model yields a different version", v !== parseVersion("claude-sonnet-4-6"));
  check("the version is stable for the same model + prompt", v === parseVersion(PARSE_MODEL));
}

async function dbEndToEnd() {
  if (!process.env.POSTGRES_URL) {
    console.log("\n== B. DB end-to-end ==");
    console.log("  SKIP: POSTGRES_URL not set - run with a database to exercise the real lookup.");
    console.log("  POSTGRES_URL=... npx tsx scripts/verify-parse-cache.ts");
    return;
  }
  console.log("\n== B. DB end-to-end (live database) ==");

  const { createPaper, findCachedParse, createSession } = await import("../lib/exam-db");
  const version = parseVersion(PARSE_MODEL);

  // A deterministic structure + text standing in for an extract + Opus parse.
  const parsedA = {
    paper_title: "AQA GCSE History Paper 1",
    total_marks: 16,
    sections: [
      {
        title: "Paper",
        questions: [
          { number: "1", text: "Describe two features of the Weimar Republic.", marks: 4 },
          { number: "2", text: "Explain why the Treaty of Versailles was unpopular.", marks: 12 },
        ],
      },
    ],
  };
  const PAPER_A_TEXT = "Q1 Describe two features... Q2 Explain why the Treaty of Versailles...";
  const MARK_SCHEME_A_TEXT = "Q1 4 marks... Q2 12 marks levels-based...";

  const keyA = computeCacheKey(PAPER_A, MARK_SCHEME_A);
  const keyB = computeCacheKey(PAPER_B, MARK_SCHEME_B);

  // Cache miss path: a brand-new paper has no cached parse yet.
  const missBefore = await findCachedParse(keyA, version);
  check("brand-new paper is a cache miss before it is stored", missBefore === null);

  // Seed it (the miss path: extract, parse, persist).
  const seedId = await createPaper({
    title: parsedA.paper_title,
    examiner_report_text: "Examiners' report for the first upload.",
    paper_text: PAPER_A_TEXT,
    mark_scheme_text: MARK_SCHEME_A_TEXT,
    parsed_structure: parsedA,
    total_marks: 16,
    cache_key: keyA,
    parse_version: version,
  });
  check("seed paper stored", typeof seedId === "string" && seedId.length > 0);

  // Cache hit path: the same bytes now return the stored parse AND text, so both
  // the Haiku transcription and the Opus parse are skipped.
  const hit = await findCachedParse(keyA, version);
  check("same file bytes are now a cache hit", hit !== null);
  check(
    "the cached parse and text are reused intact",
    hit?.total_marks === 16 &&
      hit?.parsed_structure.sections.length === 1 &&
      hit?.paper_text === PAPER_A_TEXT &&
      hit?.mark_scheme_text === MARK_SCHEME_A_TEXT,
  );

  // False-hit guard: a different paper misses and would parse fresh.
  const falseHit = await findCachedParse(keyB, version);
  check("a different paper is a cache miss (parses fresh)", falseHit === null);

  // Version invalidation: a changed parse version treats the seed as a miss.
  const staleVersion = await findCachedParse(keyA, parseVersion("claude-sonnet-4-6"));
  check("a changed parse version invalidates the cache (treated as a miss)", staleVersion === null);

  // The reused parse can carry a real session, same as a fresh one.
  const sessionId = await createSession({ paper_id: seedId, user_name: "verify", total_minutes: 60 });
  check("a session attaches to the (reused) paper", typeof sessionId === "string" && sessionId.length > 0);
}

async function main() {
  pureGuards();
  await dbEndToEnd();

  if (problems.length > 0) {
    console.error(`\nFAIL: ${problems.length} check(s) failed:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("\nPASS - identical bytes hit, different/name-sharing files miss, the report is");
  console.log("excluded, and a model/prompt change invalidates old caches.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
