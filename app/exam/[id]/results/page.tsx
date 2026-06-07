import { notFound } from "next/navigation";
import { sql } from "@vercel/postgres";
import { getSessionWithPaper } from "@/lib/exam-db";
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
  searchParams: { debug?: string };
}) {
  const { id } = params;

  // TEMPORARY DIAGNOSTIC — remove once the marking-read issue is pinned.
  // Reports exactly what this server render sees for the URL's id and which
  // database the read resolved to, so we can compare it against an external
  // SQL check. Gated behind ?debug=1. Prints no secrets (password masked).
  if (searchParams?.debug === "1") {
    const probe: Record<string, unknown> = { id };
    try {
      const raw = process.env.POSTGRES_URL ?? "";
      if (raw) {
        const u = new URL(raw);
        probe.read_host = u.host;
        probe.read_db = u.pathname.replace(/^\//, "");
        probe.read_user = u.username;
      } else {
        probe.postgres_url = "(unset)";
      }
    } catch (e) {
      probe.postgres_url_parse_error = String(e);
    }
    try {
      const { rows } = await sql`
        SELECT current_database() AS db, current_user AS usr,
               inet_server_addr()::text AS server_addr`;
      probe.connection = rows[0];
    } catch (e) {
      probe.connection_error = String(e);
    }
    try {
      const { rows } = await sql`
        SELECT id, submitted_at,
               (results_html IS NOT NULL) AS has_results,
               (marking_results IS NOT NULL) AS has_marking,
               updated_at
        FROM practice_sessions WHERE id = ${id} LIMIT 1`;
      probe.direct_row = rows[0] ?? "(no row with this id in the read database)";
    } catch (e) {
      probe.direct_row_error = String(e);
    }
    try {
      const row = await getSessionWithPaper(id);
      probe.guard_view = row
        ? {
            submitted_at: row.session.submitted_at,
            has_results: row.session.results_html != null,
            has_marking: row.session.marking_results != null,
          }
        : "(getSessionWithPaper returned null)";
    } catch (e) {
      probe.guard_view_error = String(e);
    }
    return (
      <pre style={{ padding: 16, fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
        {JSON.stringify(probe, null, 2)}
      </pre>
    );
  }
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
  if (!row) notFound();

  if (!row.session.submitted_at || !row.session.results_html) {
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

  return (
    <ResultsClient
      html={row.session.results_html}
      paperId={row.paper.id}
      userName={row.session.user_name}
    />
  );
}
