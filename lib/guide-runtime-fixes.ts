// Small runtime shims injected into every rendered guide's HTML so that guides
// generated before these fixes behave correctly without being regenerated:
//  - a collapsible reveal (any details/summary, e.g. the glossary aside) opens
//    in place and never toggles the stage it sits in: its click is stopped from
//    bubbling up to the stage's toggle handler;
//  - an open stage lets its body grow so the revealed content is not clipped.
//
// These mirror the patterns now baked into the generation template, so for newer
// guides this is a no-op overlap (a duplicate style and a second, harmless
// stopPropagation listener). Cosmetic/interaction only: no guide content, copy,
// or stored data is changed; this augments the rendered HTML at view time.

const RUNTIME_FIXES = `
<style id="sentiero-runtime-fixes">.stage.open .stage-body{overflow:visible !important;}</style>
<script>(function(){try{document.querySelectorAll('summary').forEach(function(s){s.addEventListener('click',function(e){e.stopPropagation();});});}catch(e){}})();</script>
`;

export function withGuideRuntimeFixes(html: string): string {
  if (!html) return html;
  const lower = html.toLowerCase();
  const bodyIdx = lower.lastIndexOf("</body>");
  if (bodyIdx !== -1) {
    return html.slice(0, bodyIdx) + RUNTIME_FIXES + html.slice(bodyIdx);
  }
  const htmlIdx = lower.lastIndexOf("</html>");
  if (htmlIdx !== -1) {
    return html.slice(0, htmlIdx) + RUNTIME_FIXES + html.slice(htmlIdx);
  }
  return html + RUNTIME_FIXES;
}
