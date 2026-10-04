// Urdu text with English names, codes and numbers kept in order. Each run of English letters or
// digits ("Diamond Industries Limited (DIIL)", "EPS 4.25", "2026") is isolated in its own <bdi>,
// so it reads left-to-right inside the right-to-left sentence and never swaps places with a
// neighbouring number ("EPS 4.25 … 1 روپے" must not display as "EPS 4.25 1").
const LTR_RUN = /[A-Za-z0-9][A-Za-z0-9.,:%&()'’/+\- ]*[A-Za-z0-9%)]|[A-Za-z0-9]/g;

export function UrduText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LTR_RUN)) {
    const start = m.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <bdi key={start} dir="ltr" className="ltr-run">
        {m[0]}
      </bdi>,
    );
    last = start + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
