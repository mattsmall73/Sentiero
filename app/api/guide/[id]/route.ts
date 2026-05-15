import { NextRequest, NextResponse } from "next/server";
import { getGuide } from "@/lib/db";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const guide = await getGuide(params.id);
  if (!guide) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({
    id: guide.id,
    html: guide.html_content,
    title: guide.title,
    user_name: guide.user_name,
    created_at: guide.created_at,
  });
}
