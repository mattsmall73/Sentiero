"use client";

import { useEffect, useRef } from "react";

/**
 * The fixed forest backdrop and dark scrim for the landing page.
 *
 * Adds a gentle scroll-drift (parallax) on the backdrop. The drift is disabled
 * entirely when the user prefers reduced motion, in which case the image sits
 * completely still — an accessibility requirement for this audience.
 *
 * The responsive image swap (portrait .webp on mobile, landscape .jpg on
 * desktop) is handled in CSS via the background-image media query.
 */
export function LandingBackdrop() {
  const bgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.add("landing-active");

    const bg = bgRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;

    function apply() {
      if (!bg) return;
      const max = window.innerHeight * 0.16;
      const range = document.documentElement.scrollHeight - window.innerHeight;
      const p = range > 0 ? window.scrollY / range : 0;
      bg.style.transform = `translate3d(0, ${(-p * max).toFixed(1)}px, 0) scale(1.26)`;
    }

    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        apply();
      });
    }

    function start() {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", apply);
      apply();
    }

    function stop() {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", apply);
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (bg) bg.style.transform = "scale(1.26)";
    }

    function sync() {
      if (reduce.matches) stop();
      else start();
    }

    sync();
    reduce.addEventListener?.("change", sync);

    return () => {
      document.body.classList.remove("landing-active");
      stop();
      reduce.removeEventListener?.("change", sync);
    };
  }, []);

  return (
    <>
      <div className="sl-bg" ref={bgRef} aria-hidden="true" />
      <div className="sl-scrim" aria-hidden="true" />
    </>
  );
}
