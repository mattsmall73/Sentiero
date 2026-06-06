import { sql } from "@vercel/postgres";

export type GuideRow = {
  id: string;
  html_content: string;
  title: string | null;
  user_name: string | null;
  created_at: string;
};

export type GuideSummary = {
  id: string;
  title: string | null;
  created_at: string;
};

let migrated = false;

export async function ensureSchema(): Promise<void> {
  if (migrated) return;
  await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`;
  await sql`
    CREATE TABLE IF NOT EXISTS guides (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      html_content text NOT NULL,
      title text,
      user_name text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS guides_created_at_idx ON guides (created_at DESC)`;

  // Exam Practice tables. Same structure as Help!'s, with the third artefact
  // named honestly: examiner_report_text (Help! still calls this spec_text).
  await sql`
    CREATE TABLE IF NOT EXISTS papers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now(),
      title text,
      examiner_report_text text NOT NULL,
      paper_text text NOT NULL,
      mark_scheme_text text NOT NULL,
      parsed_structure jsonb NOT NULL,
      total_marks integer
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS practice_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      paper_id uuid NOT NULL REFERENCES papers(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      user_name text,
      total_minutes integer NOT NULL,
      answers jsonb NOT NULL DEFAULT '{}'::jsonb,
      timer_state jsonb NOT NULL DEFAULT '{"elapsed_seconds": 0, "paused": true}'::jsonb,
      submitted_at timestamptz,
      marking_results jsonb,
      results_html text
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS practice_sessions_paper_id_idx ON practice_sessions (paper_id)`;
  await sql`CREATE INDEX IF NOT EXISTS practice_sessions_submitted_at_idx ON practice_sessions (submitted_at)`;

  migrated = true;
}

export async function insertGuide(params: {
  htmlContent: string;
  title: string | null;
  userName: string | null;
}): Promise<string> {
  await ensureSchema();
  const { rows } = await sql<{ id: string }>`
    INSERT INTO guides (html_content, title, user_name)
    VALUES (${params.htmlContent}, ${params.title}, ${params.userName})
    RETURNING id
  `;
  return rows[0].id;
}

export async function getGuide(id: string): Promise<GuideRow | null> {
  await ensureSchema();
  const { rows } = await sql<GuideRow>`
    SELECT id, html_content, title, user_name, created_at
    FROM guides
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getGuideSummaries(ids: string[]): Promise<GuideSummary[]> {
  const clean = ids.filter((id) => UUID_RE.test(id));
  if (clean.length === 0) return [];
  await ensureSchema();
  const { rows } = await sql.query<GuideSummary>(
    `SELECT id, title, created_at::text AS created_at
     FROM guides
     WHERE id = ANY($1::uuid[])
     ORDER BY created_at DESC`,
    [clean],
  );
  return rows;
}
