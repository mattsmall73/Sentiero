import { NextRequest, NextResponse } from "next/server";
import { getGuideSummaries } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  if (!Array.isArray(body.ids)) {
    return NextResponse.json({ guides: [] });
  }
  const ids = body.ids.filter((x): x is string => typeof x === "string").slice(0, 50);
  const guides = await getGuideSummaries(ids);
  return NextResponse.json({ guides });
}
