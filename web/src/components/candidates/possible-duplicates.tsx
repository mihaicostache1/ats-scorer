import * as React from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { components } from "@/api/generated/schema";

export type PossibleDuplicate = components["schemas"]["PossibleDuplicate"];

const matchLabel = { email: "Email", phone: "Phone", name: "Similar name" };

export function PossibleDuplicates({ matches }: { matches?: readonly PossibleDuplicate[] }) {
  const heading = React.useId();
  if (!matches?.length) return null;

  return (
    <section
      aria-labelledby={heading}
      className="bg-warning/10 border-warning/25 rounded-2xl border p-4"
    >
      <h2 id={heading} className="text-foreground flex items-center gap-2 text-sm font-semibold">
        <TriangleAlert className="text-warning size-4 shrink-0" aria-hidden="true" />
        Possible duplicates
      </h2>
      <ul className="mt-2 space-y-1 pl-6 text-sm">
        {matches.map((match) => (
          <li key={match.candidate_id}>
            <Link
              href={`/candidates/${match.candidate_id}`}
              className="font-medium underline underline-offset-4"
            >
              {match.full_name}
            </Link>
            <span className="text-muted-foreground ml-2 text-xs">
              {match.matched_on.map((reason) => matchLabel[reason]).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
