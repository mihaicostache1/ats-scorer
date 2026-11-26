# ATS Scorer design system

**Bold on the outside. Clear on the inside.**

The public site is Ink navy and editorial: big type, product-led, one Cobalt accent. The signed-in workspace is light, cool and quiet, on a Canvas of light Liquid Glass: it is a tool people use all day. Both share one palette (colour scheme A · **Ink & Cobalt**), one typeface family, one brand mark and one rule: **the system ranks and explains, people decide.**

Tokens live in `web/src/app/globals.css`. Components live in `web/src/components`.

---

## 1. Principles

1. **Clarity first, then light Liquid Glass.** Hierarchy comes from type, spacing and contrast. Surfaces are restrained glass: translucent fills over a faint Cobalt ambient light, a hairline border, a 1px top highlight and a soft blur; interactive surfaces get a subtle Cobalt glow on hover. Glass never carries meaning and never lowers contrast below AA. No blobs or decorative illustrations.
2. **Show the product.** On the marketing site the product is the main visual, built from the same components the app uses (`ScoreBreakdown`, `ScoreValue`, `Badge`) and filled with clearly labelled synthetic data (`Example data`).
3. **Honest data.** Show only what the API returns. A value that is missing is shown as missing ("Not scored yet", "Not computed", "—"), never as zero. Nothing is estimated, trended or invented.
4. **Scores support people.** A score is always for one job and shows its parts. Nothing is hidden, rejected or contacted because of a score.
5. **One accent.** Cobalt is for interaction and brand: #2F55E4 on light surfaces, #7C96FF on Ink. There is no orange. Outcomes use their own status colours (soft green, amber, red); only the neutral in-progress `info` status shares a soft Cobalt tint.

---

## 2. Colour

Colour scheme A · **Ink & Cobalt**.

### Brand palette (raw values)

| Token | Hex | Use |
|---|---|---|
| `ink-950` Ink navy | `#0A1022` | Primary dark background: dark app shell, marketing, auth panel; primary text on light; logo tile |
| `ink-900` | `#111A33` | Dark surfaces, dark-mode cards |
| `ink-800` | `#18233F` | Raised dark surfaces, dark-mode popovers |
| `ink-700` | `#283452` | Borders on Ink |
| `cobalt-600` Cobalt | `#2F55E4` | Brand accent on light: filled buttons, links, focus rings, progress and score bars, active indicators |
| `cobalt-700` | `#2444C2` | Hover on Cobalt |
| `cobalt-300` Cobalt on dark | `#7C96FF` | Brand accent on Ink: links, highlights, active states, filled buttons (with an Ink label), the logo point |
| `cobalt-200` | `#A3B5FF` | Hover on Cobalt on dark |
| `canvas` | `#F5F6F9` | Light canvas (primary light background), text on Ink |
| `canvas-200` | `#ECEEF3` | Secondary fills, segmented controls |
| `canvas-300` | `#DFE3EB` | Borders on light |
| `slate-text` Slate | `#566079` | Secondary text, metadata, subtitles on light |
| `mist` | `#9AA5BF` | Secondary text on Ink |
| `steel` | `#7C88A3` | Tertiary text and icons on Ink only (fails contrast on white) |

### Semantic tokens (what components use)

`background`, `background-secondary` (the canvas), `foreground`, `card`, `popover`, `muted-foreground`, `border`, `border-strong`, `input`, `ring`, `primary` (+`-hover`, `-pressed`, `-foreground`), `link`, `electric` (+`-soft`), `inverse` (+`-hover`, `-foreground`), and independent status tokens `success`, `warning`, `destructive`, `info` (each with `-soft`), plus `disabled` / `disabled-foreground`. Every token has a light value (`:root`, `.light`) and a dark Ink value (`.dark`).

Glass tokens: `--glass` / `--glass-strong` (translucent fills), `--glass-border`, `--glass-highlight` (inset top light), `--glass-blur` / `--glass-blur-strong`, `--glow` (Cobalt hover halo) and `--ambient` (two faint Cobalt radials behind the canvas). They are applied centrally by the `surface`, `surface-overlay`, `glass-bar` and `interactive` utilities; Ink-only brand surfaces use `glass-bar-ink`, `ambient-ink` and `glow-on-ink`.

`.light` and `.dark` can be set on any element to force an appearance locally. The marketing site uses this so product previews keep their look on an Ink page.

### Contrast decisions

All pairs below were measured, including the worst case for glass: a glass surface over the ambient light at its peak.

| Pair | Ratio |
|---|---|
| White on Cobalt `#2F55E4` (filled button) | 5.9:1 |
| Cobalt on Canvas / on light glass (links) | 5.5:1 |
| Slate `#566079` on Canvas / on white | 5.8:1 / 6.3:1 |
| Slate on the canvas at the ambient peak | 4.8:1 |
| Ink on Canvas / on light glass | 17.5:1 |
| `#7C96FF` on Ink / on `#111A33` / on dark glass | 6.9:1 / 6.3:1 / 5.8:1 |
| Ink label on `#7C96FF` (dark filled button) | 6.9:1 |
| Mist `#9AA5BF` on Ink / on dark glass | 7.7:1 / 6.4:1 |
| Ink on the white marketing CTA | 18.9:1 |

