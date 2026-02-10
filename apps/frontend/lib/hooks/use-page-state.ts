import { useEffect, useRef, useCallback } from 'react';

const STORAGE_PREFIX = 'margn:page-state:';
const ENVELOPE_VERSION = 1;
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEBOUNCE_MS = 500;
const IDB_NAME = 'margn-page-state';
const IDB_STORE = 'snapshots';

// When the browser fires 'popstate' (back/forward), store the destination
// pathname.  Link clicks use pushState which does NOT fire popstate.
// Using sessionStorage (not a JS variable) so the marker survives any amount
// of async delay while portfolioId resolves from context.
const NAV_MARKER_KEY = 'margn:back-nav-path';

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    try {
      sessionStorage.setItem(NAV_MARKER_KEY, window.location.pathname);
    } catch { /* ignore */ }
  });
}

// ---------------------------------------------------------------------------
// IndexedDB helpers (fallback for large payloads)
// ---------------------------------------------------------------------------

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Envelope<T> {
  v: number;
  ts: number;
  data: T;
}

interface UsePageStateOptions<T> {
  /** Unique key for this page (e.g. 'backtest', 'onboarding') */
  key: string;
  /** Optional portfolioId to scope state per portfolio */
  portfolioId?: string | null;
  /** Function that captures the current state snapshot */
  snapshot: () => T;
  /** Function that restores state from a saved snapshot */
  restore: (saved: T) => void;
  /** Dependencies that trigger a save when changed */
  deps: unknown[];
  /** Time-to-live in ms (default: 30 min) */
  ttlMs?: number;
}

interface UsePageStateReturn {
  /** Whether state was restored from sessionStorage */
  wasRestored: boolean;
  /** Manually clear the saved state */
  clear: () => void;
}

function buildKey(key: string, portfolioId?: string | null): string {
  return portfolioId
    ? `${STORAGE_PREFIX}${key}:${portfolioId}`
    : `${STORAGE_PREFIX}${key}`;
}

/**
 * Hook to persist page state across navigations.
 *
 * State is saved on every deps change (debounced), but only RESTORED when the
 * user navigates back/forward via browser history (popstate). Clicking a
 * sidebar link (pushState) always gives a fresh page.
 *
 * Small payloads use sessionStorage; large ones fall back to IndexedDB.
 *
 * SSR-safe: only accesses storage inside useEffect.
 */
export function usePageState<T>({
  key,
  portfolioId,
  snapshot,
  restore,
  deps,
  ttlMs = DEFAULT_TTL_MS,
}: UsePageStateOptions<T>): UsePageStateReturn {
  const wasRestoredRef = useRef(false);
  const storageKey = buildKey(key, portfolioId);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  // Keep snapshot/restore/ttl in refs so the effect always reads the latest
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const ttlRef = useRef(ttlMs);
  ttlRef.current = ttlMs;
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;

  // Capture the back-nav marker on first render (before effects).
  // This survives React StrictMode double-mounting, which would otherwise
  // consume the marker in the first effect run and leave none for the second.
  const backNavMarkerRef = useRef<string | null | undefined>(undefined);
  if (backNavMarkerRef.current === undefined && typeof window !== 'undefined') {
    backNavMarkerRef.current = sessionStorage.getItem(NAV_MARKER_KEY);
    sessionStorage.removeItem(NAV_MARKER_KEY);
  }

  // Restore on back/forward navigation.
  // Depends on storageKey so it re-tries when portfolioId resolves.
  useEffect(() => {
    if (wasRestoredRef.current) return;

    // If portfolioId was passed but is still null (context loading), wait.
    // storageKey will change once it resolves, re-triggering this effect.
    if (portfolioId === null) return;

    // Check if we arrived here via back/forward to THIS page
    const backNavPath = backNavMarkerRef.current ?? null;

    if (backNavPath !== window.location.pathname) return;

    // Try sessionStorage first (sync), then IndexedDB (async)
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      try {
        const envelope: Envelope<T> = JSON.parse(raw);
        if (envelope.v === ENVELOPE_VERSION && Date.now() - envelope.ts <= ttlRef.current) {
          restoreRef.current(envelope.data);
          wasRestoredRef.current = true;
          return;
        }
        sessionStorage.removeItem(storageKey);
      } catch {
        sessionStorage.removeItem(storageKey);
      }
    }

    // Async fallback: IndexedDB (for large payloads like backtest results)
    let cancelled = false;
    (async () => {
      try {
        const idbRaw = await idbGet(storageKey);
        if (cancelled || !idbRaw || wasRestoredRef.current) return;

        const envelope: Envelope<T> = JSON.parse(idbRaw);
        if (envelope.v !== ENVELOPE_VERSION) return;
        if (Date.now() - envelope.ts > ttlRef.current) {
          idbDelete(storageKey).catch(() => {});
          return;
        }

        restoreRef.current(envelope.data);
        wasRestoredRef.current = true;
      } catch {
        idbDelete(storageKey).catch(() => {});
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Debounced save when deps change
  useEffect(() => {
    // Skip the first render (mount) to avoid saving initial/default state
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const currentKey = storageKeyRef.current;
      const envelope: Envelope<T> = {
        v: ENVELOPE_VERSION,
        ts: Date.now(),
        data: snapshotRef.current(),
      };
      const json = JSON.stringify(envelope);

      // Try sessionStorage first (fast, sync)
      try {
        sessionStorage.setItem(currentKey, json);
        // Clean up any previous IDB entry for this key
        idbDelete(currentKey).catch(() => {});
        return;
      } catch {
        // QuotaExceeded — fall through to IndexedDB
      }

      // Fallback: IndexedDB (no practical size limit)
      // Remove stale sessionStorage entry so restore falls through to IDB
      sessionStorage.removeItem(currentKey);
      idbSet(currentKey, json).catch(() => {});
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const clear = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    idbDelete(storageKey).catch(() => {});
  }, [storageKey]);

  return {
    wasRestored: wasRestoredRef.current,
    clear,
  };
}
