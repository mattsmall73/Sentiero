"use client";

import { useEffect, useState } from "react";

// A dapper top-hat-and-cane showman who dances ACROSS the stage while a guide
// is being generated — stepping, hopping, spinning to turn at each end, a
// centre jump, and working the cane and hat. Pure SVG + CSS (the choreography
// lives in globals.css under the `sm-` prefix), so there's no animation
// library and nothing to tear down. Honours prefers-reduced-motion: he simply
// stands centre-stage, perfectly still.

const MESSAGES = [
  "Putting your guide together…",
  "Reading it through properly…",
  "Laying out the calm version…",
  "Almost ready for you…",
];

export function DancingStickman() {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES.length);
    }, 2600);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ marginTop: 20, width: "100%" }}
    >
      <div className="sm-stage">
        <div className="sm-travel">
          <svg
            className="sm-figure"
            width="130"
            height="200"
            viewBox="0 0 130 200"
            fill="none"
            aria-hidden="true"
            style={{ overflow: "visible" }}
          >
            <defs>
              <linearGradient id="sm-stroke" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#c9986a" />
                <stop offset="55%" stopColor="#a07242" />
                <stop offset="100%" stopColor="#8a6845" />
              </linearGradient>
            </defs>

            {/* travelling shadow, pulses with the bounce */}
            <ellipse className="sm-shadow" cx="65" cy="188" rx="30" ry="5" fill="rgba(57,50,43,0.18)" />

            <g
              className="sm-sway"
              stroke="url(#sm-stroke)"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* coat tails (behind everything) */}
              <path d="M57 102 L52 128 L62 108 Z" fill="#5a4634" stroke="none" />
              <path d="M73 102 L78 128 L68 108 Z" fill="#5a4634" stroke="none" />

              {/* legs (dance from the hip) */}
              <polyline className="sm-leg-l" points="62,106 57,150 51,152" />
              <polyline className="sm-leg-r" points="68,106 73,150 79,152" />

              {/* tailcoat body */}
              <path d="M54 68 Q65 63 76 68 L73 104 Q65 108 57 104 Z" fill="url(#sm-stroke)" stroke="#8a6845" />
              {/* shirt front + buttons */}
              <path d="M65 66 L60 70 L65 88 L70 70 Z" fill="#fbfbfd" stroke="none" />
              <circle cx="65" cy="76" r="1.5" fill="#5a4634" stroke="none" />
              <circle cx="65" cy="83" r="1.5" fill="#5a4634" stroke="none" />
              <circle cx="65" cy="90" r="1.5" fill="#5a4634" stroke="none" />

              {/* free arm — swings */}
              <polyline className="sm-arm-free" points="56,70 45,84 41,100" />

              {/* cane arm + cane (flourishes together) */}
              <g className="sm-arm-cane">
                <polyline points="74,70 86,80 90,96" />
                <line x1="99" y1="92" x2="99" y2="140" />
                <path d="M99 92 q0 -8 -8 -8" />
              </g>

              {/* neck — connects head to the body */}
              <line x1="65" y1="58" x2="65" y2="68" />

              {/* bowtie */}
              <g fill="#5a4634" stroke="none">
                <path d="M65 63 L57 59 L57 67 Z" />
                <path d="M65 63 L73 59 L73 67 Z" />
                <circle cx="65" cy="63" r="1.8" />
              </g>

              {/* head + a little face */}
              <circle cx="65" cy="49" r="11" fill="#fbfbfd" />
              <circle cx="61" cy="48" r="1.5" fill="#5a4634" stroke="none" />
              <circle cx="69" cy="48" r="1.5" fill="#5a4634" stroke="none" />
              <path d="M60 53 Q65 57 70 53" fill="none" stroke="#8a6845" strokeWidth="1.6" />

              {/* top hat — tips on the beat */}
              <g className="sm-hat" fill="#5a4634" stroke="#5a4634" strokeWidth="2">
                <line x1="48" y1="36" x2="82" y2="36" strokeWidth="3.4" />
                <rect x="56" y="16" width="18" height="20" rx="1.5" />
              </g>
            </g>
          </svg>
        </div>
      </div>

      <div
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 13,
          color: "#595049",
          minHeight: 18,
          marginTop: 6,
          textAlign: "center",
          transition: "opacity 0.3s ease",
        }}
      >
        {MESSAGES[msgIndex]}
      </div>
    </div>
  );
}
