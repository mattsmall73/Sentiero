"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "../exam/exam.css";

// The Practice entry screen. Same flowchart layout and wording structure as the
// other tools (it reuses the exam tool's stylesheet, scoped under .exam-root), so
// it sits in the same world. The student names a topic; a politics practice
// question is generated from it.
//
// NOTE (voice pass): all student-facing copy here is a working draft for the
// family's voice pass, flagged like the other tools - not final wording.

export default function Page() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [userName, setUserName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canStart = topic.trim().length > 0 && !submitting;

  async function start() {
    if (!canStart) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/practice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), user_name: userName.trim() || null }),
      });
      let json: { attempt_id?: string; error?: string };
      try {
        json = await res.json();
      } catch {
        setError("Something went wrong. Try again.");
        setSubmitting(false);
        return;
      }
      if (!res.ok || !json.attempt_id) {
        setError(json.error || "Something went wrong.");
        setSubmitting(false);
        return;
      }
      router.push(`/practice/${json.attempt_id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <div className="exam-root">
      <div className="app">
        <div className="brand">
          <div className="brand-mark">Sentiero · Practice</div>
          <h1>Practice</h1>
          <div className="tagline">Name what you&apos;re revising. Get a question, and warm coaching back.</div>
          <div className="brand-back">
            <a href="/">← back to home</a>
          </div>
        </div>

        {submitting ? (
          <div className="card">
            <div className="loading">
              <div className="loading-text">Writing you a question...</div>
              <div className="loading-dots">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="card">
              <div className="step-label">Step one</div>
              <h2>What are you revising?</h2>
              <p style={{ fontSize: 14, color: "var(--panel-muted)", marginTop: -8, marginBottom: 14 }}>
                Name a politics topic and we&apos;ll write you a question on it. For example: UK
                pressure groups, the role of the Supreme Court, or first-past-the-post.
              </p>
              <input
                className="name-input"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="A topic you're studying"
                onKeyDown={(e) => {
                  if (e.key === "Enter") start();
                }}
              />
              <div style={{ fontSize: 12, color: "var(--panel-muted)", marginTop: 10, fontStyle: "italic" }}>
                Politics to start with. This is practice, not a real exam, so the score you get back
                is a progress score, not a grade.
              </div>
            </div>

            <div className="card">
              <div className="step-label">Optional</div>
              <h2>Your name</h2>
              <p style={{ fontSize: 14, color: "var(--panel-muted)", marginTop: -8, marginBottom: 14 }}>
                We&apos;ll put this at the top of your coaching.
              </p>
              <input
                className="name-input"
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Your name"
              />
            </div>

            <button className="generate" disabled={!canStart} onClick={start}>
              Generate a question
            </button>

            {error && <div className="error">{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}
