"use client";

type Props = {
  html: string;
  attemptId: string;
};

export default function ResultsClient(props: Props) {
  function download() {
    const blob = new Blob([props.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "practice-progress.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="exam-results" style={{ background: "var(--surround)", minHeight: "100vh" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          background: "var(--surround)",
          padding: "12px 16px",
          borderBottom: "1px solid rgba(244, 236, 224, 0.12)",
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          zIndex: 10,
        }}
      >
        {/* Back to the page they were working on, with the answer intact: a plain
         * link to the working route, which reads the saved answer fresh. */}
        <a
          href={`/practice/${props.attemptId}`}
          style={{
            fontSize: 13,
            color: "var(--on-dark-muted)",
            textDecoration: "underline",
            textDecorationStyle: "dotted",
            textUnderlineOffset: 3,
          }}
        >
          ← back to your answer
        </a>
        <div style={{ flex: 1 }} />
        <button
          className="exam-btn"
          onClick={download}
          style={{ flex: "0 0 auto", minWidth: 0, padding: "8px 16px", fontSize: 14 }}
        >
          Download
        </button>
        <a
          href="/practice"
          className="exam-btn primary"
          style={{
            flex: "0 0 auto",
            minWidth: 0,
            padding: "8px 16px",
            fontSize: 14,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          Try another question
        </a>
      </div>
      <iframe
        srcDoc={props.html}
        title="Practice progress"
        style={{
          width: "100%",
          height: "calc(100vh - 56px)",
          border: "none",
          background: "var(--surround)",
        }}
      />
    </div>
  );
}
