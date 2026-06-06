import type { Metadata } from "next";
import Link from "next/link";
import { LandingBackdrop } from "@/components/LandingBackdrop";
import "./landing.css";

export const metadata: Metadata = {
  title: "Sentiero",
  description: "Whatever you’re staring at, there’s a way through it. Sentiero shows you the path.",
};

export default function HomePage() {
  return (
    <div className="sentiero-landing">
      <LandingBackdrop />

      <nav>
        <div className="nav-inner">
          <Link href="/" className="logo">
            Sentiero
          </Link>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#tools">The tools</a>
            <a href="#parents">For parents</a>
            <a href="#tools" className="nav-cta">
              Get started
            </a>
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="wrap">
          <span className="eyebrow">From frustration to calm</span>
          <h1 className="hero-title">
            Whatever you’re staring at,
            <br />
            <span className="shine">there’s a way through it.</span>
          </h1>
          <p className="hero-sub">Sentiero shows you the path.</p>
        </div>
      </header>

      <section className="concept" id="how">
        <div className="wrap">
          <div className="concept-card">
            <h2>The hardest part is starting</h2>
            <p>
              Ever feel exhausted just facing a page? A dense reading list, a past paper, a form, a
              teacher’s instruction. The words just sit there and the longer they do, the less sense
              they make. The harder it gets to begin.
            </p>
            <p>Sentiero doesn’t do the work for you. It breaks down the wall.</p>
            <p className="concept-close">You are capable. You just need a way forward.</p>
          </div>
        </div>
      </section>

      <section className="apps" id="tools">
        <div className="wrap">
          <div className="section-head">
            <h2>Two ways to begin</h2>
          </div>
          <div className="app-grid">
            <Link href="/guide" className="app-card">
              <div className="app-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
                  <path d="M14 4v5h5" />
                  <path d="M7 13h7M7 17h5" />
                </svg>
              </div>
              <h3>Break down a task</h3>
              <div className="flow">
                <div className="flow-step">
                  <span className="flow-dot" />
                  <div className="flow-text">
                    <span className="flow-label">You bring</span>A worksheet, a set of instructions,
                    a form
                  </div>
                </div>
                <div className="flow-step">
                  <span className="flow-dot" />
                  <div className="flow-text">
                    <span className="flow-label">Sentiero</span>Turns it into steps you can follow
                  </div>
                </div>
                <div className="flow-step">
                  <span className="flow-dot" />
                  <div className="flow-text">
                    <span className="flow-label">Set a timer</span>If it helps you focus
                  </div>
                </div>
                <div className="flow-step">
                  <span className="flow-dot" />
                  <div className="flow-text">
                    <span className="flow-label">You get</span>A guide, and a finish line
                  </div>
                </div>
              </div>
              <span className="app-link">
                Start a guide{" "}
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </Link>

            <Link href="/exam" className="app-card">
              <div className="app-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 11l3 3 8-8" />
                  <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
                </svg>
              </div>
              <h3>Practise a past paper</h3>
              <div className="flow">
                <div className="flow-step">
                  <span className="flow-dot" />
                  <div className="flow-text">
                    <span className="flow-label">You bring</span>A paper, its mark scheme, and the
                    examiner’s report
                  </div>
                </div>
                <div className="flow-step">
                  <span className="flow-dot" />
                  <div className="flow-text">
                    <span className="flow-label">Set the timer</span>Work to real exam conditions
                  </div>
                </div>
                <div className="flow-step">
                  <span className="flow-dot" />
                  <div className="flow-text">
                    <span className="flow-label">Add your answers</span>Type them in when you’re done
                  </div>
                </div>
                <div className="flow-step">
                  <span className="flow-dot" />
                  <div className="flow-text">
                    <span className="flow-label">You get</span>Gentle, honest feedback and the next
                    marks to reach
                  </div>
                </div>
              </div>
              <span className="app-link">
                Start a paper{" "}
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </Link>
          </div>
        </div>
      </section>

      <section className="reassure" id="parents">
        <div className="wrap">
          <div className="reassure-inner">
            <div>
              <h2>For parents</h2>
              <p>
                Sentiero exists because of my daughter. Highly capable, but given confusing
                instructions that overwhelmed her. She’d stare at a page for hours, panic rising,
                underperforming not for lack of knowledge but because she couldn’t bear to start and
                fail.
              </p>
              <p>
                She didn’t need the work done for her. She needed helping through it, step by step,
                without being made to feel stupid.
              </p>
              <p className="parents-close">That’s what Sentiero became.</p>
            </div>
            <ul className="reassure-points">
              <li>
                <span className="check">
                  <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12l5 5L20 6" />
                  </svg>
                </span>
                Always guidance, never the answer
              </li>
              <li>
                <span className="check">
                  <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12l5 5L20 6" />
                  </svg>
                </span>
                Encourages, never lectures or pressures
              </li>
              <li>
                <span className="check">
                  <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12l5 5L20 6" />
                  </svg>
                </span>
                Built in a way they will understand
              </li>
              <li>
                <span className="check">
                  <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12l5 5L20 6" />
                  </svg>
                </span>
                What’s done in the system, stays in the system
              </li>
            </ul>
          </div>
        </div>
      </section>

      <footer>
        <div className="foot-inner">
          <div>
            <div className="foot-logo">Sentiero</div>
            <div className="foot-tag">A small footpath through the hard parts.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
