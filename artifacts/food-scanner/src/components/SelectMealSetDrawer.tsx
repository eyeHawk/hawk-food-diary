import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMealSets,
  useAddDiaryEntry,
  getListMealSetsQueryKey,
  getGetDiaryQueryKey,
  getGetDiarySummaryQueryKey,
  type MealSetLogInputMealType,
  type MealSet,
} from "@workspace/api-client-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Utensils, ChevronLeft, Minus, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectMealSetDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mealType: MealSetLogInputMealType;
  date: string;
  initialPresetId?: number;
}

type TweakItem = {
  id: number;
  food: MealSet["items"][number]["food"];
  servings: number;
  included: boolean;
};

function getSuggestedCategory(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 20) return "dinner";
  return "snack";
}

const CATEGORY_PILL: Record<string, string> = {
  breakfast: "bg-amber-100 text-amber-700 border-amber-200",
  lunch:     "bg-emerald-100 text-emerald-700 border-emerald-200",
  dinner:    "bg-blue-100 text-blue-700 border-blue-200",
  snack:     "bg-purple-100 text-purple-700 border-purple-200",
};

export function SelectMealSetDrawer({
  open,
  onOpenChange,
  mealType,
  date,
  initialPresetId,
}: SelectMealSetDrawerProps) {
  const { data: sets, isLoading } = useListMealSets({
    query: { queryKey: getListMealSetsQueryKey() },
  });

  const [selectedSet, setSelectedSet] = useState<MealSet | null>(null);
  const [tweakItems, setTweakItems] = useState<TweakItem[]>([]);
  const [isLogging, setIsLogging] = useState(false);

  const addEntry = useAddDiaryEntry();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const suggestedCategory = getSuggestedCategory();

  // Pre-select a preset if provided
  useEffect(() => {
    if (open && initialPresetId && sets) {
      const preset = sets.find((s) => s.id === initialPresetId);
      if (preset) openTweak(preset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPresetId, sets]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSelectedSet(null);
      setTweakItems([]);
      setIsLogging(false);
    }
  }, [open]);

  const openTweak = (set: MealSet) => {
    setSelectedSet(set);
    setTweakItems(
      set.items.map((item) => ({
        id: item.id,
        food: item.food,
        servings: item.servings,
        included: true,
      }))
    );
  };

  const toggleItem = (id: number) =>
    setTweakItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, included: !i.included } : i))
    );

  const adjustServings = (id: number, delta: number) =>
    setTweakItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, servings: Math.max(0.25, parseFloat((i.servings + delta).toFixed(2))) }
          : i
      )
    );

  const handleLog = async () => {
    if (!selectedSet) return;
    const toLog = tweakItems.filter((i) => i.included);
    if (toLog.length === 0) return;

    setIsLogging(true);
    try {
      await Promise.all(
        toLog.map((item) =>
          addEntry.mutateAsync({
            data: { foodId: item.food.id, date, mealType, servings: item.servings },
          })
        )
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetDiaryQueryKey({ date }) }),
        queryClient.invalidateQueries({ queryKey: getGetDiarySummaryQueryKey({ date }) }),
      ]);
      toast({
        title: `Logged "${selectedSet.name}"`,
        description: `${toLog.length} item${toLog.length > 1 ? "s" : ""} added to ${mealType}.`,
      });
      onOpenChange(false);
    } catch {
      toast({ title: "Failed to log preset", variant: "destructive" });
    } finally {
      setIsLogging(false);
    }
  };

  // Sort: time-matched category first
  const sortedSets = sets
    ? [...sets].sort((a, b) => {
        const aMatch = a.category === suggestedCategory ? -1 : 0;
        const bMatch = b.category === suggestedCategory ? -1 : 0;
        return aMatch - bMatch;
      })
    : [];

  const includedCount = tweakItems.filter((i) => i.included).length;
  const totalKcal = tweakItems
    .filter((i) => i.included)
    .reduce((acc, i) => acc + Math.round((i.food.kcalPerServing || 0) * i.servings), 0);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88vh]">
        {/* ── Step 1: Pick a preset ── */}
        {!selectedSet && (
          <>
            <DrawerHeader className="border-b-2 border-foreground pb-4 mb-1">
              <DrawerTitle className="text-xl font-bold capitalize">
                Log a Preset to {mealType}
              </DrawerTitle>
              {suggestedCategory && (
                <p className="text-xs text-muted-foreground font-medium mt-1">
                  Suggested for this time of day ↓
                </p>
              )}
            </DrawerHeader>

            <div className="px-4 pb-6 overflow-y-auto space-y-2 pt-2">
              {isLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>
              ) : sortedSets.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                    <Utensils className="w-8 h-8" />
                  </div>
                  <p className="text-sm font-medium">No presets yet.</p>
                  <p className="text-xs text-muted-foreground max-w-[220px]">
                    Go to the Presets tab to create your first saved meal.
                  </p>
                </div>
              ) : (
                sortedSets.map((set) => {
                  const kcal = set.items.reduce(
                    (acc, i) => acc + Math.round((i.food.kcalPerServing || 0) * i.servings),
                    0
                  );
                  const isMatch = set.category === suggestedCategory;
                  return (
                    <button
                      key={set.id}
                      onClick={() => openTweak(set)}
                      className={cn(
                        "w-full flex items-center justify-between p-4 rounded-xl transition-all text-left group",
                        "border-2 hover:border-primary hover:bg-primary/5",
                        isMatch ? "border-primary/40 bg-primary/5" : "border-input bg-card"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-base group-hover:text-primary">
                            {set.name}
                          </span>
                          {set.category && (
                            <span
                              className={cn(
                                "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border",
                                CATEGORY_PILL[set.category] ?? "bg-muted text-muted-foreground border-border"
                              )}
                            >
                              {set.category}
                            </span>
                          )}
                          {isMatch && (
                            <span className="text-[10px] font-bold text-primary">✦ Suggested</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 truncate">
                          {set.items.map((i) => i.food.name).join(", ")}
                        </div>
                      </div>
                      <div className="ml-4 shrink-0 text-right">
                        <div className="font-mono font-bold text-lg">{kcal}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">kcal</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* ── Step 2: Tweak items ── */}
        {selectedSet && (
          <>
            <DrawerHeader className="border-b-2 border-foreground pb-4 mb-1">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setSelectedSet(null); setTweakItems([]); }}
                  className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-accent transition-colors shrink-0"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <DrawerTitle className="text-xl font-bold truncate">{selectedSet.name}</DrawerTitle>
                  <p className="text-xs text-muted-foreground font-medium">
                    Adjust quantities or skip items before logging
                  </p>
                </div>
              </div>
            </DrawerHeader>

            <div className="px-4 overflow-y-auto pb-4 space-y-2 pt-2">
              {tweakItems.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  This preset has no items.
                </div>
              ) : (
                tweakItems.map((item) => {
                  const itemKcal = Math.round((item.food.kcalPerServing || 0) * item.servings);
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "p-4 rounded-xl border-2 transition-all",
                        item.included ? "border-foreground bg-card" : "border-border bg-muted/30 opacity-50"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {/* Include toggle */}
                        <button
                          onClick={() => toggleItem(item.id)}
                          className={cn(
                            "w-6 h-6 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                            item.included
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input bg-background"
                          )}
                        >
                          {item.included && <Check className="w-3.5 h-3.5" />}
                        </button>

                        {/* Food name */}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold leading-tight truncate">{item.food.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.food.servingSize || "1 serving"}
                          </p>
                        </div>

                        {/* Servings stepper */}
                        {item.included && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => adjustServings(item.id, -0.25)}
                              className="w-8 h-8 rounded-full border-2 border-input flex items-center justify-center hover:border-primary transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-mono font-bold w-8 text-center text-sm">
                              {item.servings}
                            </span>
                            <button
                              onClick={() => adjustServings(item.id, 0.25)}
                              className="w-8 h-8 rounded-full border-2 border-input flex items-center justify-center hover:border-primary transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {/* Kcal */}
                        <div className="shrink-0 text-right min-w-[48px]">
                          <div className="font-mono font-bold">{item.included ? itemKcal : "—"}</div>
                          <div className="text-[10px] text-muted-foreground uppercase">kcal</div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Sticky log bar */}
            <div className="px-4 pb-6 pt-3 border-t-2 border-foreground bg-card">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-muted-foreground">
                  {includedCount} of {tweakItems.length} items
                </span>
                <span className="font-mono font-black text-xl">
                  {totalKcal} <span className="text-xs font-bold text-muted-foreground">kcal</span>
                </span>
              </div>
              <Button
                className="w-full h-14 text-base font-bold shadow-[4px_4px_0_0_hsl(var(--foreground))]"
                onClick={handleLog}
                disabled={isLogging || includedCount === 0}
              >
                {isLogging
                  ? "Logging…"
                  : `Log ${includedCount} Item${includedCount !== 1 ? "s" : ""} to ${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`}
              </Button>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
