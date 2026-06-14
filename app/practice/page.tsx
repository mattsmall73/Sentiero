"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "../exam/exam.css";

// The Practice entry screen. Same flowchart layout and wording structure as the
// other tools (it reuses the exam tool's stylesheet, scoped under .exam-root), so
// it sits in the same world. The student picks a subject and level and names a
// topic; a practice question is generated from them.
//
// NOTE (voice pass): all student-facing copy here is a working draft for the
// family's voice pass, flagged like the other tools - not final wording.

// Subjects offered at entry, politics first by decision (the hardest case, and
// the stress test for the progress score). Each carries three concrete example
// topics MATCHED to the subject: the "what are you revising?" examples are filled
// from the chosen subject, never generic, because matched examples actually help
// and vague ones don't. Level is required and offered as a fixed set, because it
// anchors what a strong answer is.
const SUBJECTS: { name: string; examples: [string, string, string] }[] = [
  {
    name: "Politics",
    examples: ["UK pressure groups", "the role of the Supreme Court", "first-past-the-post"],
  },
  {
    name: "History",
    examples: ["the causes of the First World War", "the New Deal", "the fall of the Berlin Wall"],
  },
  {
    name: "Sociology",
    examples: ["functionalist views of the family", "the role of education", "explanations of crime"],
  },
  {
    name: "Economics",
    examples: ["the effects of a minimum wage", "monetary policy and inflation", "market failure"],
  },
  {
    name: "English Literature",
    examples: ["power in Macbeth", "the narrator in a novel you've studied", "imagery in a poem you know"],
  },
  {
    name: "Psychology",
    examples: ["the multi-store model of memory", "conformity and obedience", "explanations for aggression"],
  },
  {
    name: "Religious Studies",
    examples: ["arguments for the existence of God", "the problem of evil", "religious views on euthanasia"],
  },
  {
    name: "Geography",
    examples: ["causes of urbanisation", "globalisation and development", "coastal management"],
  },
];

const LEVELS = ["GCSE", "A-level", "Undergraduate"];

export default function Page() {
  const router = useRouter();
  const [subject, setSubject] = useState(SUBJECTS[0].name);
  const [level, setLevel] = useState("");
  const [topic, setTopic] = useState("");
  const [userName, setUserName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Examples matched to the chosen subject (falls back to the default subject's
  // if a value somehow doesn't match the list).
  const examples = (SUBJECTS.find((s) => s.name === subject) ?? SUBJECTS[0]).examples;

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
              <select
                className="name-input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                aria-label="Subject"
                style={{ marginBottom: 16, cursor: "pointer", appearance: "auto" }}
              >
                {SUBJECTS.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
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
                Name a topic and we&apos;ll write you a question on it. For example: {examples[0]},{" "}
                {examples[1]}, or {examples[2]}.
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
                This is practice, not a real exam, so the score you get back is a progress score, not
                a grade.
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
