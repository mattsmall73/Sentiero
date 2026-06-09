import { sql } from "@vercel/postgres";
import { ensureSchema } from "./db";

// Exam Practice persistence. Ported from Help!'s lib/db.ts, adapted onto
// Sentiero's @vercel/postgres + lazy ensureSchema() pattern. The third
// artefact is named honestly throughout: examiner_report_text (Help! still
// carries the spec_text fossil).

export type ParsedQuestion = {
  number: string;
  text: string;
  marks: number;
  type?: string;
};

export type ParsedSection = {
  title: string;
  instructions?: string;
  suggested_minutes?: number;
  questions: ParsedQuestion[];
};

export type ParsedPaper = {
  paper_title: string;
  total_marks: number;
  sections: ParsedSection[];
};

export type TimerState = {
  elapsed_seconds: number;
  paused: boolean;
  last_started_at?: number | null;
};

export type Answers = Record<string, string>;

export type MarkedQuestion = {
  number: string;
  mark_awarded: number;
  mark_available: number;
  // false when the student left the question blank (a skip, not a gap). The
  // renderer also treats an empty answer as not attempted, so this stays
  // optional for sessions marked before the field existed.
  attempted?: boolean;
  what_worked: string;
  what_the_scheme_wanted: string;
  next_step: string;
  closing_line?: string | null;
};

export type MarkingResults = {
  // The marking pass also reports whether the answer looks like it belongs to a
  // different question or text. When detected, the submit route declines (no
  // mark, no coaching) rather than storing this result. Optional so sessions
  // marked before the field existed still type-check.
  answer_mismatch?: { detected: boolean; note: string };
  overall_summary: string;
  total_mark: number;
  total_available: number;
  headline_next_step: string;
  questions: MarkedQuestion[];
};

export type PaperRow = {
  id: string;
  created_at: string;
  title: string | null;
  // null when the subject has no examiner's report (a structural absence, not a
  // gap). The marking flow coerces null to "" when building the prompt.
  examiner_report_text: string | null;
  paper_text: string;
  mark_scheme_text: string;
  parsed_structure: ParsedPaper;
  total_marks: number | null;
};

export type PracticeSessionRow = {
  id: string;
  paper_id: string;
  created_at: string;
  updated_at: string;
  user_name: string | null;
  total_minutes: number;
  answers: Answers;
  timer_state: TimerState;
  submitted_at: string | null;
  marking_results: MarkingResults | null;
  results_html: string | null;
};

export async function createPaper(input: {
  title: string | null;
  examiner_report_text: string | null;
  paper_text: string;
  mark_scheme_text: string;
  parsed_structure: ParsedPaper;
  total_marks: number | null;
  // Parse-cache identity (see lib/exam-cache.ts). Stamped on every row so the
  // first upload of a paper seeds the cache and later uploads can find it.
  cache_key: string;
  parse_version: string;
  // Report transcription cache: the report file's byte hash (version-stamped).
  // NULL when no report was uploaded. Seeds findCachedReportText for reuse.
  report_cache_key: string | null;
}): Promise<string> {
  await ensureSchema();
  const { rows } = await sql<{ id: string }>`
    INSERT INTO papers (title, examiner_report_text, paper_text, mark_scheme_text, parsed_structure, total_marks, cache_key, parse_version, report_cache_key)
    VALUES (
      ${input.title},
      ${input.examiner_report_text},
      ${input.paper_text},
      ${input.mark_scheme_text},
      ${JSON.stringify(input.parsed_structure)}::jsonb,
      ${input.total_marks},
      ${input.cache_key},
      ${input.parse_version},
      ${input.report_cache_key}
    )
    RETURNING id
  `;
  return rows[0].id;
}

// Look up a previously transcribed examiner's report by its byte-hash cache key.
// A hit returns the stored text so the caller can skip the Haiku transcription
// of a byte-identical report file. Only rows that actually stored report text
// qualify (a NULL report never serves a hit). Oldest match wins for stability.
export async function findCachedReportText(report_cache_key: string): Promise<string | null> {
  await ensureSchema();
  const { rows } = await sql<{ examiner_report_text: string | null }>`
    SELECT examiner_report_text
    FROM papers
    WHERE report_cache_key = ${report_cache_key} AND examiner_report_text IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 1
  `;
  return rows[0]?.examiner_report_text ?? null;
}

