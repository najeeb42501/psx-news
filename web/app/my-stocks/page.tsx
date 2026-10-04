import type { Metadata } from "next";
import { MyStocksManager } from "@/components/my-stocks-manager";

export const metadata: Metadata = { title: "My stocks" };

export default function MyStocksPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">
        <span className="ui-en">My stocks</span>
        <span className="ui-ur ur ur-tight"> میرے شیئرز</span>
      </h1>
      <p className="text-sm text-muted">
        Pick the companies you follow. Their news shows first on the home page. Your list is saved only in this browser: no
        sign-up, nothing stored by us.
      </p>
      <MyStocksManager />
    </div>
  );
}
