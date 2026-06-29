"use client";

import { useEffect, useState } from "react";

// A little top-hat-and-cane showman who comes out to dance while a guide is
// being generated. Pure SVG + CSS (keyframes live in globals.css under the
// `sm-` prefix), so there's no animation library and nothing to clean up.
// Honours prefers-reduced-motion: the figure simply stands politely still.

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
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        marginTop: 24,
      }}
    >
      <svg
        className="sm-figure"
        width="120"
        height="170"
        viewBox="0 0 120 170"
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

        {/* shadow that pulses with the bounce */}
        <ellipse className="sm-shadow" cx="60" cy="156" rx="26" ry="5" fill="rgba(57,50,43,0.18)" />

        <g
          className="sm-sway"
          stroke="url(#sm-stroke)"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* legs (dance from the hip) */}
          <line className="sm-leg-l" x1="60" y1="104" x2="46" y2="142" />
          <line className="sm-leg-r" x1="60" y1="104" x2="74" y2="142" />

          {/* body */}
          <line x1="60" y1="58" x2="60" y2="104" />

          {/* free arm — swings */}
          <polyline className="sm-arm-free" points="60,68 44,80 40,96" />

          {/* cane arm + cane (taps and lifts) */}
          <g className="sm-arm-cane">
            <polyline points="60,68 78,78 84,92" />
            {/* the cane: shaft + hooked handle */}
            <line x1="92" y1="86" x2="92" y2="128" />
            <path d="M92 86 q0 -7 -7 -7" />
          </g>

          {/* head */}
          <circle cx="60" cy="46" r="11" fill="#fbfbfd" />

          {/* top hat — tips on the beat */}
          <g className="sm-hat" fill="#5a4634" stroke="#5a4634" strokeWidth="2">
            <line x1="44" y1="33" x2="76" y2="33" strokeWidth="3.4" />
            <rect x="51" y="14" width="18" height="19" rx="1.5" />
          </g>
        </g>
      </svg>

      <div
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 13,
          color: "#595049",
          minHeight: 18,
          textAlign: "center",
          transition: "opacity 0.3s ease",
        }}
      >
        {MESSAGES[msgIndex]}
      </div>
    </div>
  );
}
