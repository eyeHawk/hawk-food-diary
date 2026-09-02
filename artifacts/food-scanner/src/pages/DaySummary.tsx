import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  type MonitoredNutrient,
  type NutrientTargets,
  useGetUserPreferences,
  useUpdateUserPreferences,
  useGetDiary,
  getGetDiaryQueryKey,
  type DiaryEntry,
  type DiaryEntryInputMealType,
} from "@workspace/api-client-react";
import { getTodayStr, formatRelativeDate } from "@/lib/date";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// ── helpers ──────────────────────────────────────────────────────────────────

interface Totals {
  kcal: number;
  fat: number;
  saturatedFat: number;
  carbs: number;
  sugars: number;
  fiber: number;
  protein: number;
  salt: number;
  sodium: number;
  potassium: number;
  cholesterol: number;
}

function sumEntries(entries: DiaryEntry[]): Totals {
  return entries.reduce<Totals>(
    (acc, e) => {
      const s = e.servings;
      const f = e.food;
      return {
        kcal: acc.kcal + (f.kcalPerServing ?? 0) * s,
        fat: acc.fat + (f.fatPerServing ?? 0) * s,
        saturatedFat: acc.saturatedFat + (f.saturatedFatPerServing ?? 0) * s,
        carbs: acc.carbs + (f.carbsPerServing ?? 0) * s,
        sugars: acc.sugars + (f.sugarsPerServing ?? 0) * s,
        fiber: acc.fiber + (f.fiberPerServing ?? 0) * s,
        protein: acc.protein + (f.proteinPerServing ?? 0) * s,
        salt: acc.salt + (f.saltPerServing ?? 0) * s,
        sodium: acc.sodium + (f.sodiumPerServing ?? 0) * s,
        potassium: acc.potassium + (f.potassiumPerServing ?? 0) * s,
        cholesterol: acc.cholesterol + (f.cholesterolPerServing ?? 0) * s,
      };
    },
    { kcal: 0, fat: 0, saturatedFat: 0, carbs: 0, sugars: 0, fiber: 0, protein: 0, salt: 0, sodium: 0, potassium: 0, cholesterol: 0 }
  );
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as DiaryEntryInputMealType[];

const MEAL_COLOR: Record<string, string> = {
  breakfast: "bg-amber-400",
  lunch: "bg-emerald-500",
  dinner: "bg-blue-500",
  snack: "bg-purple-500",
};

const MEAL_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

const NUTRIENT_OPTIONS: Array<{
  value: MonitoredNutrient;
  label: string;
  description: string;
}> = [
  { value: "potassium", label: "Potassium", description: "Supports fluid balance and heart health" },
  { value: "sodium", label: "Sodium", description: "Helps monitor salt intake" },
  { value: "cholesterol", label: "Cholesterol", description: "Tracks dietary cholesterol" },
  { value: "salt", label: "Salt", description: "Tracks total salt in your meals" },
  { value: "fiber", label: "Fiber", description: "Keeps an eye on daily fiber" },
];

const TARGETABLE_NUTRIENTS = ["potassium", "sodium", "cholesterol"] as const;
type TargetableNutrient = (typeof TARGETABLE_NUTRIENTS)[number];

const TARGET_LABELS: Record<TargetableNutrient, string> = {
  potassium: "Potassium",
  sodium: "Sodium",
  cholesterol: "Cholesterol",
};

const TARGET_UNITS: Record<TargetableNutrient, string> = {
  potassium: "mg",
  sodium: "mg",
  cholesterol: "mg",
};

// ── component ─────────────────────────────────────────────────────────────────

export default function DaySummary() {
  const [, navigate] = useLocation();
  const [monitoredNutrients, setMonitoredNutrients] = useState<MonitoredNutrient[]>([
    "potassium",
  ]);
  const [nutrientTargets, setNutrientTargets] = useState<NutrientTargets>({});
  const [targetDrafts, setTargetDrafts] = useState<Record<TargetableNutrient, string>>({
    potassium: "",
    sodium: "",
    cholesterol: "",
  });
  const { data: preferences } = useGetUserPreferences();
  const updatePreferences = useUpdateUserPreferences();

  useEffect(() => {
    if (preferences) {
      setMonitoredNutrients(preferences.monitoredNutrients);
      setNutrientTargets(preferences.nutrientTargets ?? {});
      setTargetDrafts({
        potassium: preferences.nutrientTargets?.potassium?.toString() ?? "",
        sodium: preferences.nutrientTargets?.sodium?.toString() ?? "",
        cholesterol: preferences.nutrientTargets?.cholesterol?.toString() ?? "",
      });
    }
  }, [preferences]);

  const savePreferences = (
    nextMonitoredNutrients: MonitoredNutrient[],
    nextNutrientTargets: NutrientTargets,
    onError: () => void,
  ) => {
    updatePreferences.mutate(
      {
        data: {
          monitoredNutrients: nextMonitoredNutrients,
          nutrientTargets: nextNutrientTargets,
        },
      },
      { onError },
    );
  };

  // Grab date from query string (?date=YYYY-MM-DD); fall back to today
  const params = new URLSearchParams(window.location.search);
  const date = params.get("date") || getTodayStr();

  const { data: diary, isLoading } = useGetDiary(
    { date },
    { query: { queryKey: getGetDiaryQueryKey({ date }) } }
  );

  const allEntries: DiaryEntry[] = MEALS.flatMap((m) => diary?.[m] ?? []);
  const totals = sumEntries(allEntries);

  // Per-meal totals
  const mealTotals = MEALS.map((m) => ({
    meal: m,
    totals: sumEntries(diary?.[m] ?? []),
    count: (diary?.[m] ?? []).length,
  }));

  // Macro split as % of total kcal
  const fatKcal = totals.fat * 9;
  const carbKcal = totals.carbs * 4;
  const protKcal = totals.protein * 4;
  const macroTotal = fatKcal + carbKcal + protKcal || 1;
  const fatPct = Math.round((fatKcal / macroTotal) * 100);
  const carbPct = Math.round((carbKcal / macroTotal) * 100);
  const protPct = 100 - fatPct - carbPct;

  // Top foods by kcal
  const topFoods = [...allEntries]
    .sort(
      (a, b) =>
        (b.food.kcalPerServing ?? 0) * b.servings -
        (a.food.kcalPerServing ?? 0) * a.servings
    )
    .slice(0, 5);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <header className="flex items-center gap-3 py-4 mb-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/")}
          className="h-10 w-10 rounded-full border-2 border-transparent hover:border-border shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-black tracking-tight leading-tight">
            Day Summary
          </h1>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
            {formatRelativeDate(date)} · {date}
          </p>
        </div>
      </header>

      {isLoading ? (
        <div className="py-20 text-center text-muted-foreground font-medium">
          Loading…
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Extended Nutrition Facts Label ── */}
          <div className="bg-card border-4 border-foreground rounded-xl p-5 shadow-[4px_4px_0_0_hsl(var(--foreground))]">
            <h2 className="font-sans text-3xl font-black tracking-tighter uppercase border-b-[6px] border-foreground pb-2 mb-2">
              Nutrition Facts
            </h2>
            <div className="flex justify-between items-end border-b-8 border-foreground pb-2 mb-2">
              <div>
                <div className="text-sm font-bold uppercase tracking-tight">Amount Per Day</div>
                <div className="text-[2rem] font-black leading-none uppercase tracking-tighter">
                  Calories
                </div>
              </div>
              <div className="text-[3rem] font-black font-mono leading-none tracking-tighter">
                {Math.round(totals.kcal)}
              </div>
            </div>

            <div className="space-y-1 text-sm uppercase tracking-tight">
              <NutritionRow label="Total Fat" value={round1(totals.fat)} unit="g" thick />
              <NutritionRow label="Saturated Fat" value={round1(totals.saturatedFat)} unit="g" indent />
              <NutritionRow label="Total Carbohydrate" value={round1(totals.carbs)} unit="g" thick />
              <NutritionRow label="Total Sugars" value={round1(totals.sugars)} unit="g" indent />
              <NutritionRow
                label="Dietary Fiber"
                value={round1(totals.fiber)}
                unit="g"
                indent
                highlight={monitoredNutrients.includes("fiber")}
              />
              <NutritionRow label="Protein" value={round1(totals.protein)} unit="g" thick />
              <NutritionRow
                label="Salt"
                value={round1(totals.salt)}
                unit="g"
                highlight={monitoredNutrients.includes("salt")}
              />
              <NutritionRow
                label="Sodium"
                value={Math.round(totals.sodium)}
                unit="mg"
                highlight={monitoredNutrients.includes("sodium")}
                target={
                  monitoredNutrients.includes("sodium")
                    ? nutrientTargets.sodium
                    : undefined
                }
              />
              <NutritionRow
                label="Potassium"
                value={Math.round(totals.potassium)}
                unit="mg"
                highlight={monitoredNutrients.includes("potassium")}
                target={
                  monitoredNutrients.includes("potassium")
                    ? nutrientTargets.potassium
                    : undefined
                }
              />
              <NutritionRow
                label="Cholesterol"
                value={Math.round(totals.cholesterol)}
                unit="mg"
                highlight={monitoredNutrients.includes("cholesterol")}
                target={
                  monitoredNutrients.includes("cholesterol")
                    ? nutrientTargets.cholesterol
                    : undefined
                }
              />
            </div>
          </div>

          <MonitoredNutrientSettings
            monitoredNutrients={monitoredNutrients}
            nutrientTargets={nutrientTargets}
            targetDrafts={targetDrafts}
            isSaving={updatePreferences.isPending}
            onToggle={(nutrient) => {
              const previous = monitoredNutrients;
              const previousTargets = nutrientTargets;
              const next = previous.includes(nutrient)
                ? previous.filter((value) => value !== nutrient)
                : [...previous, nutrient];

              setMonitoredNutrients(next);
              savePreferences(next, nutrientTargets, () => {
                setMonitoredNutrients(previous);
                setNutrientTargets(previousTargets);
              });
            }}
            onTargetChange={(nutrient, value) => {
              setTargetDrafts((previous) => ({ ...previous, [nutrient]: value }));
            }}
            onTargetBlur={(nutrient) => {
              const draft = targetDrafts[nutrient].trim();
              const nextTarget = draft === "" ? undefined : Number(draft);
              if (nextTarget !== undefined && (!Number.isFinite(nextTarget) || nextTarget < 1)) {
                setTargetDrafts((previous) => ({
                  ...previous,
                  [nutrient]: nutrientTargets[nutrient]?.toString() ?? "",
                }));
                return;
              }

              const previousTargets = nutrientTargets;
              const nextTargets = { ...nutrientTargets };
              if (nextTarget === undefined) {
                delete nextTargets[nutrient];
              } else {
                nextTargets[nutrient] = nextTarget;
              }

              setNutrientTargets(nextTargets);
              savePreferences(monitoredNutrients, nextTargets, () => {
                setNutrientTargets(previousTargets);
                setTargetDrafts((previous) => ({
                  ...previous,
                  [nutrient]: previousTargets[nutrient]?.toString() ?? "",
                }));
              });
            }}
          />

          {/* ── Macro split bar ── */}
          <div className="bg-card border-2 border-foreground rounded-xl p-4 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
              Macro Split
            </h3>
            <div className="flex rounded-lg overflow-hidden h-5 mb-3">
              {totals.kcal > 0 ? (
                <>
                  <div className="bg-yellow-400" style={{ width: `${fatPct}%` }} />
                  <div className="bg-emerald-400" style={{ width: `${carbPct}%` }} />
                  <div className="bg-blue-400" style={{ width: `${protPct}%` }} />
                </>
              ) : (
                <div className="bg-muted w-full" />
              )}
            </div>
            <div className="flex gap-4 text-xs font-bold">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-yellow-400" />
                Fat {fatPct}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-emerald-400" />
                Carbs {carbPct}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-blue-400" />
                Protein {protPct}%
              </span>
            </div>
          </div>

          {/* ── Per-meal breakdown ── */}
          <div className="bg-card border-2 border-foreground rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-foreground text-background">
              <h3 className="font-black uppercase tracking-widest text-sm">By Meal</h3>
            </div>
            <div className="divide-y divide-border">
              {mealTotals.map(({ meal, totals: mt, count }) => {
                const pct = totals.kcal > 0 ? mt.kcal / totals.kcal : 0;
                return (
                  <div key={meal} className="p-4">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="font-bold text-sm capitalize">{MEAL_LABEL[meal]}</span>
                      <span className="font-mono font-bold text-sm">
                        {Math.round(mt.kcal)} kcal
                        {count > 0 && (
                          <span className="text-xs font-medium text-muted-foreground ml-1">
                            ({count} item{count !== 1 ? "s" : ""})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", MEAL_COLOR[meal])}
                        style={{ width: `${Math.round(pct * 100)}%` }}
                      />
                    </div>
                    {count > 0 && (
                      <div className="flex gap-3 mt-1.5 text-[11px] text-muted-foreground font-medium">
                        <span>P {round1(mt.protein)}g</span>
                        <span>C {round1(mt.carbs)}g</span>
                        <span>F {round1(mt.fat)}g</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Top foods ── */}
          {topFoods.length > 0 && (
            <div className="bg-card border-2 border-foreground rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-foreground text-background">
                <h3 className="font-black uppercase tracking-widest text-sm">Top Foods</h3>
              </div>
              <div className="divide-y divide-border">
                {topFoods.map((entry) => {
                  const kcal = Math.round((entry.food.kcalPerServing ?? 0) * entry.servings);
                  const pct = totals.kcal > 0 ? kcal / totals.kcal : 0;
                  return (
                    <div key={entry.id} className="p-4">
                      <div className="flex justify-between items-start gap-3 mb-1.5">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm leading-tight truncate">
                            {entry.food.name}
                          </p>
                          <p className="text-xs text-muted-foreground font-medium mt-0.5 capitalize">
                            {entry.mealType} · {entry.servings}×{" "}
                            {entry.food.servingSize || "serving"}
                          </p>
                        </div>
                        <span className="font-mono font-bold text-sm shrink-0">{kcal} kcal</span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${Math.round(pct * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {allEntries.length === 0 && (
            <div className="py-12 text-center text-muted-foreground font-medium">
              No entries logged for this day.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MonitoredNutrientSettings({
  monitoredNutrients,
  nutrientTargets,
  targetDrafts,
  isSaving,
  onToggle,
  onTargetChange,
  onTargetBlur,
}: {
  monitoredNutrients: MonitoredNutrient[];
  nutrientTargets: NutrientTargets;
  targetDrafts: Record<TargetableNutrient, string>;
  isSaving: boolean;
  onToggle: (nutrient: MonitoredNutrient) => void;
  onTargetChange: (nutrient: TargetableNutrient, value: string) => void;
  onTargetBlur: (nutrient: TargetableNutrient) => void;
}) {
  return (
    <section className="bg-card border-2 border-foreground rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 bg-foreground text-background">
        <h2 className="font-black uppercase tracking-widest text-sm">Doctor-monitored nutrients</h2>
        <p className="text-xs text-background/70 font-medium normal-case tracking-normal mt-1">
          Choose which nutrients to highlight in your nutrition facts.
        </p>
      </div>
      <div className="divide-y divide-border">
        {NUTRIENT_OPTIONS.map((option) => {
          const checked = monitoredNutrients.includes(option.value);
          return (
            <div
              key={option.value}
              className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors"
            >
              <span className="min-w-0">
                <span className="block font-bold text-sm">{option.label}</span>
                <span className="block text-xs text-muted-foreground font-medium mt-0.5">
                  {option.description}
                </span>
              </span>
              <div className="flex items-center gap-3 shrink-0">
                {TARGETABLE_NUTRIENTS.includes(option.value as TargetableNutrient) && checked && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={targetDrafts[option.value as TargetableNutrient]}
                      onChange={(event) =>
                        onTargetChange(option.value as TargetableNutrient, event.target.value)
                      }
                      onBlur={() => onTargetBlur(option.value as TargetableNutrient)}
                      disabled={isSaving}
                      aria-label={`${TARGET_LABELS[option.value as TargetableNutrient]} daily target`}
                      placeholder="Target"
                      className="h-9 w-24 rounded-lg border-2 border-input bg-background px-2 text-right text-sm font-mono font-bold focus-visible:outline-none focus-visible:border-primary"
                    />
                    <span className="text-xs font-bold text-muted-foreground">
                      {TARGET_UNITS[option.value as TargetableNutrient]}
                    </span>
                  </div>
                )}
                <Switch
                  checked={checked}
                  disabled={isSaving}
                  onCheckedChange={() => onToggle(option.value)}
                  aria-label={`Highlight ${option.label} as monitored`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="px-4 py-3 text-[11px] text-muted-foreground font-medium border-t border-border">
        Changes save automatically to your account.
      </p>
    </section>
  );
}

// ── NutritionRow ─────────────────────────────────────────────────────────────

function NutritionRow({
  label,
  value,
  unit,
  target,
  thick,
  indent,
  highlight,
}: {
  label: string;
  value: number;
  unit: string;
  target?: number;
  thick?: boolean;
  indent?: boolean;
  highlight?: boolean;
}) {
  const hasTarget = target !== undefined && target > 0;
  const progress = hasTarget ? Math.min((value / target) * 100, 100) : 0;

  return (
    <div
      className={cn(
        "flex justify-between pb-1.5",
        thick
          ? "border-b-4 border-foreground"
          : "border-b-2 border-foreground/30",
        indent && "pl-4",
        highlight && "bg-primary/10 -mx-1 px-1 rounded"
      )}
    >
      <span className={cn("font-bold", indent && "font-medium", highlight && "text-primary")}>
        {indent && <span className="text-foreground/40 mr-1">—</span>}
        {label}
        {highlight && <span className="ml-1 text-[9px] font-black uppercase tracking-widest bg-primary text-primary-foreground rounded px-1 py-0.5">monitored</span>}
      </span>
      <div className="flex flex-col items-end">
        <span className={cn("font-mono font-bold", highlight && "text-primary")}>
          {value}
          <span className="text-xs font-medium text-muted-foreground ml-0.5">{unit}</span>
        </span>
        {hasTarget && (
          <div className="flex items-center gap-1.5 mt-1 normal-case tracking-normal">
            <div
              className="w-16 h-1.5 bg-muted rounded-full overflow-hidden"
              role="progressbar"
              aria-label={`${label} daily target progress`}
              aria-valuemin={0}
              aria-valuemax={target}
              aria-valuenow={value}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  value > target ? "bg-destructive" : "bg-primary",
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">
              {Math.round(target)} {unit} goal
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
