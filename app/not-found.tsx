import Link from "next/link";
import { Header } from "@/components/Header";

export default function NotFound() {
  return (
    <main style={{ background: "#14110d", minHeight: "100vh" }}>
      <Header />
      <section style={{ padding: "120px 32px", textAlign: "center" }}>
        <h1
          className="font-serif-display"
          style={{
            fontWeight: 400,
            fontSize: 36,
            letterSpacing: "-0.02em",
            color: "#f4ece0",
            margin: "0 0 16px",
          }}
        >
          Not found.
        </h1>
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 15,
            color: "rgba(244,236,224,0.7)",
            margin: "0 0 24px",
          }}
        >
          That guide doesn’t exist, or it’s no longer available.
        </p>
        <Link
          href="/"
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 13,
            color: "#d8a974",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          Back to home
        </Link>
      </section>
    </main>
  );
}
