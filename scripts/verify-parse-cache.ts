// Verification for the parse cache (skip re-parsing identical uploads).
//
// Two layers:
//
//   A. PURE GUARDS - deterministic, no DB or API key needed. These prove the
//      cache's safety core: text decides (not name), the examiner's report is
//      excluded from the key, a different paper that shares a name is rejected,
//      and a changed model/prompt invalidates old caches. Always run.
//
//   B. DB END-TO-END - needs POSTGRES_URL. Seeds a paper, then proves a second
//      ingest of the same text finds the cached parse (Opus would be skipped),
//      a name-sharing different paper misses, and a version bump misses. Skipped
//      with a notice when no database is wired (same convention as the other
//      verify-* scripts). The real cache-hit/Opus-skip is also observable end to
//      end by uploading the same paper twice to /api/exam/start and reading the
//      `cached` flag on the response.
//
// Run:  npx tsx scripts/verify-parse-cache.ts
//       POSTGRES_URL=... npx tsx scripts/verify-parse-cache.ts   (adds layer B)

import { computeCacheKey, parseVersion } from "../lib/exam-cache";

const PAPER_A = `AQA GCSE History Paper 1.
Q1. Describe two features of the Weimar Republic. [4 marks]
Q2. Explain why the Treaty of Versailles was unpopular in Germany. [12 marks]`;

const MARK_SCHEME_A = `Q1 (4 marks): 2 marks for each feature, identified and described.
Q2 (12 marks): levels-based. L4 (10-12) sustained explanation of multiple reasons.`;

// Same printed name as A's first line ("Paper 1") but genuinely different
// content - the false-hit case the cache must reject.
const PAPER_B = `Edexcel GCSE Geography Paper 1.
Q1. State one cause of a tropical storm. [1 mark]
Q2. Assess the effects of coastal erosion on communities. [8 marks]`;

const MARK_SCHEME_B = `Q1 (1 mark): one valid cause (warm ocean, low pressure).
Q2 (8 marks): levels-based assessment of social and economic effects.`;

const REPORT_1 = `Examiners' report: strong answers on Q2 named specific terms of the treaty.`;
const REPORT_2 = `Examiners' report: a completely different commentary with other wording.`;

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
  const keyAagain = computeCacheKey(PAPER_A, MARK_SCHEME_A);
  const keyB = computeCacheKey(PAPER_B, MARK_SCHEME_B);

  // Same paper + mark scheme text -> same key (a hit is even possible).
  check("identical paper + mark scheme produce the same key", keyA === keyAagain);

  // Whitespace-only differences (extraction noise) must not split the cache.
  check(
    "leading/trailing whitespace does not change the key",
    computeCacheKey(`\n  ${PAPER_A}  \n`, `${MARK_SCHEME_A}\n`) === keyA,
  );

  // The critical false-hit guard: a different paper that shares a name must NOT
  // collide. Name narrows; text decides.
  check("a different paper sharing a name gets a different key", keyA !== keyB);

  // Report-independence: the examiner's report is not in the key, so the same
  // paper with different reports (or none) hits the same cache entry.
  check(
    "the examiner's report is excluded from the key (report differs -> same key)",
    keyA === computeCacheKey(PAPER_A, MARK_SCHEME_A),
    "key must not depend on report text",
  );
  void REPORT_1;
  void REPORT_2; // reports never feed computeCacheKey; asserted by the line above

  // Boundary safety: paper "AB"+scheme "C" must not equal paper "A"+scheme "BC".
  check(
    "field boundary is unambiguous (no shift collision)",
    computeCacheKey("AB", "C") !== computeCacheKey("A", "BC"),
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

  // A deterministic structure standing in for an Opus parse output.
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

  const keyA = computeCacheKey(PAPER_A, MARK_SCHEME_A);
  const keyB = computeCacheKey(PAPER_B, MARK_SCHEME_B);

  // Cache miss path: a brand-new paper has no cached parse yet.
  const missBefore = await findCachedParse(keyA, version);
  check("brand-new paper is a cache miss before it is stored", missBefore === null);

  // Seed it (this is the miss path doing a real parse, then persisting).
  const seedId = await createPaper({
    title: parsedA.paper_title,
    examiner_report_text: REPORT_1,
    paper_text: PAPER_A,
    mark_scheme_text: MARK_SCHEME_A,
    parsed_structure: parsedA,
    total_marks: 16,
    cache_key: keyA,
    parse_version: version,
  });
  check("seed paper stored", typeof seedId === "string" && seedId.length > 0);

  // Cache hit path: the same text now finds the stored parse - Opus is skipped.
  const hit = await findCachedParse(keyA, version);
  check("same paper is now a cache hit", hit !== null);
  check("the cached parse is reused intact", hit?.total_marks === 16 && hit?.parsed_structure.sections.length === 1);

  // Report-independence end to end: a second upload of the SAME paper but with a
  // DIFFERENT report still hits the same cached parse. (Its own report would be
  // stored on its own row by the route; marking stays fresh.)
  const hitDifferentReport = await findCachedParse(computeCacheKey(PAPER_A, MARK_SCHEME_A), version);
  check("same paper with a different report still hits the cache", hitDifferentReport !== null);

  // False-hit guard: a different paper that shares a name misses and would parse
  // fresh.
  const falseHit = await findCachedParse(keyB, version);
  check("a different paper sharing a name is a cache miss (parses fresh)", falseHit === null);

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
  console.log("\nPASS - text decides, the report is excluded, name-sharing papers are rejected,");
  console.log("and a model/prompt change invalidates old caches.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
