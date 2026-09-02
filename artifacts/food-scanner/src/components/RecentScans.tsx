import React from "react";
import type { Food, FoodHistoryEntry } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

interface RecentScansProps {
  scans: FoodHistoryEntry[];
  onSelect: (food: Food) => void;
  hasMore: boolean;
  isLoading: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
}

export function RecentScans({
  scans,
  onSelect,
  hasMore,
  isLoading,
  isFetchingMore,
  onLoadMore,
}: RecentScansProps) {
  if (isLoading) {
    return (
      <div className="mt-8 text-sm font-semibold text-muted-foreground">
        Loading recent scans...
      </div>
    );
  }

  if (!scans.length) return null;
  
  return (
    <div className="w-full max-w-sm mx-auto mt-8 animate-in fade-in duration-500 delay-150 fill-mode-both" data-testid="container-recent-scans">
      <h3 className="text-xs font-bold text-muted-foreground mb-4 uppercase tracking-widest pl-1">Recently Scanned</h3>
      <div className="space-y-3">
        {scans.map(scan => (
          <button
            key={scan.id}
            onClick={() => onSelect(scan.food)}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-card border border-card-border shadow-sm hover:border-ring/50 transition-all text-left group"
            data-testid={`btn-recent-${scan.id}`}
          >
            <div className="flex-1 pr-4 truncate">
              <div className="font-semibold text-foreground text-base truncate group-hover:text-primary transition-colors">
                {scan.food.name}
              </div>
              {scan.food.brand && <div className="text-sm text-muted-foreground truncate">{scan.food.brand}</div>}
            </div>
            {scan.food.kcalPerServing != null && (
              <div className="text-sm font-bold text-foreground bg-secondary px-3 py-1.5 rounded-xl whitespace-nowrap">
                {Math.round(scan.food.kcalPerServing)} <span className="text-muted-foreground font-medium ml-0.5">kcal</span>
              </div>
            )}
          </button>
        ))}
      </div>
      {hasMore && (
        <Button
          type="button"
          variant="outline"
          className="mt-4 w-full border-2 border-foreground"
          onClick={onLoadMore}
          disabled={isFetchingMore}
        >
          {isFetchingMore ? "Loading..." : "Load more"}
        </Button>
      )}
    </div>
  );
}
