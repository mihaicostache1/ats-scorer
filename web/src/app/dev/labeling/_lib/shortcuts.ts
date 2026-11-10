import type { Rating } from "./types";

export type ShortcutAction =
  | { type: "rate"; value: Rating }
  | { type: "skip" }
  | { type: "undo" }
  | { type: "prev" }
  | { type: "next" }
  | { type: "export" }
  | { type: "help" };

/** What the help dialog lists. Kept next to `actionForKey` so the two cannot drift apart. */
export const SHORTCUTS: readonly { keys: string[]; does: string }[] = [
  { keys: ["0", "1", "2", "3"], does: "Rate the pair and move to the next one" },
  { keys: ["S"], does: "Skip: leave it unrated and move on (an existing rating is kept)" },
  {
    keys: ["U", "Backspace", "Ctrl+Z"],
    does: "Undo the last rating or skip, as often as you like",
  },
  { keys: ["←", "→"], does: "Look at the previous or next pair without changing anything" },
  { keys: ["E"], does: "Export the ratings as a CSV" },
  { keys: ["?"], does: "Show this help" },
];

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  isComposing: boolean;
  target: EventTarget | null;
}

function isEditable(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * The action a key press stands for, or `null` when it should be left alone:
 * - while typing in a field (the rater name), so letters and Ctrl+Z keep working there;
 * - while a key is held down, so holding "3" cannot rate every remaining pair;
 * - while an input method is composing text;
 * - with Ctrl, Cmd or Alt held, except Ctrl/Cmd+Z, so browser shortcuts such as Ctrl+S or Ctrl+R
 *   still do what they always do.
 */
export function actionForKey(event: KeyEventLike): ShortcutAction | null {
  if (event.repeat || event.isComposing || isEditable(event.target)) return null;

  const key = event.key;
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
    return key.toLowerCase() === "z" ? { type: "undo" } : null;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  if (key === "0" || key === "1" || key === "2" || key === "3") {
    return { type: "rate", value: Number(key) as Rating };
  }
  switch (key) {
    case "s":
    case "S":
      return { type: "skip" };
    case "u":
    case "U":
    case "Backspace":
      return { type: "undo" };
    case "ArrowLeft":
      return { type: "prev" };
    case "ArrowRight":
      return { type: "next" };
    case "e":
    case "E":
      return { type: "export" };
    case "?":
      return { type: "help" };
    default:
      return null;
  }
}
