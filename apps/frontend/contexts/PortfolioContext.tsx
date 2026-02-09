"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { useRouter } from "next/router";
import { usePortfolios } from "../lib/hooks/use-portfolio-data";

interface PortfolioItem {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface PortfolioContextValue {
  portfolios: PortfolioItem[];
  activePortfolioId: string | null;
  setActivePortfolioId: (id: string) => void;
  isLoading: boolean;
  error: Error | null;
  refreshPortfolios: () => void;
}

const PortfolioContext = createContext<PortfolioContextValue | undefined>(
  undefined
);

const STORAGE_KEY = "activePortfolioId";

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { portfolios: rawPortfolios, isLoading, error, mutate } = usePortfolios();
  const portfolios = rawPortfolios as PortfolioItem[];
  const [activePortfolioId, setActivePortfolioIdState] = useState<
    string | null
  >(null);
  const [initialized, setInitialized] = useState(false);

  // Resolve activePortfolioId once portfolios are loaded
  useEffect(() => {
    if (isLoading || portfolios.length === 0) return;

    // Already initialized and current ID is still valid
    if (
      initialized &&
      activePortfolioId &&
      portfolios.some((p) => p.id === activePortfolioId)
    ) {
      return;
    }

    // Priority: URL query param > localStorage > first portfolio
    const urlId = router.query.portfolioId as string | undefined;
    const storedId =
      typeof window !== "undefined"
        ? localStorage.getItem(STORAGE_KEY)
        : null;

    const candidates = [urlId, storedId].filter(Boolean) as string[];
    const validId =
      candidates.find((id) => portfolios.some((p) => p.id === id)) ??
      portfolios[0].id;

    setActivePortfolioIdState(validId);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, validId);
    }
    setInitialized(true);
  }, [portfolios, isLoading, initialized, activePortfolioId, router.query.portfolioId]);

  // If active portfolio gets deleted (no longer in list), reset
  useEffect(() => {
    if (
      initialized &&
      activePortfolioId &&
      portfolios.length > 0 &&
      !portfolios.some((p) => p.id === activePortfolioId)
    ) {
      const fallback = portfolios[0].id;
      setActivePortfolioIdState(fallback);
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, fallback);
      }
    }
  }, [portfolios, activePortfolioId, initialized]);

  const setActivePortfolioId = useCallback(
    (id: string) => {
      setActivePortfolioIdState(id);
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, id);
      }
    },
    []
  );

  const refreshPortfolios = useCallback(() => {
    mutate();
  }, [mutate]);

  const portfolioError = error ? (error instanceof Error ? error : new Error(String(error))) : null;

  const value = useMemo(
    () => ({
      portfolios,
      activePortfolioId,
      setActivePortfolioId,
      isLoading,
      error: portfolioError,
      refreshPortfolios,
    }),
    [portfolios, activePortfolioId, setActivePortfolioId, isLoading, portfolioError, refreshPortfolios]
  );

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const context = useContext(PortfolioContext);
  if (context === undefined) {
    throw new Error("usePortfolio must be used within a PortfolioProvider");
  }
  return context;
}
