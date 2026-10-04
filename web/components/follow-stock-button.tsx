"use client";

import { setMyStocks, useMyStocks } from "@/lib/client-store";

export function FollowStockButton({ symbol }: { symbol: string }) {
  const stocks = useMyStocks();
  if (stocks === null) return null;
  const following = stocks.includes(symbol);
  return (
    <button
      type="button"
      onClick={() => setMyStocks(following ? stocks.filter((s) => s !== symbol) : [...stocks, symbol])}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold ${following ? "border border-border" : "bg-brand text-white"}`}
    >
      {following ? "✓ In my stocks" : "+ Add to my stocks"}
    </button>
  );
}