- **On Ink, filled buttons are `#7C96FF` with an Ink label**, not Cobalt with white: crisper, and consistent with every other accent on Ink.
- **The main marketing CTA on Ink is a white button with an Ink label** (`inverse`), with a soft Cobalt glow on hover.
- **Focus rings** are Cobalt on light (5.9:1 against white) and `#7C96FF` on Ink (6.9:1). `#7C96FF` is never a focus ring on white (2.7:1).
- **Status text** (`success #0F7A4B`, `warning #9A5B00`, `destructive #C8283D`) stays at or above 5:1 on white and on light glass; dark-mode equivalents are tuned for Ink. "Parsed" is soft green and "Needs review" soft amber wherever they appear.
- `steel` is never used for text on light surfaces.

### Glass fallbacks

Glass becomes opaque (`card` / `popover`) and the ambient light switches off when `backdrop-filter` is unsupported, when the person asks for `prefers-reduced-transparency: reduce`, and under `prefers-contrast: more` (which also firms up borders). Every backdrop blur, including dialog scrims, is removed in those cases.

### Distribution

- **Marketing:** mostly Ink and neutrals, with Canvas and white for light sections. Cobalt on dark (`#7C96FF`) marks the accent word in the hero, section numbers, the editorial markers and the logo point; Cobalt (`#2F55E4`) marks light-section labels. Primary CTAs are white on Ink. Ink sections carry a faint Cobalt ambient light behind the blueprint grid.
- **Workspace:** almost entirely neutral glass on Canvas. Cobalt for actions, focus, selection, progress, score bars and the active navigation indicator.
- **Never:** orange, Cobalt for an outcome status (Parsed, Needs review, Failed), strong or coloured glows, glass that drops text below AA.

---

## 3. Typography

**Geist Sans** for everything people read. **Geist Mono** only for scores, identifiers, file names, counts and small editorial labels. Loaded with `next/font/google` in `app/layout.tsx` (`--font-geist-sans`, `--font-geist-mono`), self-hosted at build time, `display: swap`.

| Utility | Size | Use |
|---|---|---|
| `text-display` | 44 → 92px fluid, −0.045em | Marketing hero, final call to action |
| `text-section` | 36 → 64px fluid, −0.038em | Marketing section titles |
| `text-subsection` | 26 → 40px fluid | Marketing secondary titles |
| `text-lede` | 17 → 20px | Marketing supporting copy |
| `text-eyebrow` / `text-eyebrow-sm` | 12 / 11px mono, uppercase, +0.08em | Editorial labels, section numbers, table metadata |
| `text-large-title` | 28 → 34px | App page titles |
| `text-title-3` | 18px | App section titles |
| body | 15px / 1.5 | Default; tables and forms use 13–14px |
| `text-metric` | 32 → 44px mono-feeling, tabular | Key numbers (overview, match score) |

Medium (500) and semibold (600) carry hierarchy. Large headlines use negative tracking; numbers use tabular figures (`tabular`, `tabular-nums`). Headings use `text-wrap: balance`, paragraphs `pretty`. Text is never set below 11px.

---

## 4. Brand mark

`components/brand/logo.tsx` (`LogoMark`, `Wordmark`), favicon at `app/icon.svg`.

A rounded document tile holding three left-aligned lines: the structured fields extracted from a CV. The middle line stops short and ends in a single **Cobalt point** (`#7C96FF`): the detail a person has checked. Document structure, extraction, alignment, human review. Drawn on a 32-unit grid; legible at 16px (favicon), 24–28px (sidebar, auth) and larger. `tone="navy"` for light backgrounds (adapts in dark mode), `tone="outline"` on navy. No robots, sparkles or brains. No ® or ™.

---

## 5. Layout and spacing

- **Spacing:** 4px base, 8px rhythm. Section gaps in the app are 32–40px; card padding 20–24px.
- **Marketing grid:** 12 columns, max width 1360px, gutters 24 / 40 / 64px (mobile / tablet / desktop), section padding 96–160px. Sections alternate Ink, Canvas and white; compositions alternate (asymmetric split, numbered columns, full-width product).
- **Workspace:** sidebar 240px (collapses to a 60px rail, remembered), content max 1440px, 8/4 column splits for primary and secondary content.
- **Radii:** 4px (xs), 6px badges and small controls, 8px default controls, 10px large buttons, 12px surfaces. Not every container is rounded; lists inside a surface use hairline dividers.
- **Elevation:** surfaces are light glass (`surface`): translucent fill, glass border, top highlight, soft blur, almost no shadow. Overlays (menus, dialogs, toasts, sticky action bars) use denser glass (`surface-overlay`) with `--shadow-overlay`. The app header and sidebar are `glass-bar`.

---

## 6. Components

