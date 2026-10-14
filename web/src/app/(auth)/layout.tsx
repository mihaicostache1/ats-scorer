import { Suspense } from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4 py-10">
      {/* Pages read `?next=` through useSearchParams, which needs a Suspense boundary. */}
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
}
