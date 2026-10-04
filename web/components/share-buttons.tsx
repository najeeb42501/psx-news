"use client";

import { useState } from "react";

/** Share an item to WhatsApp (the link preview shows the image card) or share/download the card itself. */
export function ShareButtons({ url, text, imageUrl, fileName }: { url: string; text: string; imageUrl: string; fileName: string }) {
  const [status, setStatus] = useState("");
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;

  async function shareImage() {
    try {
      const blob = await (await fetch(imageUrl)).blob();
      const file = new File([blob], fileName, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `${text}\n${url}` });
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus("Image downloaded");
    } catch {
      setStatus("Could not share the image");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white"
      >
        Share on WhatsApp
      </a>
      <button type="button" onClick={shareImage} className="rounded-full border border-border px-4 py-2 text-sm font-semibold">
        Share image card
      </button>
      {status && <span className="text-xs text-muted">{status}</span>}
    </div>
  );
}
