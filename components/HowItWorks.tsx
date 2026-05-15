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
        background: "#faf6f1",
        padding: "48px 32px 64px",
        borderTop: "0.5px solid rgba(42,37,34,0.06)",
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
                color: "#2a2522",
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
                color: "#6e6263",
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
