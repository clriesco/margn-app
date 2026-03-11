import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { setTokenGetter } from "../lib/api";

export function ClerkTokenProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const initialized = useRef(false);

  // Set synchronously on first render so it's available before children's useEffect
  if (!initialized.current) {
    setTokenGetter(getToken);
    initialized.current = true;
  }

  // Update if getToken reference changes
  useEffect(() => {
    setTokenGetter(getToken);
  }, [getToken]);

  return <>{children}</>;
}
