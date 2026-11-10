/**
 * Unlike a layout, a template is created again on every navigation, so wrapping the page in it is
 * what makes each one fade and rise in (`animate-page-in`, see globals.css). Changing only the
 * search params (list filters, paging) doesn't re-create it, so lists don't flash on every keystroke.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
