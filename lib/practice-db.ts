import { sql } from "@vercel/postgres";
import { ensureSchema } from "./db";

// Persistence for the Practice tool (the third Sentiero tool). See the schema
// notes in lib/db.ts: a generated question lives on a prompt row, and each
// student's freeform answer lives on an attempt row. The progress score is a
// practice indication of progress, never an exam mark, so nothing here clones
// the exam tool's papers / practice_sessions tables.

// One level on the internal progress scale. These descriptors are generated
// alongside the question and are NEVER shown to the student. They exist only to
// anchor the progress score so it lands the same way run-to-run (the
// band-consistency requirement the progress number depends on).
export type ProgressLevel = {
  label: string;
  min: number;
  max: number;
  descriptor: string;
};

export type MarkingGuide = {
  scale_max: number;
  // Prose, internal: what a strong answer to this question actually does. Feeds
  // the coaching's "what a strong answer also does" move; never shown verbatim.
  what_strong_answers_do: string;
  levels: ProgressLevel[];
};

export type GeneratedQuestion = {
  question: string;
  marking_guide: MarkingGuide;
};

// The coaching the marking pass returns for a single freeform answer. Mirrors
// the exam tool's per-question coaching shape (so the same soul rules port over)
// but carries a PROGRESS score and a band label instead of an exam mark.
export type PracticeCoaching = {
  progress_score: number;
  progress_max: number;
  band_label: string;
  // true when the answer sat on a band boundary and was resolved upward. The
  // results screen surfaces this honestly rather than implying a clean placing.
  borderline?: boolean;
  what_worked: string;
  what_a_strong_answer_adds: string;
  next_step: string;
  encouragement?: string | null;
};

export type PracticePromptRow = {
  id: string;
  created_at: string;
  subject: string;
  // The student's chosen level (for example "A-level"). Required: it anchors what
  // a strong answer is, so generation and marking work to a real standard rather
  // than a floating, invented one. Captured/confirmed at entry, never inferred.
  level: string;
  topic: string;
  question: string;
  marking_guide: MarkingGuide;
  user_name: string | null;
};

export type PracticeAttemptRow = {
  id: string;
  prompt_id: string;
  created_at: string;
  updated_at: string;
  user_name: string | null;
  answer: string;
  submitted_at: string | null;
  coaching_results: PracticeCoaching | null;
  results_html: string | null;
};

export async function createPrompt(input: {
  subject: string;
  level: string;
  topic: string;
  question: string;
  marking_guide: MarkingGuide;
  user_name: string | null;
}): Promise<string> {
  await ensureSchema();
  const { rows } = await sql<{ id: string }>`
    INSERT INTO practice_prompts (subject, level, topic, question, marking_guide, user_name)
    VALUES (
      ${input.subject},
      ${input.level},
      ${input.topic},
      ${input.question},
      ${JSON.stringify(input.marking_guide)}::jsonb,
      ${input.user_name}
    )
    RETURNING id
  `;
  return rows[0].id;
}

export async function createAttempt(input: {
  prompt_id: string;
  user_name: string | null;
}): Promise<string> {
  await ensureSchema();
  const { rows } = await sql<{ id: string }>`
    INSERT INTO practice_attempts (prompt_id, user_name)
    VALUES (${input.prompt_id}, ${input.user_name})
    RETURNING id
  `;
  return rows[0].id;
}

export async function getAttemptWithPrompt(
  attempt_id: string,
): Promise<{ attempt: PracticeAttemptRow; prompt: PracticePromptRow } | null> {
  await ensureSchema();
  const { rows } = await sql`
    SELECT
      a.id, a.prompt_id, a.created_at, a.updated_at, a.user_name, a.answer,
      a.submitted_at, a.coaching_results, a.results_html,
      p.id AS p_id, p.created_at AS p_created_at, p.subject, p.level, p.topic,
      p.question, p.marking_guide, p.user_name AS p_user_name
    FROM practice_attempts a
    JOIN practice_prompts p ON p.id = a.prompt_id
    WHERE a.id = ${attempt_id}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    attempt: {
      id: r.id,
      prompt_id: r.prompt_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
      user_name: r.user_name,
      answer: r.answer ?? "",
      submitted_at: r.submitted_at,
      coaching_results: r.coaching_results,
      results_html: r.results_html,
    },
    prompt: {
      id: r.p_id,
      created_at: r.p_created_at,
      subject: r.subject,
      level: r.level,
      topic: r.topic,
      question: r.question,
      marking_guide: r.marking_guide,
      user_name: r.p_user_name,
    },
  };
}

// Autosave the freeform answer. Deliberately NOT gated on submitted_at: practice
// is not a locked sit, so an answer stays editable after coaching and a student
// can revise and ask for coaching again. This is what keeps "back to your
// answer" honest - the work is never wiped or frozen.
export async function updateAttemptAnswer(input: {
  attempt_id: string;
  answer: string;
}): Promise<void> {
  await ensureSchema();
  await sql`
    UPDATE practice_attempts
    SET answer = ${input.answer}, updated_at = now()
    WHERE id = ${input.attempt_id}
  `;
}

export async function saveCoaching(input: {
  attempt_id: string;
  coaching_results: PracticeCoaching;
  results_html: string;
}): Promise<void> {
  await ensureSchema();
  await sql`
    UPDATE practice_attempts
    SET coaching_results = ${JSON.stringify(input.coaching_results)}::jsonb,
        results_html = ${input.results_html},
        submitted_at = COALESCE(submitted_at, now()),
        updated_at = now()
    WHERE id = ${input.attempt_id}
  `;
}
