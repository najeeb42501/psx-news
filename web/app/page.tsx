import { BRAND } from "@/lib/brand";

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold">{BRAND.name}</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">{BRAND.tagline}</p>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400" dir="rtl" lang="ur">
        {BRAND.taglineUr}
      </p>
    </div>
  );
}