// Look up a previously parsed paper by its cache identity. A hit returns the
// parse output (structure + total) AND the cached paper/mark-scheme text. Since
// the key is the raw file bytes, that text is a valid transcription of this same
// upload, so the caller copies it onto the new row and skips both the Haiku
// transcription and the Opus parse. The caller still stores this upload's own
// examiner's report, so marking is unaffected. The oldest matching row wins, so
// a concurrent double-miss settles on a single stable seed.
export async function findCachedParse(
  cache_key: string,
  parse_version: string,
): Promise<{
  parsed_structure: ParsedPaper;
  total_marks: number | null;
  paper_text: string;
  mark_scheme_text: string;
} | null> {
  await ensureSchema();
  const { rows } = await sql<{
    parsed_structure: ParsedPaper;
    total_marks: number | null;
    paper_text: string;
    mark_scheme_text: string;
  }>`
    SELECT parsed_structure, total_marks, paper_text, mark_scheme_text
    FROM papers
    WHERE cache_key = ${cache_key} AND parse_version = ${parse_version}
    ORDER BY created_at ASC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function createSession(input: {
  paper_id: string;
  user_name: string | null;
  total_minutes: number;
}): Promise<string> {
  await ensureSchema();
  const { rows } = await sql<{ id: string }>`
    INSERT INTO practice_sessions (paper_id, user_name, total_minutes)
    VALUES (${input.paper_id}, ${input.user_name}, ${input.total_minutes})
    RETURNING id
  `;
  return rows[0].id;
}

export async function getSessionWithPaper(
  session_id: string,
): Promise<{ session: PracticeSessionRow; paper: PaperRow } | null> {
  await ensureSchema();
  const { rows } = await sql`
    SELECT
      s.id, s.paper_id, s.created_at, s.updated_at, s.user_name, s.total_minutes,
      s.answers, s.timer_state, s.submitted_at, s.marking_results, s.results_html,
      p.id AS p_id, p.created_at AS p_created_at, p.title AS p_title,
      p.examiner_report_text, p.paper_text, p.mark_scheme_text, p.parsed_structure, p.total_marks
    FROM practice_sessions s
    JOIN papers p ON p.id = s.paper_id
    WHERE s.id = ${session_id}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    session: {
      id: r.id,
      paper_id: r.paper_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
      user_name: r.user_name,
      total_minutes: r.total_minutes,
      answers: r.answers ?? {},
      timer_state: r.timer_state ?? { elapsed_seconds: 0, paused: true },
      submitted_at: r.submitted_at,
      marking_results: r.marking_results,
      results_html: r.results_html,
    },
    paper: {
      id: r.p_id,
      created_at: r.p_created_at,
      title: r.p_title,
      examiner_report_text: r.examiner_report_text,
      paper_text: r.paper_text,
      mark_scheme_text: r.mark_scheme_text,
      parsed_structure: r.parsed_structure,
      total_marks: r.total_marks,
    },
  };
}

export async function updateSessionProgress(input: {
  session_id: string;
  answers?: Answers;
  timer_state?: TimerState;
}): Promise<void> {
  await ensureSchema();
  if (input.answers !== undefined && input.timer_state !== undefined) {
    await sql`
      UPDATE practice_sessions
      SET answers = ${JSON.stringify(input.answers)}::jsonb,
          timer_state = ${JSON.stringify(input.timer_state)}::jsonb,
          updated_at = now()
      WHERE id = ${input.session_id} AND submitted_at IS NULL
    `;
  } else if (input.answers !== undefined) {
    await sql`
      UPDATE practice_sessions
      SET answers = ${JSON.stringify(input.answers)}::jsonb,
          updated_at = now()
      WHERE id = ${input.session_id} AND submitted_at IS NULL
    `;
  } else if (input.timer_state !== undefined) {
    await sql`
      UPDATE practice_sessions
      SET timer_state = ${JSON.stringify(input.timer_state)}::jsonb,
          updated_at = now()
      WHERE id = ${input.session_id} AND submitted_at IS NULL
    `;
  }
}

export async function submitSession(input: {
  session_id: string;
  marking_results: MarkingResults;
  results_html: string;
}): Promise<void> {
  await ensureSchema();
  await sql`
    UPDATE practice_sessions
    SET marking_results = ${JSON.stringify(input.marking_results)}::jsonb,
        results_html = ${input.results_html},
        submitted_at = now(),
        updated_at = now()
    WHERE id = ${input.session_id} AND submitted_at IS NULL
  `;
}

export async function getPaper(paper_id: string): Promise<PaperRow | null> {
  await ensureSchema();
  const { rows } = await sql<PaperRow>`
    SELECT id, created_at, title, examiner_report_text, paper_text, mark_scheme_text, parsed_structure, total_marks
    FROM papers WHERE id = ${paper_id} LIMIT 1
  `;
  return rows[0] ?? null;
}
