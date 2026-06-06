"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Preset = { label: string; minutes: number | null };

const PRESETS: Preset[] = [
  { label: "Half an hour", minutes: 30 },
  { label: "An hour", minutes: 60 },
  { label: "Two hours", minutes: 120 },
  { label: "Don't know", minutes: null },
];

const RECENT_KEY = "sentiero:recent-guide-ids";

function rememberGuide(id: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    const next = [id, ...ids.filter((x) => x !== id)].slice(0, 20);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

export function UploadCard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [userName, setUserName] = useState("");
  const [presetIndex, setPresetIndex] = useState<number | null>(null);
  const [precise, setPrecise] = useState(false);
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (presetIndex !== null) setPrecise(false);
  }, [presetIndex]);

  function pickFile(f: File | null) {
    setFile(f);
    setError(null);
    if (f) setShowPaste(false);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    if (f) pickFile(f);
  }

  function resolveTotalMinutes(): number | null {
    if (precise) {
      const h = Number(hours) || 0;
      const m = Number(minutes) || 0;
      const total = h * 60 + m;
      return total > 0 ? total : null;
    }
    if (presetIndex !== null) return PRESETS[presetIndex].minutes;
    return null;
  }

  async function generate() {
    setError(null);
    const hasFile = !!file;
    const hasText = pasted.trim().length > 0;
    if (!hasFile && !hasText) {
      setError("Add a file or paste some text first.");
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      if (file) form.append("file", file);
      if (hasText) form.append("text", pasted);
      const tm = resolveTotalMinutes();
      form.append("total_minutes", tm === null ? "" : String(tm));
      if (userName.trim()) form.append("user_name", userName.trim());

      const res = await fetch("/api/generate", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error || "Something went wrong. Try again.");
        setLoading(false);
        return;
      }
      rememberGuide(data.id);
      router.push(`/guide/${data.id}`);
    } catch (err) {
      console.error(err);
      setError("Network error. Check your connection and try again.");
      setLoading(false);
    }
  }

  const fileLabel = file ? file.name : null;

  return (
    <div style={{ width: "100%", maxWidth: 480, margin: "0 auto" }}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          background: "#fbf6ee",
          border: dragging
            ? "1px solid rgba(160,114,66,0.5)"
            : "1px solid rgba(57,50,43,0.12)",
          borderRadius: 16,
          padding: "40px 32px",
          boxShadow: "0 8px 30px rgba(0,0,0,0.22)",
          textAlign: "center",
          transition: "border-color 0.15s ease",
        }}
      >
        <div
          className="rose-soft-gradient"
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            margin: "0 auto 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#8a5a32",
          }}
          aria-hidden="true"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>

        <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 15, color: "#39322b", margin: "0 0 6px" }}>
          {fileLabel ?? "Drop a file here"}
        </div>
        <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 13, color: "#8a8073", margin: "0 0 24px" }}>
          PDF, image, Word, or plain text
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.csv,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*"
          style={{ display: "none" }}
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rose-gradient"
          style={{
            color: "#ffffff",
            border: "none",
            padding: "12px 28px",
            borderRadius: 980,
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
            fontSize: 14,
            letterSpacing: "-0.01em",
            cursor: "pointer",
            boxShadow: "0 2px 10px rgba(160,114,66,0.28)",
          }}
        >
          Choose file
        </button>

        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={() => setShowPaste((v) => !v)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              fontFamily: "Inter, sans-serif",
              fontWeight: 400,
              fontSize: 12,
              color: "#8a8073",
              cursor: "pointer",
              textDecoration: "underline",
              textDecorationColor: "rgba(138,126,118,0.4)",
              textUnderlineOffset: 3,
            }}
          >
            {showPaste ? "hide paste box" : "or paste text directly"}
          </button>
        </div>

        {showPaste && (
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="Paste the text here…"
            rows={6}
            style={{
              marginTop: 16,
              width: "100%",
              border: "1px solid rgba(57,50,43,0.18)",
              borderRadius: 12,
              padding: 12,
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              color: "#39322b",
              background: "#f3ece1",
              resize: "vertical",
            }}
          />
        )}
      </div>

      <div style={{ marginTop: 16, textAlign: "center" }}>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontFamily: "Inter, sans-serif",
            fontWeight: 400,
            fontSize: 12,
            color: "rgba(244,236,224,0.7)",
            cursor: "pointer",
          }}
        >
          {showMore ? "Hide options" : "More options"}
        </button>
      </div>

      {showMore && (
        <div
          style={{
            marginTop: 16,
            padding: "20px 24px",
            background: "#fbf6ee",
            border: "1px solid rgba(57,50,43,0.12)",
            borderRadius: 12,
            boxShadow: "0 8px 30px rgba(0,0,0,0.22)",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#8a8073" }}>
              Who&apos;s this for?
            </span>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Optional"
              style={{
                border: "1px solid rgba(57,50,43,0.18)",
                borderRadius: 8,
                padding: "8px 12px",
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                color: "#39322b",
                background: "#f3ece1",
              }}
            />
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#8a8073" }}>
              How long have you got?
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {PRESETS.map((p, i) => {
                const active = !precise && presetIndex === i;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setPresetIndex(active ? null : i)}
                    style={{
                      border: active ? "1px solid #a07242" : "1px solid rgba(57,50,43,0.18)",
                      background: active ? "#f5ebe0" : "#f3ece1",
                      color: "#39322b",
                      padding: "6px 12px",
                      borderRadius: 980,
                      fontFamily: "Inter, sans-serif",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setPrecise((v) => !v);
                  setPresetIndex(null);
                }}
                style={{
                  border: precise ? "1px solid #a07242" : "1px solid rgba(57,50,43,0.18)",
                  background: precise ? "#f5ebe0" : "#f3ece1",
                  color: "#39322b",
                  padding: "6px 12px",
                  borderRadius: 980,
                  fontFamily: "Inter, sans-serif",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Set precise time
              </button>
            </div>
            {precise && (
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    placeholder="0"
                    style={{
                      width: 60,
                      border: "1px solid rgba(57,50,43,0.18)",
                      borderRadius: 8,
                      padding: "6px 8px",
                      fontFamily: "Inter, sans-serif",
                      fontSize: 13,
                      color: "#39322b",
                      background: "#f3ece1",
                    }}
                  />
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#8a8073" }}>hours</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    placeholder="0"
                    style={{
                      width: 60,
                      border: "1px solid rgba(57,50,43,0.18)",
                      borderRadius: 8,
                      padding: "6px 8px",
                      fontFamily: "Inter, sans-serif",
                      fontSize: 13,
                      color: "#39322b",
                      background: "#f3ece1",
                    }}
                  />
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#8a8073" }}>minutes</span>
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, textAlign: "center" }}>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="rose-gradient"
          style={{
            color: "#ffffff",
            border: "none",
            padding: "14px 36px",
            borderRadius: 980,
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
            fontSize: 15,
            letterSpacing: "-0.01em",
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.7 : 1,
            boxShadow: "0 2px 10px rgba(160,114,66,0.28)",
          }}
        >
          {loading ? "Generating…" : "Generate"}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: 12,
            textAlign: "center",
            fontFamily: "Inter, sans-serif",
            fontSize: 13,
            color: "#e9b6a8",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          marginTop: 32,
          textAlign: "center",
          fontFamily: "Inter, sans-serif",
          fontWeight: 400,
          fontSize: 13,
          color: "rgba(244,236,224,0.7)",
        }}
      >
        No account needed. Your work stays yours.
      </div>
    </div>
  );
}
