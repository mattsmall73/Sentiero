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
  examiner_report_text: string;
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
  examiner_report_text: string;
  paper_text: string;
  mark_scheme_text: string;
  parsed_structure: ParsedPaper;
  total_marks: number | null;
}): Promise<string> {
  await ensureSchema();
  const { rows } = await sql<{ id: string }>`
    INSERT INTO papers (title, examiner_report_text, paper_text, mark_scheme_text, parsed_structure, total_marks)
    VALUES (
      ${input.title},
      ${input.examiner_report_text},
      ${input.paper_text},
      ${input.mark_scheme_text},
      ${JSON.stringify(input.parsed_structure)}::jsonb,
      ${input.total_marks}
    )
    RETURNING id
  `;
  return rows[0].id;
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
  answers: Answers;
  marking_results: MarkingResults;
  results_html: string;
}): Promise<void> {
  await ensureSchema();
  // Persist the answers that were actually marked in the same statement that
  // locks the session. Autosave is debounced (and can be skipped entirely by a
  // quick submit), so the row's answers column could otherwise be empty or
  // stale even after a successful mark - which left "Back to the paper" showing
  // an empty box and made the saved answers inconsistent with the results. The
  // submit route always knows the final answers, so write them here too.
  await sql`
    UPDATE practice_sessions
    SET answers = ${JSON.stringify(input.answers)}::jsonb,
        marking_results = ${JSON.stringify(input.marking_results)}::jsonb,
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

// TEMPORARY diagnostic read. Returns the raw submit-state columns for a session
// straight from the driver (no mapping layer), plus the connection host, so the
// results page can compare what the page actually reads against the raw row and
// rule out a mapping/driver/replica mismatch. Remove once the trace is done.
export async function debugReadSessionState(session_id: string): Promise<{
  found: boolean;
  raw: Record<string, unknown> | null;
  host: string;
}> {
  await ensureSchema();
  const { rows } = await sql`
    SELECT
      id,
      submitted_at,
      pg_typeof(submitted_at)::text AS submitted_at_pgtype,
      (submitted_at IS NOT NULL) AS submitted_at_is_set,
      (results_html IS NOT NULL) AS has_results_html,
      octet_length(results_html) AS results_html_len,
      (marking_results IS NOT NULL) AS has_marking,
      (answers IS NOT NULL AND answers::text <> '{}') AS has_answer
    FROM practice_sessions
    WHERE id = ${session_id}
    LIMIT 1
  `;
  let host = "unknown";
  try {
    const url = process.env.POSTGRES_URL ?? "";
    host = url ? new URL(url).host : "POSTGRES_URL-empty";
  } catch {
    host = "unparseable";
  }
  return { found: rows.length > 0, raw: rows[0] ?? null, host };
}
