import React, { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { Scanner } from "@/components/Scanner";
import { RecentScans } from "@/components/RecentScans";
import { FoodDetailDrawer } from "@/components/FoodDetailDrawer";
import {
  getGetFoodHistoryQueryKey,
  useGetFoodHistory,
  useLookupFood,
  type Food,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const HISTORY_PAGE_SIZE = 10;
const MAX_HISTORY_ITEMS = 100;

export default function Scan() {
  const searchParams = new URLSearchParams(window.location.search);
  const defaultMealType = searchParams.get("mealType") || undefined;
  const defaultDate = searchParams.get("date") || undefined;

  const [scannedFood, setScannedFood] = useState<Food | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Scope recent scans to the authenticated user so one account's history
  // cannot be seen by a different account in the same browser.
  const { user } = useUser();
  const userId = user?.id ?? null;

  // Always-current ref used to detect mid-flight account switches.
  // If the userId changes after a scan starts but before the lookup resolves,
  // we must not let the stale callback update the new user's visible list.
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
    setHistoryLimit(HISTORY_PAGE_SIZE);
  }, [userId]);

  const historyParams = { limit: historyLimit, offset: 0 };
  const history = useGetFoodHistory(historyParams, {
    query: {
      enabled: Boolean(userId),
      // Include the owner in the cache key so an account switch cannot reuse
      // another user's response before the global auth cache clear runs.
      queryKey: [...getGetFoodHistoryQueryKey(historyParams), userId],
    },
  });

  const lookupFood = useLookupFood();
  const { toast } = useToast();

  const handleScan = useCallback((text: string) => {
    if (isProcessing || isDrawerOpen) return;
    setIsProcessing(true);

    // Capture the owner of this scan at call time.  If the signed-in account
    // changes while the async lookup is in-flight, we compare against this
    // value before touching state so we never surface A's scan in B's list.
    const scanOwner = userId;

    lookupFood.mutate({ data: { barcode: text } }, {
      onSuccess: (food) => {
        queryClient.invalidateQueries({ queryKey: getGetFoodHistoryQueryKey() });
        if (userIdRef.current !== scanOwner) {
          setIsProcessing(false);
          return;
        }
        setScannedFood(food);
        setIsDrawerOpen(true);
        setIsProcessing(false);
      },
      onError: () => {
        toast({ title: "Barcode not found", description: "This food might not be in our database.", variant: "destructive" });
        setIsProcessing(false);
      }
    });
  }, [lookupFood, toast, isProcessing, isDrawerOpen, queryClient, userId]);

  const handleRecentSelect = useCallback((food: Food) => {
    setScannedFood(food);
    setIsDrawerOpen(true);
  }, []);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-full">
      <header className="py-4 mb-4">
        <h1 className="text-2xl font-black uppercase tracking-tight">Scan Barcode</h1>
        <p className="text-sm text-muted-foreground font-medium">Position the barcode inside the frame</p>
      </header>

      <div className="flex-1 flex flex-col items-center overflow-y-auto">
        <div className="w-full relative">
          <Scanner onScan={handleScan} />
          {isProcessing && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center border-2 border-foreground z-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
              <div className="font-bold text-sm">Looking up food...</div>
            </div>
          )}
        </div>

        <div className="mt-8 w-full max-w-sm flex flex-col gap-4 text-center">
          <div className="text-sm font-bold text-muted-foreground">OR</div>
          <Button variant="outline" className="w-full border-2 border-foreground" onClick={() => setLocation(`/search?mealType=${defaultMealType || ''}&date=${defaultDate || ''}`)}>
            Search Manually
          </Button>
        </div>

        <RecentScans
          scans={history.data?.items ?? []}
          onSelect={handleRecentSelect}
          hasMore={Boolean(history.data?.pagination.hasMore) && historyLimit < MAX_HISTORY_ITEMS}
          isLoading={Boolean(userId) && history.isLoading}
          isFetchingMore={history.isFetching && !history.isLoading}
          onLoadMore={() => {
            setHistoryLimit((current) =>
              Math.min(current + HISTORY_PAGE_SIZE, MAX_HISTORY_ITEMS)
            );
          }}
        />
      </div>

      <FoodDetailDrawer
        food={scannedFood}
        open={isDrawerOpen}
        onOpenChange={(open) => {
          setIsDrawerOpen(open);
          if (!open) {
            // Slight delay before allowing new scans to prevent accidental double-scans
            setTimeout(() => setScannedFood(null), 500);
          }
        }}
        defaultMealType={defaultMealType}
        defaultDate={defaultDate}
      />
    </div>
  );
}
