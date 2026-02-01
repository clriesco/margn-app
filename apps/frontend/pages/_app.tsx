import { AppProps } from "next/app";
import Head from "next/head";
import { AuthProvider } from "../contexts/AuthContext";
import { ThemeProvider } from "../contexts/ThemeContext";

/**
 * Custom App component with auth provider
 */
export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Head>
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <link rel="apple-touch-icon" href="/favicon.svg" />
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
            background: var(--bg-body, #0a0e27);
            min-height: 100vh;
            color: var(--text-secondary, #e2e8f0);
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
              background: var(--hover-bg, rgba(255, 255, 255, 0.05));
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

          /* Prevent horizontal scroll */
          html,
          body {
            max-width: 100%;
            overflow-x: hidden;
          }
        `}</style>
        <Component {...pageProps} />
      </ThemeProvider>
    </AuthProvider>
  );
}
