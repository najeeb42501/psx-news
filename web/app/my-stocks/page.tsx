import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { L } from "@/components/l";
import { MyStocksManager } from "@/components/my-stocks-manager";

export const metadata: Metadata = { title: "My stocks" };

export default function MyStocksPage() {
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Icon name="star" className="size-6 text-brand" />
          <L en="My stocks" ur="میرے شیئرز" />
        </h1>
        <p className="text-sm text-muted">
          <L
            en="Follow the companies you care about: their news and upcoming events in one place. Saved only in this browser, no sign-up."
            ur="اپنی پسند کی کمپنیوں کو فالو کریں: ان کی خبریں اور ایونٹس ایک جگہ۔ صرف اسی براؤزر میں محفوظ، کوئی سائن اپ نہیں۔"
          />
        </p>
      </header>
      <MyStocksManager />
    </div>
  );
}
