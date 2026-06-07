import { notFound } from "next/navigation";
import { getSessionWithPaper } from "@/lib/exam-db";
import ResultsClient from "./ResultsClient";
import "../../exam.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Adapted down to Next 14: params are synchronous (Help! awaited a Promise).
export default async function Page({ params }: { params: { id: string } }) {
  const { id } = params;
  if (!process.env.POSTGRES_URL) {
    return (
      <div className="exam-root">
        <div className="app">
          <div className="brand">
            <div className="brand-mark">Sentiero · Exam Practice</div>
            <h1>Exam Practice</h1>
          </div>
          <div className="card">
            <h2>Database not set up yet</h2>
            <p style={{ color: "var(--muted)" }}>
              Set <code>POSTGRES_URL</code> and redeploy.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const row = await getSessionWithPaper(id);
  if (!row) notFound();

  // submitted_at is the authoritative "this paper was submitted and marked"
  // flag: submitSession sets it in the same statement as marking_results and
  // results_html, so a set submitted_at always implies a present results_html.
  // Key the not-marked screen on submitted_at alone - folding results_html into
  // the same test is what could let a freshly marked row read as "not submitted".
  if (!row.session.submitted_at) {
    return (
      <div className="exam-root">
        <div className="app">
          <div className="brand">
            <div className="brand-mark">Sentiero · Exam Practice</div>
            <h1>Not marked yet</h1>
          </div>
          <div className="card">
            <p style={{ color: "var(--muted)" }}>
              This paper hasn&apos;t been submitted for marking. Go back and finish answering.
            </p>
            <div style={{ marginTop: 16 }}>
              <a
                href={`/exam/${id}`}
                className="exam-btn primary"
                style={{ display: "inline-block", textDecoration: "none", padding: "12px 24px" }}
              >
                Back to the paper
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Submitted and marked, but the rendered artefact is somehow absent.
  // submitSession writes results_html in the same statement as submitted_at, so
  // this should be unreachable; if it ever happens, tell the truth (the paper
  // WAS marked) and offer a reload rather than the misleading "not submitted"
  // copy. This branch reads only submit-state columns, never answer content.
  if (!row.session.results_html) {
    return (
      <div className="exam-root">
        <div className="app">
          <div className="brand">
            <div className="brand-mark">Sentiero · Exam Practice</div>
            <h1>Marked — loading your results</h1>
          </div>
          <div className="card">
            <p style={{ color: "var(--muted)" }}>
              This paper has been submitted and marked, but the results didn&apos;t come through.
              Refresh to try again.
            </p>
            <div style={{ marginTop: 16 }}>
              <a
                href={`/exam/${id}/results`}
                className="exam-btn primary"
                style={{ display: "inline-block", textDecoration: "none", padding: "12px 24px" }}
              >
                Refresh results
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ResultsClient
      html={row.session.results_html}
      paperId={row.paper.id}
      userName={row.session.user_name}
    />
  );
}
