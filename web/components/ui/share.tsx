"use client";

// Share an item: the phone's share sheet (or copy the link), WhatsApp, or the share image.
import { Download, Link2, Share2 } from "lucide-react";
import { showSnackbar } from "@/components/ui/snackbar";
import { T } from "@/components/ui/primitives";

const BTN =
  "inline-flex h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] bg-surface px-4 text-body font-medium text-fg transition-colors duration-150 hover:bg-hairline";

export function ShareBar({ url, text, imageUrl, fileName }: { url: string; text: string; imageUrl: string; fileName: string }) {
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showSnackbar("Link copied");
    } catch {
      // the visitor closed the share sheet: nothing to do
    }
  }
  async function download() {
    try {
      const blob = await (await fetch(imageUrl)).blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(a.href);
      showSnackbar("Image downloaded");
    } catch {
      showSnackbar("Could not download the image");
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={share} className={BTN}>
        <Share2 size={18} strokeWidth={1.5} aria-hidden />
        <T en="Share" ur="شیئر کریں" />
      </button>
      <a href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`} target="_blank" rel="noopener noreferrer" className={BTN}>
        <Link2 size={18} strokeWidth={1.5} aria-hidden />
        WhatsApp
      </a>
      <button type="button" onClick={download} className={BTN}>
        <Download size={18} strokeWidth={1.5} aria-hidden />
        <T en="Share image" ur="تصویر" />
      </button>
    </div>
  );
}
