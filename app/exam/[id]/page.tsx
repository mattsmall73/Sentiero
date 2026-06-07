import { notFound, redirect } from "next/navigation";
import { getSessionWithPaper } from "@/lib/exam-db";
import AnswerClient from "./AnswerClient";
import "../exam.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Adapted down to Next 14: params are synchronous here (Help! was on Next 16,
// where params is a Promise that must be awaited).
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
            <p style={{ color: "var(--panel-muted)" }}>
              Set <code>POSTGRES_URL</code>, redeploy, and this page will load.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const row = await getSessionWithPaper(id);
  if (!row) notFound();

  if (row.session.submitted_at) {
    redirect(`/exam/${id}/results`);
  }

  return (
    <AnswerClient
      sessionId={row.session.id}
      paperTitle={row.paper.title ?? row.paper.parsed_structure.paper_title ?? "Paper"}
      parsed={row.paper.parsed_structure}
      initialAnswers={row.session.answers ?? {}}
      initialTimer={row.session.timer_state ?? { elapsed_seconds: 0, paused: true }}
      totalMinutes={row.session.total_minutes}
      userName={row.session.user_name}
    />
  );
}
