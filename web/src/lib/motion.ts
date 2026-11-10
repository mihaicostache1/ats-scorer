import type { CSSProperties } from "react";

/**
 * Position of an item in a list, for the `animate-row-in` utility (see globals.css), which delays
 * each item a little more than the one before it, up to ten steps, so a list settles in as a wave
 * rather than all at once.
 */
export const staggerStyle = (index: number): CSSProperties =>
  ({ "--i": Math.max(0, Math.trunc(index)) }) as CSSProperties;
