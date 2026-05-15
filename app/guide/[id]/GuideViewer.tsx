"use client";

import { useEffect } from "react";
import { Header } from "@/components/Header";

const RECENT_KEY = "sentiero:recent-guide-ids";

type Props = {
  id: string;
  title: string | null;
  html: string;
};

export function GuideViewer({ id, title, html }: Props) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      const next = [id, ...ids.filter((x) => x !== id)].slice(0, 20);
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, [id]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#fbfbfd" }}>
      <Header
        rightSlot={
          <span
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 400,
              fontSize: 13,
              color: "#8a7e76",
            }}
          >
            Saved automatically
          </span>
        }
      />
      <iframe
        title={title || "Sentiero guide"}
        srcDoc={html}
        sandbox="allow-scripts allow-same-origin allow-forms"
        style={{
          flex: 1,
          width: "100%",
          border: "none",
          background: "#fbfbfd",
        }}
      />
    </div>
  );
}
