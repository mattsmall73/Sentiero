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
  // The examiner's report is nullable: English papers have one, but many
  // subjects (sociology, politics, maths) do not. A NULL here means "no report
  // exists for this subject", not "the student forgot one".
  await sql`
    CREATE TABLE IF NOT EXISTS papers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now(),
      title text,
      examiner_report_text text,
      paper_text text NOT NULL,
      mark_scheme_text text NOT NULL,
      parsed_structure jsonb NOT NULL,
      total_marks integer,
      -- Parse cache (see lib/exam-cache.ts). cache_key is sha256(paper + mark
      -- scheme text); parse_version stamps the model + prompt that produced the
      -- parse. A hit on (cache_key, parse_version) reuses the stored parse and
      -- skips the Opus parse. Nullable so rows that predate the cache simply
      -- never match and re-parse.
      cache_key text,
      parse_version text,
      -- Report transcription cache (see lib/exam-cache.ts). report_cache_key is
      -- the report file's byte hash, version-stamped by the transcription model
      -- + prompt. A hit reuses the stored examiner_report_text instead of
      -- re-running the Haiku transcription. NULL when no report was uploaded.
      report_cache_key text
    )
  `;
  // Self-migrate existing deployments where the column was created NOT NULL
  // (before the report became optional). Idempotent: a no-op once nullable.
  await sql`ALTER TABLE papers ALTER COLUMN examiner_report_text DROP NOT NULL`;
  // Self-migrate deployments created before the parse cache existed. Idempotent.
  await sql`ALTER TABLE papers ADD COLUMN IF NOT EXISTS cache_key text`;
  await sql`ALTER TABLE papers ADD COLUMN IF NOT EXISTS parse_version text`;
  await sql`ALTER TABLE papers ADD COLUMN IF NOT EXISTS report_cache_key text`;
  await sql`CREATE INDEX IF NOT EXISTS papers_cache_lookup_idx ON papers (cache_key, parse_version)`;
  await sql`CREATE INDEX IF NOT EXISTS papers_report_cache_idx ON papers (report_cache_key)`;
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

  // Practice tool (the third Sentiero tool). Distinct from Exam Practice above:
  // there is no uploaded paper or real mark scheme. The student names a topic, a
  // question is generated, and the answer earns coaching plus a PROGRESS score
  // (not an exam mark). A prompt row holds the generated question and an internal
  // marking guide (level descriptors used only to keep the progress score
  // consistent run-to-run); an attempt row holds one student's freeform answer
  // and, once coached, the stored results. Unlike a sat paper, an attempt never
  // locks: the answer stays editable so "back to your answer" from the coaching
  // screen returns to the working page with the work intact.
  await sql`
    CREATE TABLE IF NOT EXISTS practice_prompts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now(),
      subject text NOT NULL,
      topic text NOT NULL,
      question text NOT NULL,
      marking_guide jsonb NOT NULL,
      user_name text
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS practice_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      prompt_id uuid NOT NULL REFERENCES practice_prompts(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      user_name text,
      answer text NOT NULL DEFAULT '',
      submitted_at timestamptz,
      coaching_results jsonb,
      results_html text
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS practice_attempts_prompt_id_idx ON practice_attempts (prompt_id)`;

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
