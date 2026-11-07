/**
 * Sign in and register fade and rise in when you move between them. See `(app)/template.tsx`.
 *
 * The layout centres its child in a flex row, and `AuthCard` sizes itself as `w-full max-w-md`.
 * Wrapped in a plain div that width would collapse to the card's content, so the wrapper takes over
 * the same sizing.
 */
export default function AuthTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in w-full max-w-md">{children}</div>;
}
