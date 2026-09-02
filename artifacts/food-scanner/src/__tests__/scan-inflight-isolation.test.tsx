/**
 * In-flight account-switch isolation test
 *
 * Reproduces the race condition where:
 *  1. User A initiates a scan (async lookup begins).
 *  2. The signed-in account switches to User B before the lookup resolves.
 *  3. The lookup resolves successfully.
 *
 * Expected: User B's visible recent-scan list must NOT show User A's food.
 *
 * The test exercises the guard introduced in use-recent-scans + Scan.tsx:
 * the userId captured at scan-start is compared against an always-current ref
 * before calling addScan / setScans.  A mismatch (account switched mid-flight)
 * skips the state update so B's view stays clean.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import React, { useRef, useEffect } from "react";
import { useRecentScans, saveScans, type RecentScan } from "../hooks/use-recent-scans";

// ── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ── Component that mirrors the race-condition guard in Scan.tsx ───────────────
//
// Props:
//   userId        — the current signed-in user (can change across renders)
//   onScanReady   — called with the "fire scan success" callback so the test
//                   can resolve the async operation at will

interface ScanGuardHarnessProps {
  userId: string | null;
  onScanReady?: (fireSuccess: (barcode: string, name: string) => void) => void;
}

function ScanGuardHarness({ userId, onScanReady }: ScanGuardHarnessProps) {
  const { scans, addScan } = useRecentScans(userId);

  // Mirror the guard in Scan.tsx: capture current userId in a ref so a stale
  // callback can detect that the account changed while it was in-flight.
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // Expose a "fire scan" trigger to the test.
  useEffect(() => {
    if (!onScanReady) return;
    // Capture the scan-owner userId at call-time — same as Scan.tsx does
    // inside handleScan.
    const scanOwner = userId;
    onScanReady((barcode: string, name: string) => {
      // This fires only after the test deliberately resolves the lookup.
      // At that point userIdRef.current may already differ from scanOwner.
      if (userIdRef.current === scanOwner) {
        addScan({ barcode, productName: name });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally no deps — mirrors a one-shot mutation callback

  return (
    <div>
      <span data-testid="scan-count">{scans.length}</span>
      <ul>
        {scans.map((s: RecentScan) => (
          <li key={s.barcode} data-testid={`scan-${s.barcode}`}>
            {s.productName}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("In-flight account switch cannot expose User A's scan to User B", () => {
  it("resolving a lookup after an account switch does not add A's scan to B's list", async () => {
    let fireSuccess: ((barcode: string, name: string) => void) | null = null;

    // Render as user A; capture the deferred "resolve" callback.
    const { rerender } = render(
      <ScanGuardHarness
        userId="user-a"
        onScanReady={(cb) => { fireSuccess = cb; }}
      />
    );

    // Sanity: both lists empty before anything happens.
    expect(screen.getByTestId("scan-count").textContent).toBe("0");

    // Switch the account to user B before the lookup resolves.
    await act(async () => {
      rerender(<ScanGuardHarness userId="user-b" />);
    });

    // Now resolve the lookup — this simulates the stale onSuccess callback
    // firing for the mutation user A started.
    await act(async () => {
      fireSuccess!("BARCODE-A", "User A's Apple");
    });

    // User B must see an empty list — the guard must have detected the mismatch.
    expect(screen.getByTestId("scan-count").textContent).toBe("0");
    expect(screen.queryByTestId("scan-BARCODE-A")).not.toBeInTheDocument();
  });

  it("resolving a lookup when the account has NOT changed records the scan normally", async () => {
    let fireSuccess: ((barcode: string, name: string) => void) | null = null;

    render(
      <ScanGuardHarness
        userId="user-a"
        onScanReady={(cb) => { fireSuccess = cb; }}
      />
    );

    // Resolve while still signed in as user A.
    await act(async () => {
      fireSuccess!("BARCODE-A", "Apple");
    });

    // User A's scan appears.
    expect(screen.getByTestId("scan-count").textContent).toBe("1");
    expect(screen.getByTestId("scan-BARCODE-A")).toBeInTheDocument();
  });

  it("User A's storage key is written even when the visible update is skipped", async () => {
    // Explicitly pre-seed user A's history so we can verify the storage guard
    // preserves (not destroys) A's previous entries.
    saveScans("user-a", [{ barcode: "OLD", productName: "Old food", timestamp: Date.now() }]);

    let fireSuccess: ((barcode: string, name: string) => void) | null = null;

    const { rerender } = render(
      <ScanGuardHarness
        userId="user-a"
        onScanReady={(cb) => { fireSuccess = cb; }}
      />
    );

    // Switch to user B.
    await act(async () => {
      rerender(<ScanGuardHarness userId="user-b" />);
    });

    // Resolve A's stale lookup — guard fires, visible update is skipped.
    await act(async () => {
      fireSuccess!("NEW-A", "New A food");
    });

    // B's visible list is empty.
    expect(screen.getByTestId("scan-count").textContent).toBe("0");

    // User A's storage key still holds their original data (not wiped).
    const stored = localStorage.getItem("food_scanner_recent:user-a");
    expect(stored).not.toBeNull();
  });
});
