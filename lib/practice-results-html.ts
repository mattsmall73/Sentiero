import { PracticeCoaching } from "./practice-db";

// Renders the practice coaching screen as a self-contained, downloadable page.
// This is the ONE screen that deliberately differs from the exam marker: the
// number is framed as a PROGRESS score (out of 100, with a plain band word and a
// caption saying it is a practice indication of progress), never as the exam
// marker's "X / Y marks" scorecard. The dark-forest / brushed-silver look is
// shared so it still sits in the same world as the other tools.
//
// Copy strings ("Your progress", "Practice question", "What worked", etc.) are
// candidates flagged for the family's voice pass, like the other tool copy.

export function renderPracticeResultsHtml(input: {
  subject: string;
  level: string;
  topic: string;
  question: string;
  user_name: string | null;
  practised_at: Date;
  answer: string;
  coaching: PracticeCoaching;
}): string {
  const { subject, level, topic, question, user_name, practised_at, answer, coaching } = input;

  const dateStr = practised_at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  // The level is shown plainly: it is the standard the progress score was marked
  // against, so naming it keeps the number honest rather than floating.
  const standard = [subject, level].map((s) => (s || "").trim()).filter(Boolean).join(" · ");

  const forLine = user_name ? `For ${escapeHtml(user_name)}` : "Practice";
  const score = clampScore(coaching.progress_score, coaching.progress_max || 100);
  const max = coaching.progress_max || 100;
  const pct = Math.round((score / max) * 100);
  const band = (coaching.band_label || "").trim();
  // At the ceiling the answer would score full marks at this level: the coach
  // releases rather than corrects, so the screen reads as arrival, not a to-do.
  const atCeiling = coaching.at_ceiling === true;

  // The borderline note is shown honestly: the score was rounded up to the edge
  // of this band, and the coaching names what would secure it cleanly. We do not
  // hide it, but we frame it as encouragement, not a caveat that deflates.
  // It never applies at the ceiling (the top is not a boundary).
  const borderlineHtml =
    coaching.borderline && !atCeiling
      ? `<div class="borderline">On the edge of this level. The next step below is the thing that settles it.</div>`
      : "";

  const encouragement =
    coaching.encouragement && coaching.encouragement.trim() ? coaching.encouragement.trim() : "";

  const coachingLines: string[] = [];
  if (coaching.what_worked && coaching.what_worked.trim()) {
    coachingLines.push(
      `<div class="coach-block"><div class="coach-label">What worked</div><p>${escapeHtml(
        coaching.what_worked.trim(),
      )}</p></div>`,
    );
  }
  if (atCeiling) {
    // The "done" block: honest recognition that the answer maxes the scale for
    // this level. Carries the coach's release line; falls back to a plain,
    // non-flattering statement if the model left it empty.
    const release =
      encouragement ||
      "This would score full marks at this level. There's nothing left to add here - you're there.";
    coachingLines.push(
      `<div class="coach-block ceiling"><div class="coach-label">You're there</div><p>${escapeHtml(
        release,
      )}</p></div>`,
    );
    // A next step at the ceiling is only ever a genuinely optional refinement,
    // already framed with its trade-off by the coach. Render it softly, never as
    // a correction the student owes.
    if (coaching.next_step && coaching.next_step.trim()) {
      coachingLines.push(
        `<div class="coach-block"><div class="coach-label">Only if you ever want to push further</div><p>${escapeHtml(
          coaching.next_step.trim(),
        )}</p></div>`,
      );
    }
  } else {
    if (coaching.what_a_strong_answer_adds && coaching.what_a_strong_answer_adds.trim()) {
      coachingLines.push(
        `<div class="coach-block"><div class="coach-label">What a strong answer also does</div><p>${escapeHtml(
          coaching.what_a_strong_answer_adds.trim(),
        )}</p></div>`,
      );
    }
    if (coaching.next_step && coaching.next_step.trim()) {
      coachingLines.push(
        `<div class="coach-block next"><div class="coach-label">Your next step</div><p>${escapeHtml(
          coaching.next_step.trim(),
        )}</p></div>`,
      );
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Practice progress - ${escapeHtml(topic)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;1,400;1,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --surround: #14110d;
    --panel: linear-gradient(160deg, #e2e4e6 0%, #c7cbce 55%, #d4d7d9 100%);
    --panel-ink: #39322b; --panel-muted: #595049;
    --field: #d7dadc; --line: rgba(57,50,43,0.12);
    --on-dark: #f4ece0; --on-dark-muted: rgba(244,236,224,0.70);
    --accent-deep: #e3b685; --accent-panel-text: #8a6845;
    --accent-gradient: linear-gradient(135deg, #e8c9a8 0%, #c9986a 28%, #a07242 55%, #8a6845 78%, #b8895c 100%);
    --panel-shadow: 0 8px 30px rgba(0,0,0,0.22);
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--surround); color: var(--on-dark); font-family: 'Inter', system-ui, sans-serif; font-size: 16px; line-height: 1.6; padding: 32px 16px 80px; }
  .wrap { max-width: 720px; margin: 0 auto; }
  header.top { text-align: center; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid rgba(255,255,255,0.1); }
  .for-line { font-family: 'Fraunces', Georgia, serif; font-style: italic; font-size: 14px; color: var(--accent-deep); letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 8px; }
  h1 { font-family: 'Fraunces', Georgia, serif; font-weight: 500; font-size: 30px; margin: 0 0 8px; letter-spacing: -0.02em; color: var(--on-dark); }
  .meta-row { font-family: 'Fraunces', Georgia, serif; font-style: italic; color: var(--on-dark-muted); font-size: 15px; }

  /* Progress card - deliberately NOT the exam marker's "X / Y marks" scorecard.
   * A progress dial, a band word, and a caption that says what the number is. */
  .progress {
    background-image: var(--accent-gradient);
    color: #fff;
    border-radius: 18px;
    padding: 26px 24px;
    margin: 24px 0 14px;
    text-align: center;
    box-shadow: 0 2px 12px rgba(160,114,66,0.30);
  }
  .progress .plabel { font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em; opacity: 0.92; margin-bottom: 10px; }
  .progress .pscore { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 46px; line-height: 1; letter-spacing: -0.01em; }
  .progress .pscore .pmax { font-size: 22px; opacity: 0.8; }
  .progress .pband { margin-top: 8px; font-size: 16px; font-weight: 600; letter-spacing: 0.02em; }
  .progress .pbar { height: 8px; border-radius: 999px; background: rgba(255,255,255,0.28); margin: 16px auto 0; max-width: 320px; overflow: hidden; }
  .progress .pbar > span { display: block; height: 100%; background: #fff; border-radius: 999px; }
  .caption { font-size: 13px; color: var(--on-dark-muted); text-align: center; margin: 0 0 28px; line-height: 1.55; }
  .borderline { background: rgba(160,114,66,0.14); border: 1px solid rgba(227,182,133,0.4); color: var(--on-dark); padding: 12px 16px; border-radius: 10px; font-size: 14px; margin: 0 0 24px; line-height: 1.5; }

  .question-card, .answer-card {
    background: var(--panel); border: 1px solid var(--line); border-radius: 16px;
    padding: 20px 22px; margin-bottom: 18px; color: var(--panel-ink); box-shadow: var(--panel-shadow);
  }
  .block-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em; color: var(--accent-panel-text); font-weight: 600; margin-bottom: 8px; }
  .question-text { font-size: 16px; line-height: 1.55; color: var(--panel-ink); white-space: pre-wrap; }
  .answer-body { font-size: 14px; line-height: 1.6; white-space: pre-wrap; color: var(--panel-ink); }
  .answer-body .empty { color: var(--panel-muted); font-style: italic; }

  .coach-block { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 20px 22px; margin-bottom: 16px; color: var(--panel-ink); box-shadow: var(--panel-shadow); }
  .coach-block.next { background: rgba(160,114,66,0.1); border: 1px solid rgba(244,236,224,0.14); color: var(--on-dark); }
  /* The "you're there" release: the warmest surface on the page, a gold wash on
   * the dark surround, so arrival reads as the win it is rather than a to-do. */
  .coach-block.ceiling { background-image: var(--accent-gradient); color: #fff; border: none; box-shadow: 0 2px 12px rgba(160,114,66,0.30); }
  .coach-block.ceiling p { font-size: 16px; }
  .coach-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em; font-weight: 600; margin-bottom: 8px; color: var(--accent-panel-text); }
  .coach-block.next .coach-label { color: var(--accent-deep); }
  .coach-block.ceiling .coach-label { color: rgba(255,255,255,0.92); }
  .coach-block p { margin: 0; font-size: 15px; line-height: 1.6; }
  .encouragement { text-align: center; font-family: 'Fraunces', Georgia, serif; font-style: italic; color: var(--accent-deep); font-size: 17px; margin: 26px 0 0; line-height: 1.5; }

  @media (max-width: 480px) {
    h1 { font-size: 25px; }
    .progress .pscore { font-size: 38px; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div class="for-line">${forLine}</div>
    <h1>${escapeHtml(topic)}</h1>
    <div class="meta-row">${standard ? `${escapeHtml(standard)}<span class="dot"> · </span>` : ""}${escapeHtml(dateStr)}</div>
  </header>

  <div class="progress">
    <div class="plabel">Your progress</div>
    <div class="pscore">${score}<span class="pmax"> / ${max}</span></div>
    ${band ? `<div class="pband">${escapeHtml(band)}</div>` : ""}
    <div class="pbar"><span style="width: ${pct}%"></span></div>
  </div>
  <p class="caption">A practice progress score, not an exam mark. It is a concrete read on where this answer is now and how far it can travel, not an official grade.</p>

  ${borderlineHtml}

  <div class="question-card">
    <div class="block-label">Practice question</div>
    <div class="question-text">${escapeHtml(question)}</div>
  </div>

  <div class="answer-card">
    <div class="block-label">Your answer</div>
    <div class="answer-body">${answer.trim() ? escapeHtml(answer.trim()) : `<span class="empty">No answer given yet.</span>`}</div>
  </div>

  ${coachingLines.join("\n  ")}
  ${!atCeiling && encouragement ? `<p class="encouragement">${escapeHtml(encouragement)}</p>` : ""}
</div>
</body>
</html>`;
}

function clampScore(score: number, max: number): number {
  if (typeof score !== "number" || Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(max, Math.round(score)));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
