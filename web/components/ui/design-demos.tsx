"use client";

// Interactive bits of the /design page only.
import { Check } from "lucide-react";
import { showSnackbar } from "@/components/ui/snackbar";
import { Button } from "@/components/ui/primitives";

export function SnackbarDemo() {
  return (
    <Button onClick={() => showSnackbar("Link copied")}>
      <Check size={18} strokeWidth={1.5} aria-hidden /> Show “Link copied”
    </Button>
  );
}

export function OpenPaletteDemo() {
  return (
    <Button onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}>
      Open search (Ctrl K)
    </Button>
  );
}
