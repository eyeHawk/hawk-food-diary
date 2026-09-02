import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  userId: "user-a",
  lastLimit: 0,
}));

const foodsByUser = {
  "user-a": {
    id: 11,
    foodId: 101,
    scannedAt: "2026-09-01T10:00:00Z",
    food: { id: 101, name: "AI Parsed Oatmeal", kcalPerServing: 180 },
  },
  "user-b": {
    id: 22,
    foodId: 202,
    scannedAt: "2026-09-02T10:00:00Z",
    food: { id: 202, name: "User B Yogurt", kcalPerServing: 120 },
  },
} as const;

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: { id: testState.userId } }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetFoodHistoryQueryKey: (params?: unknown) => ["/api/foods/history", params],
  useGetFoodHistory: (params: { limit: number }) => {
    testState.lastLimit = params.limit;
    return {
      data: {
        items: [foodsByUser[testState.userId as keyof typeof foodsByUser]],
        pagination: { limit: params.limit, offset: 0, hasMore: params.limit < 20 },
      },
      isLoading: false,
      isFetching: false,
    };
  },
  useLookupFood: () => ({ mutate: vi.fn() }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/scan", vi.fn()],
}));

vi.mock("@/components/Scanner", () => ({
  Scanner: () => <div data-testid="scanner" />,
}));

vi.mock("@/components/FoodDetailDrawer", () => ({
  FoodDetailDrawer: ({ food, open }: { food: { name: string } | null; open: boolean }) =>
    open && food ? <div data-testid="food-drawer">{food.name}</div> : null,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const { default: Scan } = await import("../pages/Scan");

describe("server-backed scan history", () => {
  beforeEach(() => {
    localStorage.clear();
    testState.userId = "user-a";
    testState.lastLimit = 0;
  });

  afterEach(cleanup);

  it("shows persisted history after reload and never uses another account's local history", () => {
    localStorage.setItem(
      "food_scanner_recent:user-b",
      JSON.stringify([{ barcode: "LOCAL-B", productName: "Leaked Local Food", timestamp: 1 }]),
    );

    const { rerender } = render(<Scan />);

    expect(screen.getByText("AI Parsed Oatmeal")).toBeInTheDocument();
    expect(screen.queryByText("Leaked Local Food")).not.toBeInTheDocument();

    testState.userId = "user-b";
    rerender(<Scan />);

    expect(screen.getByText("User B Yogurt")).toBeInTheDocument();
    expect(screen.queryByText("AI Parsed Oatmeal")).not.toBeInTheDocument();
  });

  it("opens an AI-parsed history item without requiring a barcode", () => {
    render(<Scan />);

    fireEvent.click(screen.getByTestId("btn-recent-11"));

    expect(screen.getByTestId("food-drawer")).toHaveTextContent("AI Parsed Oatmeal");
  });

  it("loads additional persisted history pages", () => {
    render(<Scan />);

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(testState.lastLimit).toBe(20);
  });
});