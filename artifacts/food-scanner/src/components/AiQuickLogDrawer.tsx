import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useParseFood,
  useCreateFood,
  useAddDiaryEntry,
  getGetDiaryQueryKey,
  getGetDiarySummaryQueryKey,
  getGetFoodHistoryQueryKey,
  type ParsedFood,
  type DiaryEntryInputMealType,
} from "@workspace/api-client-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getTodayStr } from "@/lib/date";
import { Sparkles, Loader2, Pencil } from "lucide-react";

interface AiQuickLogDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMealType?: string;
  defaultDate?: string;
  onLogged?: () => void;
}

type EditableResult = {
  foodName: string;
  quantity: number;
  unit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

function NutritionField({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-sm font-bold text-muted-foreground w-20 shrink-0">{label}</label>
      <div className="flex items-center gap-1.5 flex-1">
        <Input
          type="number"
          min={0}
          step={0.1}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="h-9 text-right font-mono font-bold border-2 border-input focus:border-primary"
        />
        {unit && <span className="text-xs font-bold text-muted-foreground w-8 shrink-0">{unit}</span>}
      </div>
    </div>
  );
}

export function AiQuickLogDrawer({
  open,
  onOpenChange,
  defaultMealType,
  defaultDate,
  onLogged,
}: AiQuickLogDrawerProps) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<EditableResult | null>(null);
  const [mealType, setMealType] = useState<DiaryEntryInputMealType>(
    (defaultMealType as DiaryEntryInputMealType) || "breakfast"
  );
  const [date, setDate] = useState(defaultDate || getTodayStr());

  const parseFood = useParseFood();
  const createFood = useCreateFood();
  const addEntry = useAddDiaryEntry();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Sync defaults when props change
  useEffect(() => {
    if (open) {
      setMealType((defaultMealType as DiaryEntryInputMealType) || "breakfast");
      setDate(defaultDate || getTodayStr());
    }
  }, [open, defaultMealType, defaultDate]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResult(null);
    }
  }, [open]);

  const handleParse = () => {
    if (!query.trim()) return;
    parseFood.mutate(
      { data: { query: query.trim() } },
      {
        onSuccess: (data: ParsedFood) => {
          queryClient.invalidateQueries({ queryKey: getGetFoodHistoryQueryKey() });
          setResult({
            foodName: data.foodName,
            quantity: data.quantity,
            unit: data.unit,
            calories: data.calories,
            proteinG: data.proteinG,
            carbsG: data.carbsG,
            fatG: data.fatG,
          });
        },
        onError: (err: Error) => {
          toast({
            title: "Couldn't parse food",
            description: err?.message || "Check your Gemini API key or try rephrasing.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleLog = async () => {
    if (!result) return;
    try {
      const food = await createFood.mutateAsync({
        data: {
          name: result.foodName,
          servingSize: `${result.quantity} ${result.unit}`,
          kcalPerServing: result.calories,
          proteinPerServing: result.proteinG,
          carbsPerServing: result.carbsG,
          fatPerServing: result.fatG,
        },
      });

      await addEntry.mutateAsync({
        data: { foodId: food.id, date, mealType, servings: 1 },
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetDiaryQueryKey({ date }) }),
        queryClient.invalidateQueries({ queryKey: getGetDiarySummaryQueryKey({ date }) }),
      ]);

      toast({
        title: `Logged "${result.foodName}"`,
        description: `${result.calories} kcal added to ${mealType}.`,
      });

      onLogged?.();
      onOpenChange(false);
    } catch {
      toast({ title: "Failed to log food", variant: "destructive" });
    }
  };

  const isLogging = createFood.isPending || addEntry.isPending;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        {/* ── Step 1: Describe the food ── */}
        {!result && (
          <>
            <DrawerHeader className="border-b-2 border-foreground pb-4 mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <DrawerTitle className="text-xl font-bold">AI Quick Log</DrawerTitle>
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">
                    Describe any food — AI estimates the nutrition
                  </p>
                </div>
              </div>
            </DrawerHeader>

            <div className="px-4 pb-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                  Describe Food or Meal
                </label>
                <Input
                  autoFocus
                  className="h-14 text-base border-2 border-foreground rounded-2xl shadow-[4px_4px_0_0_hsl(var(--foreground))] font-medium"
                  placeholder='e.g. "4 oz hamburger patty" or "1 medium apple"'
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleParse()}
                  disabled={parseFood.isPending}
                />
                <p className="text-xs text-muted-foreground px-1">
                  Tip: include quantity and preparation for best results — "grilled 6oz salmon" or "2 scrambled eggs with butter"
                </p>
              </div>

              <Button
                className="w-full h-14 text-base font-bold shadow-[4px_4px_0_0_hsl(var(--foreground))] gap-2"
                onClick={handleParse}
                disabled={!query.trim() || parseFood.isPending}
              >
                {parseFood.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Estimating nutrition…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Estimate Nutrition
                  </>
                )}
              </Button>

              <div className="flex items-center gap-3 pt-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">powered by Gemini</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="bg-muted/40 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Examples</p>
                {[
                  "4 oz grilled hamburger patty",
                  "1 medium banana",
                  "2 scrambled eggs with butter",
                  "1 cup cooked white rice",
                  "6 oz baked salmon fillet",
                ].map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setQuery(ex)}
                    className="w-full text-left text-sm font-medium text-foreground hover:text-primary transition-colors py-1 border-b border-border/50 last:border-0"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Step 2: Review & adjust ── */}
        {result && (
          <>
            <DrawerHeader className="border-b-2 border-foreground pb-4 mb-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setResult(null)}
                  className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-accent transition-colors shrink-0 text-muted-foreground"
                >
                  ←
                </button>
                <div className="flex-1 min-w-0">
                  <DrawerTitle className="text-xl font-bold truncate">{result.foodName}</DrawerTitle>
                  <p className="text-xs text-muted-foreground font-medium">
                    {result.quantity} {result.unit} · Review and adjust before logging
                  </p>
                </div>
                <Pencil className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </DrawerHeader>

            <div className="px-4 pb-4 overflow-y-auto space-y-5">
              {/* Food name editable */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Food Name</label>
                <Input
                  value={result.foodName}
                  onChange={(e) => setResult((r) => r && { ...r, foodName: e.target.value })}
                  className="border-2 border-input font-bold"
                />
              </div>

              {/* Serving size (quantity + unit) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Quantity</label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={result.quantity}
                    onChange={(e) => setResult((r) => r && { ...r, quantity: parseFloat(e.target.value) || 0 })}
                    className="border-2 border-input font-mono font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Unit</label>
                  <Input
                    value={result.unit}
                    onChange={(e) => setResult((r) => r && { ...r, unit: e.target.value })}
                    className="border-2 border-input font-medium"
                  />
                </div>
              </div>

              {/* Nutrition values */}
              <div className="bg-card border-2 border-foreground rounded-2xl p-4 space-y-3 shadow-[3px_3px_0_0_hsl(var(--foreground))]">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground border-b border-border pb-2">
                  Nutrition (for this serving)
                </p>
                <NutritionField
                  label="Calories"
                  value={result.calories}
                  onChange={(v) => setResult((r) => r && { ...r, calories: v })}
                  unit="kcal"
                />
                <NutritionField
                  label="Protein"
                  value={result.proteinG}
                  onChange={(v) => setResult((r) => r && { ...r, proteinG: v })}
                  unit="g"
                />
                <NutritionField
                  label="Carbs"
                  value={result.carbsG}
                  onChange={(v) => setResult((r) => r && { ...r, carbsG: v })}
                  unit="g"
                />
                <NutritionField
                  label="Fat"
                  value={result.fatG}
                  onChange={(v) => setResult((r) => r && { ...r, fatG: v })}
                  unit="g"
                />
              </div>

              {/* Meal + Date */}
              <div className="space-y-3 bg-muted/30 p-4 rounded-2xl border border-border">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold">Log to Meal</label>
                  <select
                    className="h-10 px-3 border-2 border-input bg-background rounded-xl text-sm font-medium focus:outline-none focus:border-primary"
                    value={mealType}
                    onChange={(e) => setMealType(e.target.value as DiaryEntryInputMealType)}
                  >
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                    <option value="snack">Snack</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold">Date</label>
                  <Input
                    type="date"
                    className="w-auto h-10 py-1"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Sticky log bar */}
            <div className="px-4 pb-6 pt-3 border-t-2 border-foreground bg-card">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground font-medium">
                  This food will be saved for future search
                </span>
                <span className="font-mono font-black text-xl">
                  {Math.round(result.calories)}{" "}
                  <span className="text-xs font-bold text-muted-foreground">kcal</span>
                </span>
              </div>
              <Button
                className="w-full h-14 text-base font-bold shadow-[4px_4px_0_0_hsl(var(--foreground))] gap-2"
                onClick={handleLog}
                disabled={isLogging || !result.foodName.trim()}
              >
                {isLogging ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  `Log to ${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`
                )}
              </Button>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
