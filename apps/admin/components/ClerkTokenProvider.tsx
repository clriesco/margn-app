import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { setTokenGetter } from "../lib/api";

export function ClerkTokenProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    setTokenGetter(getToken);
  }, [getToken]);

  return <>{children}</>;
}
