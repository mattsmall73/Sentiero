import Link from "next/link";

type HeaderProps = {
  rightSlot?: React.ReactNode;
};

export function Header({ rightSlot }: HeaderProps) {
  return (
    <header
      style={{
        padding: "20px 32px",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "transparent",
      }}
    >
      <Link
        href="/"
        className="font-sans rose-foil-text"
        style={{
          fontWeight: 600,
          fontSize: 19,
          letterSpacing: "-0.02em",
          textDecoration: "none",
        }}
      >
        Sentiero
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {rightSlot ?? (
          <span
            aria-disabled="true"
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 400,
              fontSize: 13,
              color: "#d8a974",
              cursor: "default",
            }}
          >
            Sign in
          </span>
        )}
      </div>
    </header>
  );
}
