"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TagsInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange" | "type"
> {
  value: string[];
  onChange: (value: string[]) => void;
  error?: boolean;
  /** Longest single tag, in characters. */
  maxTagLength?: number;
  /** Most tags allowed. */
  maxTags?: number;
}

/**
 * Free-text chips. Type and press Enter or comma to add a tag; Backspace in the empty box removes
 * the last one; each chip has its own remove button, reachable with Tab. Duplicates (ignoring case)
 * are skipped. Pending text is committed on blur so it is never silently lost.
 *
 * `id`, `aria-describedby` and `aria-invalid` land on the text box, so a `<FormLabel>` names it.
 */
export const TagsInput = React.forwardRef<HTMLInputElement, TagsInputProps>(
  (
    {
      value,
      onChange,
      error,
      maxTagLength = 100,
      maxTags = 50,
      className,
      disabled,
      onBlur,
      onKeyDown,
      onPaste,
      placeholder,
      ...props
    },
    ref
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
    const [draft, setDraft] = React.useState("");
    const [announcement, setAnnouncement] = React.useState("");

    /** Adds every non-empty, new entry; returns whether the draft should be cleared. */
    const addTags = (raw: string[]) => {
      const next = [...value];
      const added: string[] = [];
      let skipped = false;
      for (const entry of raw) {
        const tag = entry.trim();
        if (!tag) continue;
        const exists = next.some((t) => t.toLowerCase() === tag.toLowerCase());
        if (exists || next.length >= maxTags) {
          skipped = true;
          continue;
        }
        next.push(tag.slice(0, maxTagLength));
        added.push(tag.slice(0, maxTagLength));
      }
      if (added.length) {
        onChange(next);
        setAnnouncement(`Added ${added.join(", ")}`);
      } else if (skipped) {
        setAnnouncement("Already added");
      }
      setDraft("");
    };

    const removeTag = (index: number) => {
      const removed = value[index];
      onChange(value.filter((_, i) => i !== index));
      setAnnouncement(`Removed ${removed}`);
      inputRef.current?.focus();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;
      if (event.key === "Enter" || event.key === ",") {
        // Enter on an empty box falls through so it still submits the surrounding form.
        if (event.key === "," || draft.trim()) {
          event.preventDefault();
          addTags([draft]);
        }
      } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
        removeTag(value.length - 1);
      }
    };

    const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
      onPaste?.(event);
      const text = event.clipboardData.getData("text");
      if (event.defaultPrevented || !/[,\n]/.test(text)) return;
      event.preventDefault();
      addTags([draft + text.split(/[,\n]/)[0], ...text.split(/[,\n]/).slice(1)]);
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      if (draft.trim()) addTags([draft]);
      onBlur?.(event);
    };

    return (
      <div
        className={cn(
          "border-input bg-background focus-within:ring-ring focus-within:border-ring flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border px-2 py-1 text-sm shadow-xs transition-colors focus-within:ring-2",
          error && "border-destructive focus-within:ring-destructive/30",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, index) => (
          <span
            key={tag}
            className="bg-secondary text-secondary-foreground inline-flex max-w-full items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2 text-xs font-medium"
          >
            <span className="truncate">{tag}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                removeTag(index);
              }}
              aria-label={`Remove ${tag}`}
              className="hover:bg-foreground/10 focus-visible:ring-ring rounded-sm p-0.5 focus-visible:ring-2 focus-visible:outline-none"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          {...props}
          ref={inputRef}
          type="text"
          value={draft}
          disabled={disabled}
          maxLength={maxTagLength}
          autoComplete="off"
          placeholder={value.length === 0 ? placeholder : undefined}
          aria-invalid={error ? "true" : props["aria-invalid"]}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={handleBlur}
          className="placeholder:text-muted-foreground min-w-24 flex-1 bg-transparent py-0.5 outline-none disabled:cursor-not-allowed"
        />
        <span className="sr-only" aria-live="polite">
          {announcement}
        </span>
      </div>
    );
  }
);
TagsInput.displayName = "TagsInput";
