import { notFound } from "next/navigation";
import { getSessionWithPaper, debugReadSessionState } from "@/lib/exam-db";
import ResultsClient from "./ResultsClient";
import "../../exam.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Adapted down to Next 14: params are synchronous (Help! awaited a Promise).
export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { debug?: string };
}) {
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
            <p style={{ color: "var(--panel-muted)" }}>
              Set <code>POSTGRES_URL</code> and redeploy.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const row = await getSessionWithPaper(id);

  // TEMPORARY runtime trace. Active only with ?debug=1. Reports exactly what the
  // page reads (via getSessionWithPaper) next to the raw driver row (via a
  // separate diagnostic query) and the deployed commit + DB host, so we can see
  // whether the read object's submitted_at differs from the column, which guard
  // branch would be taken, and whether the deployed code/DB are what we expect.
  if (searchParams?.debug === "1") {
    const dbg = await debugReadSessionState(id);
    const submittedAt = row?.session.submitted_at;
    const resultsHtml = row?.session.results_html;
    const branch = !row
      ? "notFound"
      : !row.session.submitted_at
        ? "NOT-MARKED-YET"
        : !row.session.results_html
          ? "MARKED-LOADING"
          : "RESULTS-CLIENT";
    const report = {
      params_id: id,
      deployed_commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "(unset)",
      deployed_branch: process.env.VERCEL_GIT_COMMIT_REF ?? "(unset)",
      db_host: dbg.host,
      page_read: {
        getSessionWithPaper_returned: row ? "row" : "null",
        "session.submitted_at value": submittedAt ?? null,
        "session.submitted_at typeof": typeof submittedAt,
        "session.submitted_at truthy": Boolean(submittedAt),
        "session.results_html typeof": typeof resultsHtml,
        "session.results_html length": typeof resultsHtml === "string" ? resultsHtml.length : null,
        "session.results_html first20":
          typeof resultsHtml === "string" ? resultsHtml.slice(0, 20) : null,
      },
      raw_driver_row: dbg,
      guard_branch_taken: branch,
    };
    // Also emit to the server log for anyone reading Vercel logs.
    console.error("[results-debug]", JSON.stringify(report));
    return (
      <div className="exam-root">
        <div className="app">
          <div className="brand">
            <div className="brand-mark">Sentiero · Exam Practice</div>
            <h1>Results debug</h1>
          </div>
          <div className="card">
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 12,
                color: "var(--panel-ink)",
                margin: 0,
              }}
            >
              {JSON.stringify(report, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  if (!row) notFound();

  // submitted_at is the authoritative signal that a paper was submitted and
  // marked: the submit route sets it atomically alongside marking_results and
  // results_html. Key the not-marked screen on it alone — a session that HAS
  // been submitted must never be told it hasn't been. Folding results_html into
  // this same guard is what let a marked row fall through to "not submitted".
  if (!row.session.submitted_at) {
    return (
      <div className="exam-root">
        <div className="app">
          <div className="brand">
            <div className="brand-mark">Sentiero · Exam Practice</div>
            <h1>Not marked yet</h1>
          </div>
          <div className="card">
            <p style={{ color: "var(--panel-muted)" }}>
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

  // Submitted and marked, but the rendered artefact is missing. This should not
  // happen — submitSession writes results_html in the same statement as
  // submitted_at — but if it ever does, tell the truth (the paper WAS marked)
  // and offer a reload rather than the misleading "you haven't submitted" copy.
  if (!row.session.results_html) {
    return (
      <div className="exam-root">
        <div className="app">
          <div className="brand">
            <div className="brand-mark">Sentiero · Exam Practice</div>
            <h1>Marked — loading your results</h1>
          </div>
          <div className="card">
            <p style={{ color: "var(--panel-muted)" }}>
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
