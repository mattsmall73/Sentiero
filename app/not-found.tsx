import Link from "next/link";
import { Header } from "@/components/Header";

export default function NotFound() {
  return (
    <main style={{ background: "#fbfbfd", minHeight: "100vh" }}>
      <Header />
      <section style={{ padding: "120px 32px", textAlign: "center" }}>
        <h1
          className="font-serif-display"
          style={{
            fontWeight: 400,
            fontSize: 36,
            letterSpacing: "-0.02em",
            color: "#2a2522",
            margin: "0 0 16px",
          }}
        >
          Not found.
        </h1>
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 15,
            color: "#6e6263",
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
            color: "#8a6845",
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
