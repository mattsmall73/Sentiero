import { notFound } from "next/navigation";
import { getAttemptWithPrompt } from "@/lib/practice-db";
import PracticeClient from "./PracticeClient";
import "../../exam/exam.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Read fresh, never from the Data Cache: the answer is read over HTTP via
// @vercel/postgres, and "back to your answer" from the coaching screen must
// always show the live, saved answer rather than a stale cached read.
export const fetchCache = "force-no-store";

export default async function Page({ params }: { params: { id: string } }) {
  const { id } = params;
  if (!process.env.POSTGRES_URL) {
    return (
      <div className="exam-root">
        <div className="app">
          <div className="brand">
            <div className="brand-mark">Sentiero · Practice</div>
            <h1>Practice</h1>
          </div>
          <div className="card">
            <h2>Database not set up yet</h2>
            <p style={{ color: "var(--panel-muted)" }}>
              Set <code>POSTGRES_URL</code>, redeploy, and this page will load.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const row = await getAttemptWithPrompt(id);
  if (!row) notFound();

  // Deliberately NOT redirecting to results when coaching exists: practice is
  // not a locked sit. Returning here from the coaching screen lands on the
  // working page with the answer intact and editable, and offers a link back to
  // the coaching the student already has.
  return (
    <PracticeClient
      attemptId={row.attempt.id}
      subject={row.prompt.subject}
      level={row.prompt.level ?? ""}
      topic={row.prompt.topic}
      question={row.prompt.question}
      initialAnswer={row.attempt.answer ?? ""}
      hasCoaching={Boolean(row.attempt.results_html)}
      userName={row.attempt.user_name}
    />
  );
}
