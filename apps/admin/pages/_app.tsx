import { ReactNode } from "react";
import { AppProps } from "next/app";
import Head from "next/head";
import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import { ClerkTokenProvider } from "../components/ClerkTokenProvider";
import { ToastProvider } from "../components/Toast";

const clerkPubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";

const isE2ETesting =
  process.env.NEXT_PUBLIC_E2E_TESTING === "true" &&
  process.env.NODE_ENV !== "production";

function useE2EBypass(): boolean {
  return isE2ETesting;
}

function MaybeTokenProvider({ skip, children }: { skip: boolean; children: ReactNode }) {
  if (skip) return <>{children}</>;
  return <ClerkTokenProvider>{children}</ClerkTokenProvider>;
}

export default function App({ Component, pageProps }: AppProps) {
  const e2e = useE2EBypass();
  return (
    <ClerkProvider publishableKey={clerkPubKey} localization={esES} {...pageProps}>
      <MaybeTokenProvider skip={e2e}>
        <Head>
          <title>Margn Admin</title>
        </Head>
        <style jsx global>{`
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
              Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #0f1117;
            min-height: 100vh;
            color: #94a3b8;
          }
          button {
            cursor: pointer;
          }
          a {
            color: inherit;
            text-decoration: none;
          }
        `}</style>
        <ToastProvider>
          <Component {...pageProps} />
        </ToastProvider>
      </MaybeTokenProvider>
    </ClerkProvider>
  );
}
