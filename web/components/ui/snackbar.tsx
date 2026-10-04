"use client";

// Snackbar for short confirmations ("Link copied", "Added to My stocks"). Any component calls
// showSnackbar(); the single <Snackbar /> in the root layout shows it for 3 seconds.
import { Check } from "lucide-react";
import { useEffect, useState } from "react";

const EVENT = "sharekhabar:snackbar";

export function showSnackbar(message: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
}

export function Snackbar() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onMessage = (e: Event) => {
      setMessage((e as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 3000);
    };
    window.addEventListener(EVENT, onMessage);
    return () => {
      window.removeEventListener(EVENT, onMessage);
      clearTimeout(timer);
    };
  }, []);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-5 md:bottom-8"
    >
      {message && <SnackbarView message={message} />}
    </div>
  );
}

export function SnackbarView({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-fg px-4 py-2.5 text-body text-background shadow-[var(--shadow-pop)]">
      <Check size={18} strokeWidth={1.5} aria-hidden />
      {message}
    </div>
  );
}
