import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDiary,
  useGetDiarySummary,
  useDeleteDiaryEntry,
  useListMealSets,
  useCreateMealSet,
  useAddMealSetItem,
  getGetDiaryQueryKey,
  getGetDiarySummaryQueryKey,
  getListMealSetsQueryKey,
  type DiaryEntryInputMealType,
  type DiaryEntry,
} from "@workspace/api-client-react";
import { getTodayStr, formatRelativeDate, addDaysToStr } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Plus, Zap, Trash2, BookmarkPlus, X } from "lucide-react";
import { SelectMealSetDrawer } from "@/components/SelectMealSetDrawer";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function getSuggestedCategory(): DiaryEntryInputMealType {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 20) return "dinner";
  return "snack";
}

const CATEGORY_PILL: Record<string, string> = {
  breakfast: "bg-amber-100 text-amber-700 border-amber-200",
  lunch: "bg-emerald-100 text-emerald-700 border-emerald-200",
  dinner: "bg-blue-100 text-blue-700 border-blue-200",
  snack: "bg-purple-100 text-purple-700 border-purple-200",
};

export default function Home() {
  const [date, setDate] = useState(() => getTodayStr());
  const [quickLogPresetId, setQuickLogPresetId] = useState<number | undefined>();
  const [quickLogMeal, setQuickLogMeal] = useState<DiaryEntryInputMealType>("breakfast");
  const [isQuickLogOpen, setIsQuickLogOpen] = useState(false);

  const { data: diary } = useGetDiary({ date }, { query: { queryKey: getGetDiaryQueryKey({ date }) } });
  const { data: summary } = useGetDiarySummary({ date }, { query: { queryKey: getGetDiarySummaryQueryKey({ date }) } });
  const { data: allSets } = useListMealSets({ query: { queryKey: getListMealSetsQueryKey() } });

  const suggestedCategory = getSuggestedCategory();

  // Presets to show in the quick strip: matched category first, then others, max 8
  const quickPresets = allSets
    ? [...allSets]
        .sort((a, b) => {
          const aM = a.category === suggestedCategory ? -1 : 0;
          const bM = b.category === suggestedCategory ? -1 : 0;
          return aM - bM;
        })
        .slice(0, 8)
    : [];

  const handleQuickLog = (presetId: number, meal: DiaryEntryInputMealType) => {
    setQuickLogPresetId(presetId);
    setQuickLogMeal(meal);
    setIsQuickLogOpen(true);
  };

  const handlePrevDay = () => setDate((d) => addDaysToStr(d, -1));
  const handleNextDay = () => setDate((d) => addDaysToStr(d, 1));

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Date Header */}
      <header className="flex items-center justify-between py-4 mb-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={handlePrevDay}
          className="h-10 w-10 rounded-full border-2 border-transparent hover:border-border"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex flex-col items-center">
          <h1 className="text-xl font-bold tracking-tight">{formatRelativeDate(date)}</h1>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">{date}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleNextDay}
          className="h-10 w-10 rounded-full border-2 border-transparent hover:border-border"
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </header>

      {/* Quick Presets Strip */}
      {quickPresets.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2 px-0.5">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Quick Log
            </h2>
            <Link href="/meal-sets" className="text-xs font-bold text-primary hover:underline">
              Manage
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
            {quickPresets.map((preset) => {
              const kcal = preset.items.reduce(
                (acc, i) => acc + Math.round((i.food.kcalPerServing || 0) * i.servings),
                0
              );
              const isMatch = preset.category === suggestedCategory;
              return (
                <div
                  key={preset.id}
                  className={cn(
                    "shrink-0 snap-start w-40 rounded-2xl border-2 p-3 flex flex-col gap-2 transition-all",
                    isMatch
                      ? "border-primary bg-primary/5 shadow-[2px_2px_0_0_hsl(var(--primary))]"
                      : "border-foreground bg-card shadow-[2px_2px_0_0_hsl(var(--foreground))]"
                  )}
                >
                  <div className="flex-1">
                    {preset.category && (
                      <span
                        className={cn(
                          "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border inline-block mb-1",
                          CATEGORY_PILL[preset.category] ?? "bg-muted text-muted-foreground border-border"
                        )}
                      >
                        {preset.category}
                      </span>
                    )}
                    <p className="font-bold text-sm leading-tight line-clamp-2">{preset.name}</p>
                    <p className="font-mono font-black text-base mt-1">
                      {kcal}
                      <span className="text-[9px] font-bold text-muted-foreground ml-0.5">kcal</span>
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      handleQuickLog(
                        preset.id,
                        (preset.category as DiaryEntryInputMealType) || suggestedCategory
                      )
                    }
                    className={cn(
                      "w-full py-1.5 text-xs font-bold rounded-lg border-2 transition-colors",
                      isMatch
                        ? "bg-primary text-primary-foreground border-transparent"
                        : "bg-background border-foreground hover:bg-accent"
                    )}
                  >
                    <Zap className="w-3 h-3 inline mr-1" />
                    Log
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Nutrition Facts Label — tap for full summary */}
      <Link href={`/day-summary?date=${date}`}>
      <div className="bg-card border-4 border-foreground rounded-xl p-5 mb-8 shadow-[4px_4px_0_0_hsl(var(--foreground))] text-foreground cursor-pointer active:opacity-80 transition-opacity">
        <h2 className="font-sans text-3xl font-black tracking-tighter uppercase border-b-[6px] border-foreground pb-2 mb-2">
          Nutrition Facts
        </h2>
        <div className="flex justify-between items-end border-b-8 border-foreground pb-2 mb-2">
          <div>
            <div className="text-sm font-bold uppercase tracking-tight">Amount Per Day</div>
            <div className="text-[2.5rem] font-black leading-none uppercase tracking-tighter">Calories</div>
          </div>
          <div className="text-[3rem] font-black font-mono leading-none tracking-tighter">
            {summary?.totalKcal ?? 0}
          </div>
        </div>
        <div className="space-y-1.5 text-sm uppercase tracking-tight">
          <div className="flex justify-between border-b-2 border-foreground/30 pb-1.5">
            <span className="font-bold">
              Total Fat{" "}
              <span className="font-medium font-mono text-base ml-1">{summary?.totalFat ?? 0}g</span>
            </span>
          </div>
          <div className="flex justify-between border-b-2 border-foreground/30 pb-1.5">
            <span className="font-bold">
              Total Carb.{" "}
              <span className="font-medium font-mono text-base ml-1">{summary?.totalCarbs ?? 0}g</span>
            </span>
          </div>
          <div className="flex justify-between border-b-2 border-foreground/30 pb-1.5">
            <span className="font-bold">
              Protein{" "}
              <span className="font-medium font-mono text-base ml-1">{summary?.totalProtein ?? 0}g</span>
            </span>
          </div>
        </div>
        <div className="mt-3 text-center text-xs font-bold text-primary tracking-wide">
          View full breakdown →
        </div>
      </div>
      </Link>

      {/* Meal Sections */}
      <div className="space-y-6">
        {(["breakfast", "lunch", "dinner", "snack"] as DiaryEntryInputMealType[]).map((meal) => (
          <MealSection key={meal} meal={meal} items={diary?.[meal] ?? []} date={date} />
        ))}
      </div>

      {/* Global quick-log drawer (triggered from Quick Presets strip) */}
      <SelectMealSetDrawer
        open={isQuickLogOpen}
        onOpenChange={setIsQuickLogOpen}
        mealType={quickLogMeal}
        date={date}
        initialPresetId={quickLogPresetId}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// MealSection
// ──────────────────────────────────────────────────────────

interface SavePresetState {
  name: string;
  category: DiaryEntryInputMealType;
}

function MealSection({
  meal,
  items,
  date,
}: {
  meal: DiaryEntryInputMealType;
  items: DiaryEntry[];
  date: string;
}) {
  const [isMealSetPickerOpen, setIsMealSetPickerOpen] = useState(false);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [savePreset, setSavePreset] = useState<SavePresetState>({ name: "", category: meal });

  const deleteEntry = useDeleteDiaryEntry();
  const createSet = useCreateMealSet();
  const addItem = useAddMealSetItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mealKcal = items.reduce(
    (acc, item) => acc + Math.round((item.food.kcalPerServing || 0) * item.servings),
    0
  );

  const handleDelete = (id: number) => {
    deleteEntry.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetDiaryQueryKey({ date }) });
          queryClient.invalidateQueries({ queryKey: getGetDiarySummaryQueryKey({ date }) });
        },
      }
    );
  };

  const handleSaveAsPreset = async () => {
    if (!savePreset.name.trim()) return;
    try {
      const created = await createSet.mutateAsync({
        data: { name: savePreset.name.trim(), category: savePreset.category },
      });
      await Promise.all(
        items.map((entry) =>
          addItem.mutateAsync({
            id: created.id,
            data: { foodId: entry.food.id, servings: entry.servings },
          })
        )
      );
      queryClient.invalidateQueries({ queryKey: getListMealSetsQueryKey() });
      toast({
        title: `Preset "${savePreset.name.trim()}" saved`,
        description: `${items.length} item${items.length > 1 ? "s" : ""} saved.`,
      });
      setIsSavingPreset(false);
      setSavePreset({ name: "", category: meal });
    } catch {
      toast({ title: "Failed to save preset", variant: "destructive" });
    }
  };

  const isSaveLoading = createSet.isPending || addItem.isPending;

  return (
    <section className="bg-card border-2 border-foreground rounded-2xl overflow-hidden shadow-sm">
      <div className="flex justify-between items-center px-4 py-3 bg-foreground text-background">
        <h3 className="font-black uppercase tracking-widest text-sm">{meal}</h3>
        <span className="font-mono font-bold text-sm bg-background text-foreground px-2 py-0.5 rounded-md">
          {mealKcal} kcal
        </span>
      </div>

      {items.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground font-medium">No entries yet.</div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((entry) => (
            <div key={entry.id} className="p-4 flex flex-col gap-2">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base leading-tight">{entry.food.name}</p>
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">
                    {entry.food.brand && `${entry.food.brand} • `}
                    {entry.servings} × {entry.food.servingSize || "1 serving"}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="font-mono font-bold text-lg">
                    {Math.round((entry.food.kcalPerServing || 0) * entry.servings)}
                  </div>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    disabled={deleteEntry.isPending}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save as Preset panel */}
      {isSavingPreset && (
        <div className="p-4 border-t-2 border-dashed border-primary/40 bg-primary/5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">Save as Preset</p>
            <button
              onClick={() => setIsSavingPreset(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <Input
            autoFocus
            placeholder="Preset name, e.g. Standard Breakfast"
            value={savePreset.name}
            onChange={(e) => setSavePreset((s) => ({ ...s, name: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && handleSaveAsPreset()}
          />
          <select
            className="w-full h-10 px-3 border-2 border-input bg-background rounded-xl text-sm font-medium focus:outline-none focus:border-primary"
            value={savePreset.category}
            onChange={(e) =>
              setSavePreset((s) => ({ ...s, category: e.target.value as DiaryEntryInputMealType }))
            }
          >
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
          </select>
          <Button
            className="w-full border-2 border-transparent shadow-[4px_4px_0_0_hsl(var(--foreground))]"
            onClick={handleSaveAsPreset}
            disabled={isSaveLoading || !savePreset.name.trim()}
          >
            {isSaveLoading ? "Saving…" : "Save Preset"}
          </Button>
        </div>
      )}

      <div className="p-3 bg-muted/30 border-t border-border flex gap-2 flex-wrap">
        <Link
          href={`/search?mealType=${meal}&date=${date}`}
          className="flex-1 min-w-[100px] py-3 text-center text-sm font-bold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Food
        </Link>
        <button
          onClick={() => setIsMealSetPickerOpen(true)}
          className="flex-1 min-w-[100px] py-3 text-center text-sm font-bold border-2 border-foreground bg-background rounded-xl hover:bg-accent transition-colors flex items-center justify-center gap-2"
        >
          <Zap className="w-4 h-4" /> Log Preset
        </button>
        {items.length > 0 && !isSavingPreset && (
          <button
            onClick={() => setIsSavingPreset(true)}
            className="py-3 px-4 text-sm font-bold border-2 border-dashed border-primary/50 text-primary bg-primary/5 rounded-xl hover:bg-primary/10 transition-colors flex items-center justify-center gap-2"
          >
            <BookmarkPlus className="w-4 h-4" /> Save
          </button>
        )}
      </div>

      <SelectMealSetDrawer
        open={isMealSetPickerOpen}
        onOpenChange={setIsMealSetPickerOpen}
        mealType={meal}
        date={date}
      />
    </section>
  );
}
