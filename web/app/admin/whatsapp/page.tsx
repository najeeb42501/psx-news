import { posted } from "@/app/admin/actions";
import { CopyButton } from "@/components/admin/copy-button";
import { recentlyPosted, requireAdmin, whatsappQueue } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";

export default async function WhatsAppQueuePage() {
  await requireAdmin();
  const [queue, done] = await Promise.all([whatsappQueue(), recentlyPosted()]);
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-lg font-bold">WhatsApp Channel queue ({queue.length})</h1>
        <p className="text-sm text-muted">
          Meta does not let apps post to WhatsApp Channels, so post these yourself: copy the text, download the image, post
          it in the Channel, then press Mark as posted.
        </p>
        {queue.length === 0 && <p className="text-sm">Nothing to post right now.</p>}
        {queue.map((p) => {
          const image = p.image_url ?? (p.item_id ? `/api/og/item/${p.item_id}` : null);
          return (
            <article key={p.id} className="space-y-2 rounded-xl border border-border bg-card p-3">
              <div className="text-xs text-muted">
                {p.kind.replace("_", " ")} · {p.status}
                {p.scheduled_for ? ` · for ${formatDateTime(p.scheduled_for)}` : ""}
              </div>
              <pre className="whitespace-pre-wrap rounded-md bg-background p-2 font-sans text-sm">{p.text_en}</pre>
              <pre dir="rtl" className="ur whitespace-pre-wrap rounded-md bg-background p-2 text-sm">
                {p.text_ur}
              </pre>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={p.text_en} label="Copy English" />
                <CopyButton text={p.text_ur} label="Copy Urdu" />
                <CopyButton text={`${p.text_en}\n\n${p.text_ur}`} label="Copy both" />
                {image && (
                  <a href={image} download={`post-${p.id}.png`} className="rounded-md border border-border px-3 py-1 text-sm">
                    Download image
                  </a>
                )}
                <form action={posted}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="rounded-md bg-brand px-3 py-1 text-sm font-semibold text-white">Mark as posted</button>
                </form>
              </div>
            </article>
          );
        })}
      </section>
      {done.length > 0 && (
        <section className="space-y-1 text-sm">
          <h2 className="font-bold">Recently posted</h2>
          {done.map((p) => (
            <p key={p.id} className="text-muted">
              Posted {formatDateTime(p.posted_at)}: {p.text_en.split("\n")[0].slice(0, 90)}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
