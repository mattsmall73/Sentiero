import { Header } from "@/components/Header";
import { UploadCard } from "@/components/UploadCard";
import { HowItWorks } from "@/components/HowItWorks";
import { RecentGuides } from "@/components/RecentGuides";

export default function HomePage() {
  return (
    <main style={{ background: "#fbfbfd", minHeight: "100vh" }}>
      <Header />

      <section style={{ padding: "80px 32px 64px", textAlign: "center" }}>
        <h1
          className="font-serif-display"
          style={{
            fontWeight: 400,
            fontSize: 48,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            color: "#2a2522",
            margin: 0,
          }}
        >
          Whatever you’re staring at<br />
          <em style={{ fontStyle: "italic", fontWeight: 400, color: "#6e6263" }}>
            find a way through it.
          </em>
        </h1>

        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 400,
            fontSize: 17,
            lineHeight: 1.5,
            color: "#6e6263",
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
