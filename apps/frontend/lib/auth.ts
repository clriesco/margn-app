import { useMemo, useCallback } from "react";
import { useUser, useClerk } from "@clerk/nextjs";

/**
 * Compatibility hook that wraps Clerk hooks to match
 * the interface of the old AuthContext useAuth()
 *
 * Old interface:
 *   user: { email: string } | null
 *   loading: boolean
 *   signOut: () => Promise<void>
 */
function isE2EBypass(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return document.cookie.includes("__e2e_bypass=1");
  } catch {
    return false;
  }
}

export function useAuth() {
  const { user: clerkUser, isLoaded } = useUser();
  const { signOut: clerkSignOut } = useClerk();

  const e2e = isE2EBypass();

  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? "";

  const user = useMemo(
    () =>
      clerkUser
        ? { email }
        : e2e
          ? { email: "e2e@test.com" }
          : null,
    [clerkUser, email, e2e]
  );

  const signOut = useCallback(() => clerkSignOut(), [clerkSignOut]);

  return {
    user,
    loading: e2e ? false : !isLoaded,
    signOut,
  };
}
