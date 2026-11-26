import { MockProvider } from "@/providers/mock-provider";
import { SessionProvider } from "@/providers/session-provider";

/**
 * Everything that talks to the API: sign-in, registration and the signed-in workspace. The mock
 * worker and the session live here rather than in the root layout, so the public marketing pages
 * render on the server without waiting for either.
 */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <MockProvider>
      <SessionProvider>{children}</SessionProvider>
    </MockProvider>
  );
}
