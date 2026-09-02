import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useAddDiaryEntry, 
  getGetDiaryQueryKey, 
  getGetDiarySummaryQueryKey,
  type Food,
  type DiaryEntryInputMealType,
} from "@workspace/api-client-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTodayStr } from "@/lib/date";
import { useToast } from "@/hooks/use-toast";
import { MealSetPickerDrawer } from "./MealSetPickerDrawer";
import { Pencil } from "lucide-react";

interface FoodDetailDrawerProps {
  food: Food | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMealType?: string;
  defaultDate?: string;
}

interface MacroOverrides {
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
}

function toField(v: number | null | undefined): string {
  return v != null ? String(v) : "";
}

export function FoodDetailDrawer({ food, open, onOpenChange, defaultMealType, defaultDate }: FoodDetailDrawerProps) {
  const [servings, setServings] = useState<number>(1);
  const [mealType, setMealType] = useState<DiaryEntryInputMealType>((defaultMealType as DiaryEntryInputMealType) || "breakfast");
  const [date, setDate] = useState<string>(defaultDate || getTodayStr());
  const [isEditing, setIsEditing] = useState(false);
  const [macros, setMacros] = useState<MacroOverrides | null>(null);
  const [isMealSetPickerOpen, setIsMealSetPickerOpen] = useState(false);

  const addEntry = useAddDiaryEntry();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Auto-enter edit mode when the drawer opens for a zero-calorie food
  useEffect(() => {
    if (open && food) {
      if (food.kcalPerServing == null || food.kcalPerServing === 0) {
        setMacros({
          kcal: toField(food.kcalPerServing),
          protein: toField(food.proteinPerServing),
          carbs: toField(food.carbsPerServing),
          fat: toField(food.fatPerServing),
        });
        setIsEditing(true);
      }
    } else if (!open) {
      // Reset editing state when drawer closes so next scan starts clean
      setIsEditing(false);
      setMacros(null);
    }
  }, [open, food]);

  if (!food) return null;

  // Use overridden macros if user has edited them, otherwise fall back to food data
  const kcalVal = macros ? parseFloat(macros.kcal) || 0 : (food.kcalPerServing ?? 0);
  const proteinVal = macros ? parseFloat(macros.protein) || 0 : (food.proteinPerServing ?? 0);
  const carbsVal = macros ? parseFloat(macros.carbs) || 0 : (food.carbsPerServing ?? 0);
  const fatVal = macros ? parseFloat(macros.fat) || 0 : (food.fatPerServing ?? 0);

  const kcal = Math.round(kcalVal * servings);
  const protein = (proteinVal * servings).toFixed(1);
  const carbs = (carbsVal * servings).toFixed(1);
  const fats = (fatVal * servings).toFixed(1);

  const hasEdits = macros !== null;
  const secondaryNutrients = [
    { label: "Sodium", value: food.sodiumPerServing, monitored: false },
    { label: "Potassium", value: food.potassiumPerServing, monitored: true },
    { label: "Cholesterol", value: food.cholesterolPerServing, monitored: false },
  ].filter(
    (nutrient): nutrient is { label: string; value: number; monitored: boolean } =>
      nutrient.value != null
  );

  const startEditing = () => {
    setMacros({
      kcal: toField(food.kcalPerServing),
      protein: toField(food.proteinPerServing),
      carbs: toField(food.carbsPerServing),
      fat: toField(food.fatPerServing),
    });
    setIsEditing(true);
  };

  const handleLog = async () => {
    if (servings <= 0) return;

    // If the user corrected macro values, persist them to the food record first
    if (hasEdits && macros) {
      try {
        await fetch(`/api/foods/${food.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kcalPerServing: parseFloat(macros.kcal) || null,
            proteinPerServing: parseFloat(macros.protein) || null,
            carbsPerServing: parseFloat(macros.carbs) || null,
            fatPerServing: parseFloat(macros.fat) || null,
          }),
        });
      } catch {
        toast({ title: "Warning", description: "Could not save corrected values, but will still log the entry.", variant: "destructive" });
      }
    }

    addEntry.mutate({
      data: { foodId: food.id, date, mealType, servings }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDiaryQueryKey({ date }) });
        queryClient.invalidateQueries({ queryKey: getGetDiarySummaryQueryKey({ date }) });
        toast({ title: "Logged successfully", description: `Added ${servings}x ${food.name} to ${mealType}.` });
        onOpenChange(false);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to log entry.", variant: "destructive" });
      }
    });
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="border-b-2 border-foreground pb-4 mb-4">
            <DrawerTitle className="text-2xl font-bold">{food.name}</DrawerTitle>
            <p className="text-muted-foreground">{food.brand || "Unknown brand"} • {food.servingSize || "1 serving"}</p>
          </DrawerHeader>
          
          <div className="px-4 pb-6 overflow-y-auto space-y-6">
            {/* Macro tiles — editable or display */}
            {isEditing && macros ? (
              <div className="space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                  Edit values per serving (from product label)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Kcal", key: "kcal" as const, unit: "" },
                    { label: "Protein (g)", key: "protein" as const, unit: "g" },
                    { label: "Carbs (g)", key: "carbs" as const, unit: "g" },
                    { label: "Fat (g)", key: "fat" as const, unit: "g" },
                  ].map(({ label, key }) => (
                    <div key={key} className="bg-card border-2 border-primary rounded-xl p-2">
                      <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">{label}</div>
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        value={macros[key]}
                        onChange={(e) => setMacros(m => m ? { ...m, [key]: e.target.value } : m)}
                        className="h-8 text-lg font-bold font-mono border-0 p-0 focus-visible:ring-0 bg-transparent"
                      />
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => { setMacros(null); setIsEditing(false); }}
                >
                  Cancel editing
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className={`bg-card border-2 ${hasEdits ? "border-primary" : "border-foreground"} rounded-xl p-2 shadow-sm`}>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Kcal</div>
                    <div className="text-xl font-bold font-mono">{kcal}</div>
                  </div>
                  <div className={`bg-card border-2 ${hasEdits ? "border-primary" : "border-foreground"} rounded-xl p-2 shadow-sm`}>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Protein</div>
                    <div className="text-xl font-bold font-mono">{protein}g</div>
                  </div>
                  <div className={`bg-card border-2 ${hasEdits ? "border-primary" : "border-foreground"} rounded-xl p-2 shadow-sm`}>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Carbs</div>
                    <div className="text-xl font-bold font-mono">{carbs}g</div>
                  </div>
                  <div className={`bg-card border-2 ${hasEdits ? "border-primary" : "border-foreground"} rounded-xl p-2 shadow-sm`}>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Fats</div>
                    <div className="text-xl font-bold font-mono">{fats}g</div>
                  </div>
                </div>
                <button
                  onClick={startEditing}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
                >
                  <Pencil className="w-3 h-3" />
                  {hasEdits ? "Values edited — tap to change" : "Values wrong? Tap to correct"}
                </button>
              </div>
            )}

            {secondaryNutrients.length > 0 && (
              <div className="grid grid-cols-3 gap-2" aria-label="Additional nutrients">
                {secondaryNutrients.map(({ label, value, monitored }) => (
                  <div
                    key={label}
                    className={`rounded-xl border p-2 text-center ${
                      monitored
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted/30"
                    }`}
                  >
                    <div className="text-[10px] uppercase font-bold tracking-tight">
                      {label}
                      {monitored && (
                        <span className="ml-1 inline-block rounded bg-primary px-1 py-0.5 align-middle text-[8px] font-black uppercase tracking-widest text-primary-foreground">
                          monitored
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-lg font-bold">
                      {Math.round(value * servings)}
                      <span className="ml-0.5 text-xs font-medium text-muted-foreground">mg</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-4 bg-muted/30 p-4 rounded-2xl border border-border">
              <div className="flex items-center justify-between">
                <label className="font-bold text-sm">Servings</label>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="icon" className="h-10 w-10 rounded-full" onClick={() => setServings(s => Math.max(0.25, s - 0.25))}>-</Button>
                  <span className="font-mono font-bold text-lg w-12 text-center">{servings}</span>
                  <Button variant="outline" size="icon" className="h-10 w-10 rounded-full" onClick={() => setServings(s => s + 0.25)}>+</Button>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <label className="font-bold text-sm">Meal</label>
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
                <label className="font-bold text-sm">Date</label>
                <Input 
                  type="date" 
                  className="w-auto h-10 py-1"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 pt-2">
              <Button size="lg" className="w-full text-lg shadow-[4px_4px_0_0_hsl(var(--foreground))]" onClick={handleLog} disabled={addEntry.isPending}>
                {addEntry.isPending ? "Logging..." : "Log to Diary"}
              </Button>
              <Button size="lg" variant="outline" className="w-full border-2 border-foreground" onClick={() => setIsMealSetPickerOpen(true)}>
                Save to Preset
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <MealSetPickerDrawer 
        open={isMealSetPickerOpen} 
        onOpenChange={setIsMealSetPickerOpen} 
        food={food} 
        servings={servings} 
        onDone={() => {
          setIsMealSetPickerOpen(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
