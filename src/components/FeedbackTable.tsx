import Link from "next/link";

import { toggleFlagAction } from "@/actions/responses";
import { formatDateTime, cx } from "@/lib/format";
import { bucketForScore } from "@/lib/nps";
import type { FeedbackRow, SortKey } from "@/services/response.service";

const TONE: Record<string, string> = {
  promoter: "bg-emerald-50 text-emerald-700",
  passive: "bg-amber-50 text-amber-700",
  detractor: "bg-rose-50 text-rose-700",
};

function SortLink({
  label,
  sortKey,
  currentSort,
  query,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  query: Record<string, string>;
}) {
  const params = new URLSearchParams({ ...query, sort: sortKey, page: "1" });

  return (
    <Link
      href={`?${params.toString()}`}
      className={cx(
        "hover:text-slate-900",
        currentSort === sortKey ? "text-slate-900 underline" : "text-slate-500",
      )}
    >
      {label}
    </Link>
  );
}

export function FeedbackTable({
  rows,
  sort,
  query,
}: {
  rows: FeedbackRow[];
  sort: SortKey;
  query: Record<string, string>;
}) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-slate-500">
        No comments match these filters.
      </div>
    );
  }

  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="px-4 py-3 font-medium">Customer</th>
          <th className="px-4 py-3 font-medium">
            <SortLink
              label="Score"
              sortKey="score"
              currentSort={sort}
              query={query}
            />
          </th>
          <th className="px-4 py-3 font-medium">Comment</th>
          <th className="px-4 py-3 font-medium">
            <SortLink
              label="Received"
              sortKey="date"
              currentSort={sort}
              query={query}
            />
          </th>
          <th className="px-4 py-3 font-medium sr-only">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const bucket = bucketForScore(row.score);
          // Pre-bind the arguments to the server action so it's ready for the form
          const toggleAction = toggleFlagAction.bind(
            null,
            row.id,
            !row.flagged,
          );

          return (
            <tr
              key={row.id}
              className="border-b border-slate-50 last:border-0 align-top"
            >
              <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                {row.customerName}
              </td>
              <td className="px-4 py-3">
                <span
                  className={cx(
                    "inline-flex h-6 w-6 items-center justify-center rounded text-xs font-semibold tabular-nums",
                    TONE[bucket],
                  )}
                >
                  {row.score}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-700">{row.verbatim}</td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                {formatDateTime(row.respondedAt)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <form action={toggleAction}>
                  <button
                    type="submit"
                    className={cx(
                      "rounded p-1 transition-colors hover:bg-slate-100",
                      row.flagged ? "text-amber-500" : "text-slate-300",
                    )}
                    title={row.flagged ? "Unflag" : "Flag for follow-up"}
                  >
                    <svg
                      className="h-5 w-5"
                      fill={row.flagged ? "currentColor" : "none"}
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
                  </button>
                </form>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
