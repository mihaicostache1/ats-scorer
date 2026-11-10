import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RATING_LABELS, RATINGS, type Rating } from "../_lib/types";

const kbd =
  "border-border bg-secondary text-secondary-foreground rounded border px-1.5 py-0.5 font-mono text-xs";

/**
 * The four ratings, each with the rule of thumb from docs/ml/evaluation.md, and the key that gives
 * it. The keys are shortcuts: every rating is also a button, so the page works with a mouse or with
 * Tab and Enter too.
 */
export function RatingBar({
  current,
  disabled,
  onRate,
}: {
  /** The pair's rating so far, if it has one. */
  current: Rating | null;
  disabled: boolean;
  onRate: (value: Rating) => void;
}) {
  return (
    <section
      aria-labelledby="labeling-rating-heading"
      className="glass min-w-0 space-y-3 rounded-2xl p-5"
    >
      <h2 id="labeling-rating-heading" className="text-foreground text-headline">
        How well does this CV fit?
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {RATINGS.map((value) => {
          const selected = current === value;
          return (
            <li key={value}>
              <Button
                type="button"
                variant={selected ? "default" : "outline"}
                disabled={disabled}
                aria-pressed={selected}
                aria-keyshortcuts={String(value)}
                onClick={() => onRate(value)}
                className="h-auto w-full flex-col items-start gap-1 px-3 py-2.5 text-left whitespace-normal"
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="font-semibold">
                    {value} · {RATING_LABELS[value].name}
                  </span>
                  <kbd
                    className={cn(kbd, selected && "border-primary-foreground/40 bg-transparent")}
                  >
                    {value}
                  </kbd>
                </span>
                <span className="text-xs font-normal opacity-80">{RATING_LABELS[value].rule}</span>
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
