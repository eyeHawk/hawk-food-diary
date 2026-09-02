import { useState, useEffect } from "react";

export interface RecentScan {
  barcode: string;
  productName: string;
  brand?: string;
  kcal?: number;
  timestamp: number;
}

// ── Storage key helpers ───────────────────────────────────────────────────────
// Keys are scoped per-user so one account's scan history is never readable by
// another account in the same browser.

/** Key used before user-scoping was introduced — removed on first sign-in. */
const LEGACY_KEY = "food_scanner_recent";

export function userScopedKey(userId: string): string {
  return `food_scanner_recent:${userId}`;
}

/** Load scans for a specific user, migrating away from the legacy unscoped key. */
export function loadScans(userId: string): RecentScan[] {
  // Remove the unscoped legacy key so it cannot be read by a different account.
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
  try {
    const raw = localStorage.getItem(userScopedKey(userId));
    return raw ? (JSON.parse(raw) as RecentScan[]) : [];
  } catch {
    return [];
  }
}

/** Persist scans for a specific user. */
export function saveScans(userId: string, scans: RecentScan[]): void {
  try {
    localStorage.setItem(userScopedKey(userId), JSON.stringify(scans));
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Remove all scans for a specific user. */
export function removeScans(userId: string): void {
  try {
    localStorage.removeItem(userScopedKey(userId));
  } catch {
    /* storage unavailable — ignore */
  }
}

// ── Owner-tagged state ────────────────────────────────────────────────────────
// Scans are stored in state as { owner, data }.  The visible list is derived
// synchronously during every render: if `owner !== userId` (i.e., the state
// belongs to a previous account), an empty array is returned immediately —
// without waiting for a useEffect to flush — so there is no transient frame
// where Account A's history is shown to Account B.

interface ScanState {
  owner: string | null;
  data: RecentScan[];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Manages the recent-scan list for the currently signed-in user.
 *
 * Pass the Clerk `userId` (from `useUser()`).  The hook:
 *  - Returns an empty list synchronously whenever `userId` changes, even before
 *    localStorage has been read for the new user.  This prevents any frame
 *    where one account's history is visible under another account.
 *  - Reloads from the user-scoped key after the render (via `useEffect`).
 *  - Clears the legacy unscoped `food_scanner_recent` key on first load.
 *
 * Passing `null` or `undefined` disables reads/writes and resets to empty.
 */
export function useRecentScans(userId: string | null | undefined) {
  // Tag each loaded list with the owner it belongs to.
  // If the current userId doesn't match the owner, the visible list is
  // derived as [] synchronously during render — no effect flush required.
  const normalizedId = userId ?? null;
  const [state, setState] = useState<ScanState>({
    owner: normalizedId,
    data: [],
  });

  // Load from the user-scoped localStorage key whenever the account changes.
  useEffect(() => {
    if (!normalizedId) {
      setState({ owner: null, data: [] });
      return;
    }
    setState({ owner: normalizedId, data: loadScans(normalizedId) });
  }, [normalizedId]);

  // Synchronous derivation: if the stored owner differs from the current user,
  // return empty immediately so A's history is never rendered for B.
  const scans: RecentScan[] =
    state.owner === normalizedId ? state.data : [];

  const addScan = (scan: Omit<RecentScan, "timestamp">) => {
    if (!normalizedId) return;
    setState((prev) => {
      const prevData = prev.owner === normalizedId ? prev.data : [];
      const next = [
        { ...scan, timestamp: Date.now() },
        ...prevData.filter((p) => p.barcode !== scan.barcode),
      ].slice(0, 5);
      saveScans(normalizedId, next);
      return { owner: normalizedId, data: next };
    });
  };

  const clearScans = () => {
    if (!normalizedId) return;
    setState({ owner: normalizedId, data: [] });
    removeScans(normalizedId);
  };

  return { scans, addScan, clearScans };
}
