const COLUMNS = [
  {
    title: "Upload",
    body: "A worksheet, a tax form, a letter, anything you’re staring at.",
  },
  {
    title: "Pace it",
    body: "Tell us how long you’ve got. Half an hour, two hours, or unknown.",
  },
  {
    title: "Work through",
    body: "A calm guide with timers, checkpoints, permission to pause.",
  },
];

export function HowItWorks() {
  return (
    <section
      style={{
        background: "#14110d",
        padding: "48px 32px 64px",
        borderTop: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <div
        style={{
          maxWidth: 520,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 24,
        }}
      >
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <div
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 500,
                fontSize: 13,
                color: "#f4ece0",
                marginBottom: 6,
              }}
            >
              {c.title}
            </div>
            <div
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 400,
                fontSize: 12,
                color: "rgba(244,236,224,0.7)",
                lineHeight: 1.5,
              }}
            >
              {c.body}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
