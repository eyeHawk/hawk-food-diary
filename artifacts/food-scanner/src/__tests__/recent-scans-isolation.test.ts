/**
 * Recent-scan account isolation tests
 *
 * Verifies that per-user localStorage scoping prevents one account's scan
 * history from leaking to another account in the same browser session.
 *
 * These tests exercise the pure storage helpers (loadScans / saveScans /
 * removeScans / userScopedKey) directly — no React rendering needed — so they
 * run quickly in a jsdom environment without Clerk or network dependencies.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  loadScans,
  saveScans,
  removeScans,
  userScopedKey,
  type RecentScan,
} from "../hooks/use-recent-scans";

// ── Helpers ───────────────────────────────────────────────────────────────────

const scan = (barcode: string, productName: string): RecentScan => ({
  barcode,
  productName,
  kcal: 100,
  timestamp: Date.now(),
});

beforeEach(() => {
  localStorage.clear();
});

// ── Storage key shape ─────────────────────────────────────────────────────────

describe("userScopedKey", () => {
  it("embeds the userId so keys are unique per account", () => {
    expect(userScopedKey("user-a")).toBe("food_scanner_recent:user-a");
    expect(userScopedKey("user-b")).toBe("food_scanner_recent:user-b");
    expect(userScopedKey("user-a")).not.toBe(userScopedKey("user-b"));
  });
});

// ── Cross-account isolation ───────────────────────────────────────────────────

describe("Account A's scan history is invisible to Account B", () => {
  it("each account reads only its own scans", () => {
    const scanA = scan("111", "Apple");
    const scanB = scan("222", "Banana");

    saveScans("user-a", [scanA]);
    saveScans("user-b", [scanB]);

    const scansForA = loadScans("user-a");
    const scansForB = loadScans("user-b");

    // User A sees only their own scan.
    expect(scansForA).toHaveLength(1);
    expect(scansForA[0].barcode).toBe("111");
    expect(scansForA.some((s) => s.barcode === "222")).toBe(false);

    // User B sees only their own scan.
    expect(scansForB).toHaveLength(1);
    expect(scansForB[0].barcode).toBe("222");
    expect(scansForB.some((s) => s.barcode === "111")).toBe(false);
  });

  it("clearing one account's history does not affect the other account", () => {
    saveScans("user-a", [scan("111", "Apple")]);
    saveScans("user-b", [scan("222", "Banana")]);

    // User A signs out / clears history.
    removeScans("user-a");

    expect(loadScans("user-a")).toHaveLength(0);
    // User B's data is untouched.
    expect(loadScans("user-b")).toHaveLength(1);
    expect(loadScans("user-b")[0].barcode).toBe("222");
  });

  it("a new account has an empty scan list even when another account has data", () => {
    saveScans("user-a", [scan("111", "Apple"), scan("333", "Cherry")]);

    // Brand-new account — nothing saved yet.
    expect(loadScans("user-c")).toHaveLength(0);
  });
});

// ── Legacy unscoped key migration ─────────────────────────────────────────────

describe("Legacy unscoped key is removed on first load", () => {
  it("loadScans removes the old food_scanner_recent key", () => {
    // Simulate data left by the pre-isolation version of the app.
    localStorage.setItem(
      "food_scanner_recent",
      JSON.stringify([scan("OLD", "Old Product")])
    );

    loadScans("user-a"); // triggers migration

    // The unscoped key must be gone so another account cannot read it.
    expect(localStorage.getItem("food_scanner_recent")).toBeNull();
  });

  it("after migration the signing-in user starts with an empty list (no inherited legacy data)", () => {
    localStorage.setItem(
      "food_scanner_recent",
      JSON.stringify([scan("OLD", "Old Product")])
    );

    // user-a signs in — migration runs, legacy data is NOT promoted to their
    // scoped key, so they start fresh.
    const scans = loadScans("user-a");
    expect(scans).toHaveLength(0);
  });
});

// ── Basic round-trip ─────────────────────────────────────────────────────────

describe("saveScans / loadScans round-trip", () => {
  it("stores and retrieves multiple scans for the same user", () => {
    const items = [scan("A1", "Apple"), scan("B2", "Bread"), scan("C3", "Chicken")];
    saveScans("user-a", items);
    const loaded = loadScans("user-a");
    expect(loaded).toHaveLength(3);
    expect(loaded.map((s) => s.barcode)).toEqual(["A1", "B2", "C3"]);
  });

  it("returns an empty array when nothing has been saved for that user", () => {
    expect(loadScans("never-saved-user")).toEqual([]);
  });
});

// ── Owner-tagged state derivation (pure logic) ────────────────────────────────
// The hook stores scans as { owner, data } so the visible list can be derived
// synchronously without waiting for a useEffect to flush.

describe("Owner-tagged state prevents transient cross-account render", () => {
  it("scans are empty when owner tag differs from current userId", () => {
    const stateFromPreviousUser = {
      owner: "user-a",
      data: [scan("111", "Apple")] as RecentScan[],
    };
    const currentUserId = "user-b";

    // This is the synchronous derivation used inside useRecentScans:
    const visibleScans =
      stateFromPreviousUser.owner === currentUserId
        ? stateFromPreviousUser.data
        : [];

    // Even before any effect runs, the derivation immediately returns [].
    expect(visibleScans).toHaveLength(0);
  });

  it("scans are shown when owner tag matches current userId", () => {
    const state = {
      owner: "user-a",
      data: [scan("111", "Apple")] as RecentScan[],
    };
    const currentUserId = "user-a";

    const visibleScans =
      state.owner === currentUserId ? state.data : [];

    expect(visibleScans).toHaveLength(1);
    expect(visibleScans[0].barcode).toBe("111");
  });
});
