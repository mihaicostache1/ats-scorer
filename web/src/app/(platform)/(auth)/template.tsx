/**
 * Sign in and register fade and rise in when you move between them. See `(app)/template.tsx`.
 * The wrapper spans the form column and centres `AuthCard`, which sets its own width.
 */
export default function AuthTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in flex w-full justify-center">{children}</div>;
}
