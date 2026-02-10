import { AppProps } from "next/app";
import Head from "next/head";
import { ClerkProvider } from "@clerk/nextjs";
import { ClerkTokenProvider } from "../components/ClerkTokenProvider";
import { PortfolioProvider } from "../contexts/PortfolioContext";
import { ThemeProvider } from "../contexts/ThemeContext";

const clerkPubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Custom App component with Clerk auth provider
 */
export default function App({ Component, pageProps }: AppProps) {
  // Skip ClerkProvider during CI build (no publishableKey available)
  if (!clerkPubKey) {
    return <Component {...pageProps} />;
  }

  return (
    <ClerkProvider publishableKey={clerkPubKey} {...pageProps}>
      <ClerkTokenProvider>
      <PortfolioProvider>
      <ThemeProvider>
        <Head>
          <link rel="icon" href="/favicon.ico" />
          <link rel="apple-touch-icon" href="/favicon.ico" />
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
            background: var(--bg-body, #f8fafc);
            min-height: 100vh;
            color: var(--text-secondary, #475569);
            overflow-x: hidden;
            transition: background 0.2s, color 0.2s;
          }

          button {
            cursor: pointer;
            transition: all 0.2s ease;
          }

          button:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          }

          /* Responsive adjustments */
          @media (max-width: 768px) {
            body {
              font-size: 14px;
            }

            h1 {
              font-size: 1.5rem !important;
            }

            h2 {
              font-size: 1.25rem !important;
            }

            /* Improve touch targets */
            button {
              min-height: 44px;
              min-width: 44px;
            }

            /* Better table scrolling on mobile */
            .table-container {
              -webkit-overflow-scrolling: touch;
              scrollbar-width: thin;
            }

            .table-container::-webkit-scrollbar {
              height: 8px;
            }

            .table-container::-webkit-scrollbar-track {
              background: var(--hover-bg, rgba(0, 0, 0, 0.04));
            }

            .table-container::-webkit-scrollbar-thumb {
              background: rgba(255, 255, 255, 0.2);
              border-radius: 4px;
            }
          }

          @media (max-width: 480px) {
            body {
              font-size: 13px;
            }

            h1 {
              font-size: 1.25rem !important;
            }

            h2 {
              font-size: 1.125rem !important;
            }
          }

          /* Table row hover */
          tr.table-row-hoverable:hover {
            background: var(--bg-glass-strong) !important;
          }

          /* Custom range slider */
          .range-slider {
            -webkit-appearance: none;
            appearance: none;
            height: 6px;
            border-radius: 3px;
            outline: none;
            cursor: pointer;
          }

          .range-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: var(--accent-green);
            border: none;
            cursor: pointer;
            transition: transform 0.15s ease;
          }

          .range-slider:hover::-webkit-slider-thumb {
            transform: scale(1.15);
          }

          .range-slider:active::-webkit-slider-thumb {
            transform: scale(1.05);
          }

          .range-slider::-moz-range-thumb {
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: var(--accent-green);
            border: none;
            cursor: pointer;
          }

          .range-slider::-moz-range-track {
            height: 6px;
            border-radius: 3px;
            background: transparent;
          }

          /* Override global button hover for range inputs */
          .range-slider:hover {
            transform: none !important;
            box-shadow: none !important;
          }

          /* Prevent horizontal scroll */
          html,
          body {
            max-width: 100%;
            overflow-x: hidden;
          }
        `}</style>
        <Component {...pageProps} />
      </ThemeProvider>
      </PortfolioProvider>
      </ClerkTokenProvider>
    </ClerkProvider>
  );
}
