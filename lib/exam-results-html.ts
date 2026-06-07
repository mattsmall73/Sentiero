import { MarkingResults, ParsedPaper, ParsedQuestion } from "./exam-db";

// Ported from Help!'s lib/resultsHtml.ts. Renders a self-contained, downloadable
// results page. No swearing to strip here. Copy strings (e.g. "For [name]",
// "Next best thing to do", "Not attempted", "on the clock") are flagged for the
// family's voice pass - "Next best thing to do" is the working candidate that
// replaced the old "Highest-leverage next step" optimisation-voice heading.

export function renderResultsHtml(input: {
  paper_title: string;
  user_name: string | null;
  practised_at: Date;
  elapsed_seconds: number;
  parsed: ParsedPaper;
  answers: Record<string, string>;
  marking: MarkingResults;
}): string {
  const {
    paper_title,
    user_name,
    practised_at,
    elapsed_seconds,
    parsed,
    answers,
    marking,
  } = input;

  const questionByNumber = new Map<string, ParsedQuestion & { section: string }>();
  for (const section of parsed.sections) {
    for (const q of section.questions) {
      questionByNumber.set(q.number, { ...q, section: section.title });
    }
  }

  const dateStr = practised_at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const elapsedStr = formatElapsed(elapsed_seconds);

  const questionsHtml = marking.questions
    .map((q) => {
      const parsedQ = questionByNumber.get(q.number);
      const questionText = parsedQ?.text ?? "";
      const answer = (answers[q.number] ?? "").trim();
      const closing = q.closing_line && q.closing_line.trim() ? q.closing_line.trim() : "";
      // A blank answer is a skip, not a gap. Treat it as not attempted and show
      // only the plain "Not attempted" label - no coaching, no affirmation, no
      // explanation of why the skip was acceptable. Explaining a blank still
      // draws attention to it; silence treats the choice as unremarkable. The
      // model still grasps internally that a permitted skip is legitimate (so it
      // never penalises or mis-coaches it) - we drop the output sentence, not the
      // logic. The model signals a skip via attempted=false; an empty answer is a
      // robust fallback for sessions marked before that field existed.
      const notAttempted = q.attempted === false || answer.length === 0;

      let feedbackHtml: string;
      if (notAttempted) {
        feedbackHtml = `
    <div class="feedback not-attempted">
      <p class="feedback-status">Not attempted</p>
    </div>`;
      } else {
        const lines: string[] = [];
        if (q.what_worked && q.what_worked.trim()) {
          lines.push(`<p class="feedback-line worked">${escapeHtml(q.what_worked.trim())}</p>`);
        }
        if (q.what_the_scheme_wanted && q.what_the_scheme_wanted.trim()) {
          lines.push(`<p class="feedback-line scheme">${escapeHtml(q.what_the_scheme_wanted.trim())}</p>`);
        }
        if (q.next_step && q.next_step.trim()) {
          lines.push(`<p class="feedback-line next">${escapeHtml(q.next_step.trim())}</p>`);
        }
        if (closing) {
          lines.push(`<p class="feedback-line closing">${escapeHtml(closing)}</p>`);
        }
        feedbackHtml = `
    <div class="feedback">
      ${lines.join("\n      ")}
    </div>`;
      }

      return `
  <article class="question">
    <header class="question-header">
      <div class="question-number">Q${escapeHtml(q.number)}</div>
      <div class="question-mark">${q.mark_awarded} / ${q.mark_available}</div>
    </header>
    ${
      questionText
        ? `<div class="question-text">${escapeHtml(questionText)}</div>`
        : ""
    }
    <div class="answer-block">
      <div class="answer-label">Your answer</div>
      <div class="answer-body">${answer ? escapeHtml(answer) : `<em class="empty">No answer given.</em>`}</div>
    </div>${feedbackHtml}
  </article>`;
    })
    .join("\n");

  const forLine = user_name ? `For ${escapeHtml(user_name)}` : "Marked paper";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(paper_title)} — results</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;1,400;1,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  /* Dark forest surround, brushed-silver panels, rose-gold accents — matched to
   * the Sentiero tool pages so the marked results stay in the same world as the
   * front door and the tools. Fraunces is the hero heading only; panel text is
   * plain Inter. --panel is the brushed-silver sheen (Izzie's option C);
   * --panel-muted is darkened to #595049 to clear WCAG AA on it. */
  :root {
    --surround: #14110d;
    --panel: linear-gradient(160deg, #e2e4e6 0%, #c7cbce 55%, #d4d7d9 100%);
    --panel-ink: #39322b; --panel-muted: #595049;
    --field: #d7dadc; --line: rgba(57,50,43,0.12);
    --on-dark: #f4ece0; --on-dark-muted: rgba(244,236,224,0.70);
    --accent-deep: #e3b685; --accent-panel-text: #8a6845;
    --accent-gradient: linear-gradient(135deg, #e8c9a8 0%, #c9986a 28%, #a07242 55%, #8a6845 78%, #b8895c 100%);
    --panel-shadow: 0 8px 30px rgba(0,0,0,0.22); --done: #5a7a5a;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--surround); color: var(--on-dark); font-family: 'Inter', system-ui, sans-serif; font-size: 16px; line-height: 1.6; padding: 32px 16px 80px; }
  .wrap { max-width: 760px; margin: 0 auto; }
  header.top { text-align: center; margin-bottom: 36px; padding-bottom: 24px; border-bottom: 1px solid rgba(255,255,255,0.1); }
  .for-line { font-family: 'Fraunces', Georgia, serif; font-style: italic; font-size: 14px; color: var(--accent-deep); letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 8px; }
  h1 { font-family: 'Fraunces', Georgia, serif; font-weight: 500; font-size: 32px; margin: 0 0 8px; letter-spacing: -0.02em; color: var(--on-dark); }
  .meta-row { font-family: 'Fraunces', Georgia, serif; font-style: italic; color: var(--on-dark-muted); font-size: 15px; }
  .meta-row .dot { margin: 0 8px; opacity: 0.5; }
  .total-mark {
    background-image: var(--accent-gradient);
    color: #fff;
    border-radius: 16px;
    padding: 18px 24px;
    margin: 24px 0 32px;
    text-align: center;
    box-shadow: 0 2px 10px rgba(160,114,66,0.28);
  }
  .total-mark .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; opacity: 0.9; margin-bottom: 6px; }
  .total-mark .value { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 36px; letter-spacing: -0.01em; }
  .summary {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 22px 24px;
    margin-bottom: 28px;
    font-size: 15px;
    line-height: 1.65;
    color: var(--panel-ink);
    box-shadow: var(--panel-shadow);
  }
  .summary-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; color: var(--accent-panel-text); font-weight: 600; margin-bottom: 8px; }
  .questions-label {
    color: var(--on-dark-muted);
    font-size: 14px;
    margin-bottom: 12px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .question {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 22px 24px;
    margin-bottom: 18px;
    color: var(--panel-ink);
    box-shadow: var(--panel-shadow);
  }
  .question-header { display: flex; align-items: baseline; gap: 14px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px dashed var(--line); }
  .question-number { font-weight: 700; font-size: 20px; color: var(--accent-panel-text); }
  .question-mark { margin-left: auto; font-weight: 600; font-size: 18px; color: var(--panel-ink); }
  .question-text { font-size: 14px; color: var(--panel-muted); margin-bottom: 14px; white-space: pre-wrap; line-height: 1.55; }
  .answer-block { background: var(--field); border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
  .answer-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--accent-panel-text); font-weight: 600; margin-bottom: 6px; }
  .answer-body { font-size: 14px; line-height: 1.6; white-space: pre-wrap; color: var(--panel-ink); }
  .answer-body .empty { color: var(--panel-muted); }
  .feedback p { margin: 0 0 10px; font-size: 15px; line-height: 1.6; color: var(--panel-ink); }
  .feedback p:last-child { margin-bottom: 0; }
  .feedback-line.closing { color: var(--accent-panel-text); font-style: italic; font-size: 16px; }
  .feedback-status { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 600; color: var(--panel-muted); margin: 0; }
  /* This is the one DARK panel among the results surfaces: a translucent gold
   * wash that sits almost black over the dark surround. Its text must therefore
   * be light-on-dark (the same readable cream the surround uses), not the cream
   * panels' warm-dark ink, and its label takes the dark-surround gold accent,
   * not the light-panel gold. Earlier contrast sweeps fixed the cream panels and
   * missed this one. */
  .footer-note {
    background: rgba(160,114,66,0.1);
    border: 1px solid rgba(244,236,224,0.12);
    border-radius: 16px;
    padding: 20px 24px;
    margin-top: 28px;
    margin-bottom: 20px;
    font-size: 15px;
    line-height: 1.6;
    color: var(--on-dark);
  }
  .footer-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; color: var(--accent-deep); font-weight: 600; margin-bottom: 6px; }
  @media (max-width: 480px) {
    h1 { font-size: 26px; }
    .total-mark .value { font-size: 30px; }
    .question { padding: 18px 18px; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div class="for-line">${forLine}</div>
    <h1>${escapeHtml(paper_title)}</h1>
    <div class="meta-row">
      <span>${escapeHtml(dateStr)}</span>
      <span class="dot">·</span>
      <span>${escapeHtml(elapsedStr)} on the clock</span>
    </div>
  </header>

  <div class="total-mark">
    <div class="label">Total</div>
    <div class="value">${marking.total_mark} / ${marking.total_available}</div>
  </div>

  <div class="summary">
    <div class="summary-label">Overall</div>
    <div>${escapeHtml(marking.overall_summary)}</div>
  </div>

  <div class="questions-label">By question</div>
${questionsHtml}

  <div class="footer-note">
    <div class="footer-label">Next best thing to do</div>
    <div>${escapeHtml(marking.headline_next_step)}</div>
  </div>
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h === 0 && m === 0) return "less than a minute";
  if (h === 0) return `${m} ${m === 1 ? "minute" : "minutes"}`;
  if (m === 0) return `${h} ${h === 1 ? "hour" : "hours"}`;
  return `${h}h ${m}m`;
}
