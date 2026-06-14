"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const SAVE_DEBOUNCE_MS = 2000;

// NOTE (voice pass): the loading-step lines and the button/heading copy below are
// working drafts for the family's voice pass, like the exam tool. No timer here:
// practice is freeform by decision, and timing scaffolding is intentionally not
// built yet.
const COACH_MESSAGES = [
  "Reading your answer...",
  "Weighing what landed...",
  "Working out the next move...",
  "Writing it up warmly...",
];

type Props = {
  attemptId: string;
  topic: string;
  question: string;
  initialAnswer: string;
  hasCoaching: boolean;
  userName: string | null;
};

export default function PracticeClient(props: Props) {
  const router = useRouter();
  const [answer, setAnswer] = useState(props.initialAnswer);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [coachIdx, setCoachIdx] = useState(0);
  const [error, setError] = useState("");

  const answerRef = useRef(answer);
  answerRef.current = answer;
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(
    async (value: string) => {
      setSaveState("saving");
      try {
        const res = await fetch("/api/practice/autosave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attempt_id: props.attemptId, answer: value }),
        });
        setSaveState(res.ok ? "saved" : "error");
      } catch {
        setSaveState("error");
      }
    },
    [props.attemptId],
  );

  function onAnswerChange(value: string) {
    setAnswer(value);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => persist(answerRef.current), SAVE_DEBOUNCE_MS);
  }

  // Best-effort save on leaving the page, so closing the tab mid-answer keeps the
  // work (the same guarantee that makes "back to your answer" honest).
  useEffect(() => {
    const onBeforeUnload = () => {
      try {
        navigator.sendBeacon?.(
          "/api/practice/autosave",
          new Blob([JSON.stringify({ attempt_id: props.attemptId, answer: answerRef.current })], {
            type: "application/json",
          }),
        );
      } catch {
        // best-effort only
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [props.attemptId]);

  async function saveAndExit() {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    await persist(answerRef.current);
    router.push("/");
  }

  async function getCoaching() {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    setSubmitting(true);
    setError("");
    setCoachIdx(0);
    const tick = setInterval(() => {
      setCoachIdx((i) => Math.min(i + 1, COACH_MESSAGES.length - 1));
    }, 6000);
    try {
      const res = await fetch("/api/practice/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attempt_id: props.attemptId, answer }),
      });
      const json = await res.json();
      clearInterval(tick);
      if (!res.ok) {
        setError(json.error || "Coaching failed.");
        setSubmitting(false);
        return;
      }
      // Full-document navigation, like the exam tool: it bypasses the Router
      // Cache so the freshly written coaching is what loads, with no stale flash.
      window.location.assign(`/practice/${props.attemptId}/results`);
    } catch (err) {
      clearInterval(tick);
      const message = err instanceof Error ? err.message : "Network error";
      setError(message);
      setSubmitting(false);
    }
  }

  if (submitting) {
    return (
      <div className="exam-root">
        <div className="app">
          <div className="brand">
            <div className="brand-mark">Sentiero · Practice</div>
            <h1>Coaching</h1>
            <div className="tagline">This takes a few seconds. Hold tight.</div>
          </div>
          <div className="card">
            <div className="loading">
              <div className="loading-text">{COACH_MESSAGES[coachIdx]}</div>
              <div className="loading-dots">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const wordCount = answer.trim() ? answer.trim().split(/\s+/).length : 0;

  return (
    <div className="exam-root">
      <div className="app exam-sit">
        <div className="exam-header">
          <div className="exam-title">{props.topic}</div>
          <div className="exam-save-state">{renderSaveState(saveState)}</div>
        </div>

        {props.userName && (
          <div
            style={{
              textAlign: "center",
              marginBottom: 18,
              fontFamily: "Fraunces, Georgia, serif",
              fontStyle: "italic",
              color: "var(--on-dark-muted)",
            }}
          >
            For {props.userName}
          </div>
        )}

        <section className="exam-section">
          <h2 className="exam-section-header">Your practice question</h2>
          <div className="exam-section-instructions">
            Answer in your own words, in as much detail as you can. There&apos;s no timer, and this
            is practice, so the score you get back is a progress score, not a grade.
          </div>
          <div className="exam-question">
            <div className="exam-question-text">{props.question}</div>
            <textarea
              className="exam-answer"
              placeholder="Your answer..."
              value={answer}
              onChange={(e) => onAnswerChange(e.target.value)}
              style={{ minHeight: 280 }}
            />
            <div style={{ fontSize: 12, color: "var(--panel-muted)", marginTop: 6 }}>
              {wordCount} {wordCount === 1 ? "word" : "words"}
            </div>
          </div>
        </section>

        <div className="exam-actions">
          <button className="exam-btn" onClick={saveAndExit}>
            Save and exit
          </button>
          {props.hasCoaching && (
            <button
              className="exam-btn"
              onClick={() => router.push(`/practice/${props.attemptId}/results`)}
            >
              View your coaching
            </button>
          )}
          <button className="exam-btn primary" onClick={getCoaching} disabled={!answer.trim()}>
            {props.hasCoaching ? "Get coaching again" : "Get coaching"}
          </button>
        </div>

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}

function renderSaveState(state: "idle" | "saving" | "saved" | "error"): string {
  switch (state) {
    case "saving":
      return "Saving...";
    case "saved":
      return "Saved";
    case "error":
      return "Couldn't save";
    default:
      return "";
  }
}
