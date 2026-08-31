"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cx } from "@/lib/format";

export function FlagFilter({ current }: { current: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const toggle = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (current) {
      params.delete("flagged");
    } else {
      params.set("flagged", "true");
    }
    params.set("page", "1");
    router.push(`?${params.toString()}`);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={cx(
        "inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm transition-colors",
        current
          ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
          : "text-slate-600 hover:bg-slate-50",
      )}
    >
      <svg
        className="h-4 w-4"
        fill={current ? "currentColor" : "none"}
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
        />
      </svg>
      {current ? "Flagged only" : "Show flagged"}
    </button>
  );
}
