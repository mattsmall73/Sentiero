import { notFound } from "next/navigation";
import { getAttemptWithPrompt } from "@/lib/practice-db";
import ResultsClient from "./ResultsClient";
import "../../../exam/exam.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Read fresh, never from the Data Cache (same reasoning as the exam results
// route): a pre-coaching read of this URL must not be served stale after the
// coaching is written.
export const fetchCache = "force-no-store";

export default async function Page({ params }: { params: { id: string } }) {
  const { id } = params;
  if (!process.env.POSTGRES_URL) {
    return (
      <div className="exam-root">
        <div className="app">
          <div className="brand">
            <div className="brand-mark">Sentiero · Practise</div>
            <h1>Practise</h1>
          </div>
          <div className="card">
            <h2>Database not set up yet</h2>
            <p style={{ color: "var(--panel-muted)" }}>
              Set <code>POSTGRES_URL</code> and redeploy.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const row = await getAttemptWithPrompt(id);
  if (!row) notFound();

  if (!row.attempt.results_html) {
    return (
      <div className="exam-root">
        <div className="app">
          <div className="brand">
            <div className="brand-mark">Sentiero · Practise</div>
            <h1>No coaching yet</h1>
          </div>
          <div className="card">
            <p style={{ color: "var(--panel-muted)" }}>
              This question hasn&apos;t been coached yet. Go back and write your answer first.
            </p>
            <div style={{ marginTop: 16 }}>
              <a
                href={`/practice/${id}`}
                className="exam-btn primary"
                style={{ display: "inline-block", textDecoration: "none", padding: "12px 24px" }}
              >
                Back to your answer
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <ResultsClient html={row.attempt.results_html} attemptId={row.attempt.id} />;
}