| Component | File | Notes |
|---|---|---|
| Button | `ui/button.tsx` | `default` (Cobalt; `#7C96FF` with an Ink label on dark; soft Cobalt glow on hover), `inverse` (white with an Ink label, for the main CTA on Ink), `outline`, `secondary`, `ghost`, `destructive`, `destructive-outline`, `link`. Sizes `xs`–`xl`, `icon*`. 1px press, no scaling. Disabled uses the `disabled` token. |
| Badge + StatusDot | `ui/badge.tsx` | 22px tall, 6px radius, soft tint + accessible text colour. Always carries a word. Renders a `<span>`. |
| Input, Select, Textarea | `ui/*.tsx` | 36px, `control` surface, Cobalt border + 3px soft ring on focus, destructive state via `aria-invalid`. |
| Checkbox, Switch | `ui/*.tsx` | Cobalt when on; 2px offset focus ring. |
| Dialog | `ui/dialog.tsx` | Ink scrim with a light 4px blur, dense glass popup, 12px radius, scale 0.98 → 1. |
| Menu | `ui/dropdown-menu.tsx` | `Item`, `RadioItem`, `Separator`, `Header`. |
| Toast | `ui/toast.tsx` | Overlay surface with a 3px status bar on the left. |
| Skeleton | `ui/skeleton.tsx` | Shimmer sweep; still under reduced motion. |
| Progress | `ui/progress.tsx` | Determinate only (upload bytes). Backend processing uses the indeterminate bar (`animate-indeterminate`) because the API reports a state, not a percentage. |
| PageHeader, SectionHeader, BackLink | `layout/page-header.tsx` | The one page-header pattern: back link, title, description, meta row, actions, tabs/toolbar slot. |
| App shell | `layout/app-shell.tsx`, `app-sidebar.tsx`, `app-header.tsx`, `nav-config.ts` | Canvas with the ambient light; collapsible glass sidebar with a Cobalt active indicator, compact header with breadcrumbs, theme and account menu, skip link, modal mobile drawer with focus trap. |
| Tables | `jobs/jobs-table.tsx` (`TABLE` styles) | Shared header, row, cell and link styles; tabular dates; columns drop out by priority on smaller screens. |
| Empty / Error states | `common/*.tsx` | Icon in a small square, one sentence, one action. Error state can reveal technical details. |
| ScoreBreakdown, ScoreValue | `scoring/score-breakdown.tsx` | Explainable job match: overall score, component bars with weights, matched/missing skills, explanations, model version, "supports, does not decide" note. "Not computed" for null components. Server-renderable. |
| Marketing | `marketing/*` | `SiteHeader`, `SiteFooter`, `ProductPreview`, `CvPaper`, `ExampleDataLabel`, synthetic `demo-data.ts`. |

Every interactive element has hover, `focus-visible` (2px Cobalt ring; `#7C96FF` on Ink), active and disabled states; async actions show a spinner and a busy label ("Saving…").

---

## 7. Motion

Durations: `--motion-fast` 120ms (hover, press), `--motion-base` 200ms (menus, dialogs, drawers), `--motion-slow` 320ms (page and row entrances); marketing reveals 560–600ms. Curves: `--ease-fluid` (long ease-out) and `--ease-standard`. Nothing bounces; `ease-pop` no longer overshoots.

- **Marketing:** staggered headline rise on load, delayed product entrance, scroll-driven section reveal (`.reveal`, CSS `animation-timeline: view()` only, so content is never hidden where it is unsupported).
- **App:** page fade-in via `template.tsx`, staggered row entrance (24ms steps, capped at 10), menu/dialog scale-fade, toast slide.
- Hover feedback is colour and, on interactive surfaces and primary actions, a soft Cobalt glow; never movement. No parallax, no scroll-jacking, no loops except loading feedback.
- `prefers-reduced-motion: reduce` makes every animation and transition finish instantly; spinners and the indeterminate bar keep turning slowly because they are feedback.

---

## 8. Accessibility (WCAG 2.2 AA target)

- Contrast checked for every token pairing listed above, including button states.
- Skip links on the marketing site, the workspace and the CV review screen.
- Landmarks: `header`, `nav` (labelled), `main`, `aside`; one `h1` per page; breadcrumbs with `aria-current="page"`.
- Status is never colour alone: badges carry words, missing skills are dashed with a minus icon, score bars are `role="meter"` with values.
- The CV review divider is a focusable `role="separator"` with arrow, Shift+arrow, Home/End keys; double-click resets.
- The mobile navigation drawer is a modal dialog: focus moves in, Tab is trapped, Escape closes.
- Touch targets are at least 32px in dense tables and 40–48px on marketing and auth.
- Layouts reflow to 390px without horizontal page scroll; tables scroll inside their container.

---

## 9. Voice

Confident, concise, plain. Say what the product does, not what it "unlocks". Never claim speed, accuracy, fairness, bias removal or compliance the product can't prove. In the app, use everyday words ("Not parsed", "Extracting text", "Try again") instead of backend terms.
