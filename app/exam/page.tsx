import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Exam Practice — Sentiero",
  description: "Exam Practice is on its way to Sentiero.",
};

export default function ExamPlaceholderPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#14110d",
        color: "#f4ece0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "48px 28px",
      }}
    >
      <span
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#d8a974",
          marginBottom: 22,
        }}
      >
        Coming soon
      </span>

      <h1
        style={{
          fontFamily: "Fraunces, Georgia, serif",
          fontWeight: 500,
          fontStyle: "italic",
          fontSize: "clamp(32px, 6vw, 48px)",
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          color: "#f4ece0",
          margin: "0 0 18px",
          maxWidth: 560,
        }}
      >
        Exam Practice is on its way.
      </h1>

      <p
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 16,
          lineHeight: 1.7,
          color: "rgba(244,236,224,0.74)",
          maxWidth: 440,
          margin: "0 0 36px",
        }}
      >
        We’re still building this part of the path. Soon you’ll be able to work through a past paper
        under real conditions and get gentle, honest feedback.
      </p>

      <Link
        href="/"
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 14,
          fontWeight: 500,
          color: "#e3b685",
          textDecoration: "underline",
          textUnderlineOffset: 3,
          textDecorationColor: "rgba(227,182,133,0.4)",
        }}
      >
        Back to home
      </Link>
    </main>
  );
}
