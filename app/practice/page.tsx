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

// Politics first by decision, so it is the default subject; the field is still
// a confirmed input, not a silent assumption. Level is required and offered as a
// fixed set, because it anchors what a strong answer is.
const LEVELS = ["GCSE", "A-level", "Undergraduate"];

export default function Page() {
  const router = useRouter();
  const [subject, setSubject] = useState("Politics");
  const [level, setLevel] = useState("");
  const [topic, setTopic] = useState("");
  const [userName, setUserName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canStart =
    subject.trim().length > 0 && level.length > 0 && topic.trim().length > 0 && !submitting;

  async function start() {
    if (!canStart) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/practice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          level,
          topic: topic.trim(),
          user_name: userName.trim() || null,
        }),
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
              <h2>Subject and level</h2>
              <p style={{ fontSize: 14, color: "var(--panel-muted)", marginTop: -8, marginBottom: 14 }}>
                Your level matters: the same topic is a different question at GCSE and at degree
                level, and it&apos;s how we judge what a strong answer looks like for you.
              </p>
              <input
                className="name-input"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                aria-label="Subject"
                style={{ marginBottom: 16 }}
              />
              <div className="time-manual-label" style={{ marginBottom: 10 }}>
                Level
              </div>
              <div className="time-options">
                {LEVELS.map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    className={`time-btn${level === lv ? " selected" : ""}`}
                    onClick={() => setLevel(lv)}
                  >
                    <span className="label">{lv}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="step-label">Step two</div>
              <h2>What are you revising?</h2>
              <p style={{ fontSize: 14, color: "var(--panel-muted)", marginTop: -8, marginBottom: 14 }}>
                Name a topic and we&apos;ll write you a question on it. For example: UK pressure
                groups, the role of the Supreme Court, or first-past-the-post.
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
