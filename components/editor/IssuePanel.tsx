"use client";

import { LayoutIssue } from "@/lib/geometry/validate";

interface IssuePanelProps {
  issues: LayoutIssue[];
  onFocusIssue: (objectIds: string[]) => void;
}

export function IssuePanel({ issues, onFocusIssue }: IssuePanelProps) {
  if (issues.length === 0) {
    return (
      <div className="absolute top-2 right-2 z-10 bg-white/90 backdrop-blur px-3 py-1.5 rounded-md text-xs text-emerald-700 shadow-sm flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
        No conflicts
      </div>
    );
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return (
    <div className="absolute top-2 right-2 z-10 bg-white/95 backdrop-blur rounded-md shadow-sm w-80 max-h-64 overflow-y-auto text-xs">
      <div className="px-3 py-2 border-b border-neutral-200 font-semibold text-neutral-700 flex items-center gap-2">
        {errorCount > 0 && <span className="text-red-600">{errorCount} error{errorCount !== 1 ? "s" : ""}</span>}
        {warningCount > 0 && (
          <span className="text-amber-600">
            {warningCount} clearance warning{warningCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <ul>
        {issues.map((issue) => (
          <li
            key={issue.id}
            className="px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 cursor-pointer flex items-start gap-2"
            onClick={() => onFocusIssue(issue.objectIds)}
          >
            <span
              className={`mt-0.5 inline-block w-2 h-2 rounded-full shrink-0 ${
                issue.severity === "error" ? "bg-red-600" : "bg-amber-500"
              }`}
            />
            <span className="text-neutral-700">{issue.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
