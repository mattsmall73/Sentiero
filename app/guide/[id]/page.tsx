import { notFound } from "next/navigation";
import { getGuide } from "@/lib/db";
import { withGuideRuntimeFixes } from "@/lib/guide-runtime-fixes";
import { GuideViewer } from "./GuideViewer";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

export default async function GuidePage({ params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    notFound();
  }
  const guide = await getGuide(params.id);
  if (!guide) notFound();

  return (
    <GuideViewer
      id={guide.id}
      title={guide.title}
      html={withGuideRuntimeFixes(guide.html_content)}
    />
  );
}
