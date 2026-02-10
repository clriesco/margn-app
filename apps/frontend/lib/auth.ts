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
export function useAuth() {
  const { user: clerkUser, isLoaded } = useUser();
  const { signOut: clerkSignOut } = useClerk();

  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? "";

  const user = useMemo(
    () => (clerkUser ? { email } : null),
    [clerkUser, email]
  );

  const signOut = useCallback(() => clerkSignOut(), [clerkSignOut]);

  return {
    user,
    loading: !isLoaded,
    signOut,
  };
}
