"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Summary = {
  id: string;
  title: string | null;
  created_at: string;
};

const RECENT_KEY = "sentiero:recent-guide-ids";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.round(hr / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo ago`;
  const years = Math.round(months / 12);
  return `${years} yr ago`;
}

export function RecentGuides() {
  const [guides, setGuides] = useState<Summary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const raw = window.localStorage.getItem(RECENT_KEY);
        const ids: string[] = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(ids) || ids.length === 0) {
          setGuides([]);
          return;
        }
        const res = await fetch("/api/guide/summaries", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) {
          if (!cancelled) setGuides([]);
          return;
        }
        const data = (await res.json()) as { guides: Summary[] };
        if (!cancelled) setGuides(data.guides ?? []);
      } catch {
        if (!cancelled) setGuides([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!guides || guides.length === 0) return null;

  return (
    <section style={{ padding: "48px 32px 64px", background: "#14110d" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div
          style={{
            textAlign: "center",
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
            fontSize: 13,
            color: "rgba(244,236,224,0.7)",
            marginBottom: 16,
          }}
        >
          Your recent guides
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {guides.map((g) => (
            <li
              key={g.id}
              style={{
                borderTop: "1px solid rgba(255,255,255,0.1)",
                padding: "12px 0",
              }}
            >
              <Link
                href={`/guide/${g.id}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  textDecoration: "none",
                  color: "inherit",
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 400,
                    fontSize: 14,
                    color: "#f4ece0",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {g.title?.trim() || "Untitled guide"}
                </span>
                <span
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 400,
                    fontSize: 12,
                    color: "rgba(244,236,224,0.46)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {relativeTime(g.created_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
