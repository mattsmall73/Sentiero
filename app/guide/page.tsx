import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { UploadCard } from "@/components/UploadCard";
import { HowItWorks } from "@/components/HowItWorks";
import { RecentGuides } from "@/components/RecentGuides";

export const metadata: Metadata = {
  title: "Break down a task — Sentiero",
  description:
    "Sentiero turns the worksheet, the form, the document, the thing into a calm, paced guide you can actually work through.",
};

export default function GuideHomePage() {
  return (
    <main style={{ background: "#14110d", minHeight: "100vh" }}>
      <Header />

      <section style={{ padding: "80px 32px 64px", textAlign: "center" }}>
        <h1
          className="font-serif-display"
          style={{
            fontWeight: 400,
            fontSize: 48,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            color: "#f4ece0",
            margin: 0,
          }}
        >
          Whatever you’re staring at<br />
          <em style={{ fontStyle: "italic", fontWeight: 400, color: "#d8c5b2" }}>
            find a way through it.
          </em>
        </h1>

        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 400,
            fontSize: 17,
            lineHeight: 1.5,
            color: "rgba(244,236,224,0.7)",
            maxWidth: 480,
            margin: "24px auto 48px",
          }}
        >
          Upload the worksheet, the form, the document, the thing. Sentiero turns it into a calm,
          paced guide you can actually work through.
        </p>

        <UploadCard />
      </section>

      <HowItWorks />
      <RecentGuides />
    </main>
  );
}
