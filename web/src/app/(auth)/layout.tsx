import { Suspense } from "react";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-ambient relative flex min-h-screen items-center justify-center px-4 py-10">
      {/* No header on these pages, so the theme menu sits in the corner. */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      {/* Pages read `?next=` through useSearchParams, which needs a Suspense boundary. */}
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
}
