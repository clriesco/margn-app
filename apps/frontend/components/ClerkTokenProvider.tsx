import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { setTokenGetter } from "../lib/api";

/**
 * Bridge component: injects Clerk's getToken() into the api.ts module
 * so that fetchAPI() can obtain fresh tokens without importing Clerk directly.
 */
export function ClerkTokenProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    setTokenGetter(() => getToken());
  }, [getToken]);

  return <>{children}</>;
}
