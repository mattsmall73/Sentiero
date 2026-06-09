"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Answers, ParsedPaper, TimerState } from "@/lib/exam-db";

const SAVE_DEBOUNCE_MS = 2000;
const TIMER_PERSIST_MS = 15000;

// NOTE (voice pass): the loading-step messages and the confirm-modal copy are
// ported drafts, de-sweared, for the family's voice pass.
const SUBMIT_MESSAGES = [
  "Reading every answer...",
  "Cross-checking the mark scheme...",
  "Weighing what landed...",
  "Working out the next move...",
  "Writing it up properly...",
];

type Props = {
  sessionId: string;
  paperTitle: string;
  parsed: ParsedPaper;
  initialAnswers: Answers;
  initialTimer: TimerState;
  totalMinutes: number;
  userName: string | null;
};

export default function AnswerClient(props: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(props.initialAnswers);
  const [timer, setTimer] = useState<TimerState>(props.initialTimer);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitIdx, setSubmitIdx] = useState(0);
  const [error, setError] = useState("");
  // Set when the marker declines because the answer looks like it belongs to a
  // different question or paper. Shown inline; the answers stay editable so the
  // student can re-check the upload and resubmit.
  const [mismatch, setMismatch] = useState("");

  const totalSeconds = props.totalMinutes * 60;

  // A freshly parsed, not-yet-cached paper is occasionally handed to this view
  // before its parsed structure has fully populated (a rare load race that only
  // shows on the slow cache-miss path; a cache hit is instant and never races).
  // Rendering the questions then throws on props.parsed.sections. Treat a paper
  // without usable sections as not-ready and wait, rather than assuming it.
  const paperReady =
    Array.isArray(props.parsed?.sections) && props.parsed.sections.length > 0;

  const answersRef = useRef(answers);
  const timerRef = useRef(timer);
  answersRef.current = answers;
  timerRef.current = timer;

  const saveAnswersTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTimerPersist = useRef<number>(Date.now());

  const persist = useCallback(
    async (payload: { answers?: Answers; timer_state?: TimerState }) => {
      setSaveState("saving");
      try {
        const res = await fetch("/api/exam/autosave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: props.sessionId, ...payload }),
        });
        if (!res.ok) {
          setSaveState("error");
          return;
        }
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [props.sessionId],
  );

  function onAnswerChange(questionNumber: string, value: string) {
    // Editing clears a prior mismatch nudge - the student is acting on it.
    if (mismatch) setMismatch("");
    setAnswers((prev) => {
      const next = { ...prev, [questionNumber]: value };
      return next;
    });
    if (saveAnswersTimeout.current) clearTimeout(saveAnswersTimeout.current);
    saveAnswersTimeout.current = setTimeout(() => {
      persist({ answers: answersRef.current });
    }, SAVE_DEBOUNCE_MS);
  }

  useEffect(() => {
    if (timer.paused) return;
    const tick = setInterval(() => {
      setTimer((prev) => {
        if (prev.paused) return prev;
        return { ...prev, elapsed_seconds: prev.elapsed_seconds + 1 };
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [timer.paused]);

  useEffect(() => {
    if (timer.paused) return;
    const id = setInterval(() => {
      const now = Date.now();
      if (now - lastTimerPersist.current >= TIMER_PERSIST_MS) {
        lastTimerPersist.current = now;
        persist({ timer_state: timerRef.current });
      }
    }, 5000);
    return () => clearInterval(id);
  }, [timer.paused, persist]);

  useEffect(() => {
    const onBeforeUnload = () => {
      const data = JSON.stringify({
        session_id: props.sessionId,
        answers: answersRef.current,
        timer_state: timerRef.current,
      });
      try {
        navigator.sendBeacon?.(
          "/api/exam/autosave",
          new Blob([data], { type: "application/json" }),
        );
      } catch {
        // best-effort only
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [props.sessionId]);

  useEffect(() => {
    if (paperReady) return;
    // The paper arrived without its sections (the load race above). Reload once,
    // shortly, to re-run the force-dynamic server read - a full document load
    // bypasses the Router Cache and returns the now-populated paper, the same
    // reason the results route reloads rather than soft-navigates.
    const t = setTimeout(() => window.location.reload(), 1200);
    return () => clearTimeout(t);
  }, [paperReady]);

  function toggleTimer() {
    setTimer((prev) => {
      const next = { ...prev, paused: !prev.paused };
      persist({ timer_state: next });
      lastTimerPersist.current = Date.now();
      return next;
    });
  }

  async function saveAndExit() {
    if (saveAnswersTimeout.current) clearTimeout(saveAnswersTimeout.current);
    await persist({ answers, timer_state: timer });
    router.push("/");
  }

  function openConfirm() {
    setShowConfirm(true);
  }
  function closeConfirm() {
    setShowConfirm(false);
  }

  async function doSubmit() {
    setShowConfirm(false);
    setSubmitting(true);
    setError("");
    setMismatch("");
    setSubmitIdx(0);
    const tick = setInterval(() => {
      setSubmitIdx((i) => Math.min(i + 1, SUBMIT_MESSAGES.length - 1));
    }, 8000);

    try {
      const res = await fetch("/api/exam/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: props.sessionId, answers }),
      });
      const json = await res.json();
      clearInterval(tick);
      if (!res.ok) {
        setError(json.error || "Marking failed.");
        setSubmitting(false);
        return;
      }
      // The marker declined: the answer looks like it belongs to a different
      // question or paper. No mark, no coaching - show the blame-free nudge and
      // drop back to the form with the answers intact so the upload can be fixed.
      if (json.status === "mismatch") {
        setMismatch(json.message || "This looks like an answer to a different question. Please check the paper and try again.");
        setSubmitting(false);
        // The notice sits at the top; submit is usually pressed from the foot of
        // a long paper, so bring it into view rather than leave it off-screen.
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      // Land on the freshly marked results with no transient "Not marked yet"
      // flash. A client-side router.push can re-serve a stale not-marked RSC from
      // the Router Cache (the confirm modal invites the student to "come back to
      // the results any time at this URL", and force-dynamic governs only the
      // server render, not the client cache). A full-document navigation bypasses
      // the Router Cache outright and always hits the force-dynamic results route
      // fresh, so the student goes straight from "Marking" to the marked results.
      // Keep submitting=true so the spinner holds until the browser navigates.
      window.location.assign(`/exam/${props.sessionId}/results`);
    } catch (err) {
      clearInterval(tick);
      const message = err instanceof Error ? err.message : "Network error";
      setError(message);
      setSubmitting(false);
    }
  }

  const remaining = Math.max(0, totalSeconds - timer.elapsed_seconds);

  if (!paperReady) {
    // VOICE PASS (draft, not final): calm wording for the rare not-ready wait.
    // No em-dashes; flagged for the family like the other loading copy.
    return (
      <div className="exam-root">
        <div className="app">
          <div className="brand">
            <div className="brand-mark">Sentiero · Exam Practice</div>
            <h1>Getting your paper ready</h1>
            <div className="tagline">Almost there. This page will refresh on its own.</div>
          </div>
          <div className="card">
            <div className="loading">
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

  if (submitting) {
    return (
      <div className="exam-root">
        <div className="app">
          <div className="brand">
            <div className="brand-mark">Sentiero · Exam Practice</div>
            <h1>Marking</h1>
            <div className="tagline">This takes 30 to 90 seconds. Hold tight.</div>
          </div>
          <div className="card">
            <div className="loading">
              <div className="loading-text">{SUBMIT_MESSAGES[submitIdx]}</div>
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

  return (
    <div className="exam-root">
      <div className="app exam-sit">
        <div className="exam-header">
          <div className="exam-title">{props.paperTitle}</div>
          <div
            className={`exam-timer${timer.paused ? "" : " running"}${remaining === 0 ? " done" : ""}`}
          >
            {formatRemaining(remaining)}
          </div>
          <button className="exam-timer-btn" onClick={toggleTimer}>
            {timer.paused ? (timer.elapsed_seconds === 0 ? "Start" : "Resume") : "Pause"}
          </button>
          <div className="exam-save-state">{renderSaveState(saveState)}</div>
        </div>

        {mismatch && <div className="exam-notice">{mismatch}</div>}


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

        {props.parsed.sections.map((section, sIdx) => (
          <section key={sIdx} className="exam-section">
            <h2 className="exam-section-header">{section.title}</h2>
            {typeof section.suggested_minutes === "number" && section.suggested_minutes > 0 ? (
              <div className="exam-section-sub">
                Suggested time: {section.suggested_minutes} minutes
              </div>
            ) : null}
            {section.instructions ? (
              <div className="exam-section-instructions">{section.instructions}</div>
            ) : null}

            {section.questions.map((q) => (
              <div key={q.number} className="exam-question">
                <div className="exam-question-header">
                  <div className="exam-question-num">Q{q.number}</div>
                  <div className="exam-question-marks">
                    {q.marks} {q.marks === 1 ? "mark" : "marks"}
                  </div>
                </div>
                <div className="exam-question-text">{q.text}</div>
                <textarea
                  className="exam-answer"
                  placeholder="Your answer..."
                  value={answers[q.number] ?? ""}
                  onChange={(e) => onAnswerChange(q.number, e.target.value)}
                />
              </div>
            ))}
          </section>
        ))}

        <div className="exam-actions">
          <button className="exam-btn" onClick={saveAndExit}>
            Save and exit
          </button>
          <button className="exam-btn primary" onClick={openConfirm}>
            Submit for marking
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        {showConfirm && (
          <div className="exam-modal-backdrop" onClick={closeConfirm}>
            <div className="exam-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Submit for marking?</h3>
              <p>
                Once you submit, the answers are locked and the paper is marked. Marking takes 30 to
                90 seconds. You can come back to the results any time at this URL.
              </p>
              <div className="exam-modal-actions">
                <button className="exam-btn" onClick={closeConfirm}>
                  Not yet
                </button>
                <button className="exam-btn primary" onClick={doSubmit}>
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatRemaining(seconds: number): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
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
