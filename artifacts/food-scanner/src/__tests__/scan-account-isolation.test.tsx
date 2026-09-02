/**
 * Scan page account-isolation component tests
 *
 * Verifies that switching accounts in the same browser does not expose one
 * user's recent-scan history to another user.
 *
 * Strategy:
 *  - Render the `useRecentScans` hook through a thin wrapper component.
 *  - Simulate user A scanning a barcode (write to their scoped key).
 *  - Re-render with user B's id and confirm user B sees an empty list.
 *  - Then clear user A's data and confirm it is gone without touching user B.
 *
 * The @clerk/react dependency and the lookup mutation are not needed here
 * because isolation is a pure localStorage concern; the hook under test is
 * `useRecentScans`, which we call directly via a wrapper component.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import React from "react";
import { useRecentScans, saveScans, type RecentScan } from "../hooks/use-recent-scans";

// ── Thin wrapper that exposes hook output to the DOM ──────────────────────────

function RecentScansTestHarness({ userId }: { userId: string | null }) {
  const { scans, clearScans } = useRecentScans(userId);
  return (
    <div>
      <span data-testid="scan-count">{scans.length}</span>
      <ul>
        {scans.map((s) => (
          <li key={s.barcode} data-testid={`scan-${s.barcode}`}>
            {s.productName}
          </li>
        ))}
      </ul>
      <button data-testid="clear" onClick={clearScans}>
        Clear
      </button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const exampleScan = (barcode: string, name: string): RecentScan => ({
  barcode,
  productName: name,
  kcal: 120,
  timestamp: Date.now(),
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Recent scan history is isolated per account", () => {
  it("user A sees their own scan history after signing in", () => {
    // Seed user A's history before rendering.
    saveScans("user-a", [exampleScan("111", "Apple")]);

    render(<RecentScansTestHarness userId="user-a" />);

    expect(screen.getByTestId("scan-count").textContent).toBe("1");
    expect(screen.getByTestId("scan-111")).toBeInTheDocument();
  });

  it("user B sees an empty list even when user A has scan history", () => {
    // User A already has data in localStorage.
    saveScans("user-a", [exampleScan("111", "Apple"), exampleScan("222", "Bread")]);

    // A different user signs in — should see nothing.
    render(<RecentScansTestHarness userId="user-b" />);

    expect(screen.getByTestId("scan-count").textContent).toBe("0");
    expect(screen.queryByTestId("scan-111")).not.toBeInTheDocument();
    expect(screen.queryByTestId("scan-222")).not.toBeInTheDocument();
  });

  it("switching from user A to user B resets the visible list", async () => {
    saveScans("user-a", [exampleScan("111", "Apple")]);
    saveScans("user-b", [exampleScan("333", "Cherry")]);

    const { rerender } = render(<RecentScansTestHarness userId="user-a" />);
    expect(screen.getByTestId("scan-111")).toBeInTheDocument();

    // Simulate sign-out / sign-in as user B.
    await act(async () => {
      rerender(<RecentScansTestHarness userId="user-b" />);
    });

    // User A's scan is no longer visible.
    expect(screen.queryByTestId("scan-111")).not.toBeInTheDocument();
    // User B's own scan is shown.
    expect(screen.getByTestId("scan-333")).toBeInTheDocument();
  });

  it("clearing user A's history does not affect user B", async () => {
    saveScans("user-a", [exampleScan("111", "Apple")]);
    saveScans("user-b", [exampleScan("222", "Banana")]);

    // Render as user A, clear their history.
    const { rerender } = render(<RecentScansTestHarness userId="user-a" />);
    await act(async () => {
      screen.getByTestId("clear").click();
    });
    expect(screen.getByTestId("scan-count").textContent).toBe("0");

    // Switch to user B — their data must be intact.
    await act(async () => {
      rerender(<RecentScansTestHarness userId="user-b" />);
    });
    expect(screen.getByTestId("scan-count").textContent).toBe("1");
    expect(screen.getByTestId("scan-222")).toBeInTheDocument();
  });

  it("a signed-out state (userId null) shows an empty list without touching storage", () => {
    saveScans("user-a", [exampleScan("111", "Apple")]);

    // Not yet signed in.
    render(<RecentScansTestHarness userId={null} />);

    expect(screen.getByTestId("scan-count").textContent).toBe("0");
    // User A's data must still be in storage — not wiped by the signed-out state.
    const stored = localStorage.getItem("food_scanner_recent:user-a");
    expect(stored).not.toBeNull();
  });
});
