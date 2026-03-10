import { AppProps } from "next/app";
import Head from "next/head";
import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import { ClerkTokenProvider } from "../components/ClerkTokenProvider";

const clerkPubKey =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  "pk_test_Y2xlcmsucGxhY2Vob2xkZXIuZGV2JA";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ClerkProvider publishableKey={clerkPubKey} localization={esES} {...pageProps}>
      <ClerkTokenProvider>
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
        <Component {...pageProps} />
      </ClerkTokenProvider>
    </ClerkProvider>
  );
}
