import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMealSet,
  useDeleteMealSet,
  useDeleteMealSetItem,
  useUpdateMealSet,
  getGetMealSetQueryKey,
  getListMealSetsQueryKey,
  type MealSetLogInputMealType,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Trash2, Zap, Pencil, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SelectMealSetDrawer } from "@/components/SelectMealSetDrawer";
import { getTodayStr } from "@/lib/date";
import { cn } from "@/lib/utils";

const CATEGORY_OPTIONS = [
  { value: "", label: "No category" },
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

const CATEGORY_PILL: Record<string, string> = {
  breakfast: "bg-amber-100 text-amber-700 border-amber-200",
  lunch: "bg-emerald-100 text-emerald-700 border-emerald-200",
  dinner: "bg-blue-100 text-blue-700 border-blue-200",
  snack: "bg-purple-100 text-purple-700 border-purple-200",
};

export default function MealSetDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();

  const { data: set, isLoading } = useGetMealSet(id, { query: { queryKey: getGetMealSetQueryKey(id) } });

  const deleteSet = useDeleteMealSet();
  const deleteItem = useDeleteMealSetItem();
  const updateSet = useUpdateMealSet();

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [logMealType, setLogMealType] = useState<MealSetLogInputMealType>("breakfast");

  const handleDeleteSet = () => {
    if (!confirm("Delete this preset?")) return;
    deleteSet.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMealSetsQueryKey() });
          toast({ title: "Preset deleted" });
          setLocation("/meal-sets");
        },
        onError: () => {
          toast({ title: "Failed to delete", variant: "destructive" });
        },
      }
    );
  };

  const handleDeleteItem = (itemId: number) => {
    deleteItem.mutate(
      { id, itemId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMealSetQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListMealSetsQueryKey() });
        },
      }
    );
  };

  const startEditName = () => {
    setEditName(set?.name ?? "");
    setIsEditingName(true);
  };

  const saveEditName = () => {
    if (!editName.trim()) return;
    updateSet.mutate(
      { id, data: { name: editName.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMealSetQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListMealSetsQueryKey() });
          setIsEditingName(false);
          toast({ title: "Name updated" });
        },
        onError: () => toast({ title: "Failed to update", variant: "destructive" }),
      }
    );
  };

  const handleCategoryChange = (category: string) => {
    updateSet.mutate(
      { id, data: { category: (category || undefined) as Parameters<typeof updateSet.mutate>[0]["data"]["category"] } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMealSetQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListMealSetsQueryKey() });
        },
        onError: () => toast({ title: "Failed to update category", variant: "destructive" }),
      }
    );
  };

  const openLog = (mealType: MealSetLogInputMealType) => {
    setLogMealType(mealType);
    setIsLogOpen(true);
  };

  if (isLoading) {
    return <div className="p-8 text-center font-bold text-muted-foreground">Loading…</div>;
  }

  if (!set) {
    return <div className="p-8 text-center font-bold">Preset not found.</div>;
  }

  const totalKcal = set.items.reduce(
    (acc, item) => acc + Math.round((item.food.kcalPerServing || 0) * item.servings),
    0
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="py-4 mb-2 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/meal-sets")}
          className="h-12 w-12 rounded-full border-2 border-transparent hover:border-border -ml-2 shrink-0"
        >
          <ChevronLeft className="w-6 h-6" />
        </Button>

        {isEditingName ? (
          <div className="flex-1 flex items-center gap-2">
            <input
              autoFocus
              className="flex-1 font-black text-2xl uppercase tracking-tighter bg-transparent border-b-2 border-primary outline-none"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEditName();
                if (e.key === "Escape") setIsEditingName(false);
              }}
            />
            <button onClick={saveEditName} className="text-primary hover:opacity-70 transition-opacity">
              <Check className="w-5 h-5" />
            </button>
            <button onClick={() => setIsEditingName(false)} className="text-muted-foreground hover:opacity-70 transition-opacity">
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <h1 className="text-2xl font-black uppercase tracking-tighter truncate">{set.name}</h1>
            <button onClick={startEditName} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
              <Pencil className="w-4 h-4" />
            </button>
          </div>
        )}
      </header>

      {/* Category selector */}
      <div className="flex items-center gap-3 mb-6 px-0.5">
        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground shrink-0">Category</span>
        <div className="flex gap-2 flex-wrap">
          {CATEGORY_OPTIONS.map((opt) => {
            const isSelected = (set.category ?? "") === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleCategoryChange(opt.value)}
                className={cn(
                  "text-xs font-bold px-2.5 py-1 rounded-full border-2 transition-all",
                  isSelected
                    ? opt.value
                      ? cn(CATEGORY_PILL[opt.value], "border-current")
                      : "border-foreground bg-foreground text-background"
                    : "border-input bg-background text-muted-foreground hover:border-foreground"
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="bg-card border-4 border-foreground rounded-xl p-5 mb-6 shadow-[4px_4px_0_0_hsl(var(--foreground))]">
        <h2 className="font-sans text-xl font-black tracking-tighter uppercase border-b-4 border-foreground pb-2 mb-3">
          Preset Summary
        </h2>
        <div className="flex justify-between items-end border-b-[6px] border-foreground pb-1.5 mb-2">
          <div className="text-[2rem] font-black leading-none uppercase tracking-tighter">Calories</div>
          <div className="text-[2.5rem] font-black font-mono leading-none tracking-tighter">{totalKcal}</div>
        </div>
        <div className="text-sm font-bold uppercase tracking-wide">
          Total Items <span className="font-mono text-base ml-2">{set.items.length}</span>
        </div>
      </div>

      {/* Log Now */}
      {set.items.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2 px-0.5">
            Log to Meal
          </p>
          <div className="grid grid-cols-4 gap-2">
            {(["breakfast", "lunch", "dinner", "snack"] as MealSetLogInputMealType[]).map((m) => (
              <button
                key={m}
                onClick={() => openLog(m)}
                className="py-2.5 text-xs font-bold border-2 border-foreground bg-card rounded-xl hover:bg-primary hover:text-primary-foreground hover:border-transparent transition-all capitalize shadow-[2px_2px_0_0_hsl(var(--foreground))] hover:shadow-none"
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Items */}
      <div className="space-y-4 mb-8">
        <h3 className="font-black uppercase tracking-widest text-sm text-muted-foreground ml-1">
          Foods in this preset
        </h3>

        {set.items.length === 0 ? (
          <div className="p-6 text-center text-sm font-medium border-2 border-dashed border-border rounded-2xl">
            This preset is empty. Add foods from the Scanner or Search.
          </div>
        ) : (
          <div className="bg-card border-2 border-foreground rounded-2xl divide-y-2 divide-foreground shadow-sm">
            {set.items.map((item) => (
              <div key={item.id} className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-lg leading-tight">{item.food.name}</p>
                  <p className="text-sm text-muted-foreground font-medium mt-1">
                    {item.food.brand && `${item.food.brand} • `}
                    {item.servings} × {item.food.servingSize || "1 serving"}
                  </p>
                </div>
                <div className="font-mono font-bold text-xl shrink-0">
                  {Math.round((item.food.kcalPerServing || 0) * item.servings)}
                </div>
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  disabled={deleteItem.isPending}
                  className="w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button
        variant="outline"
        className="w-full h-14 border-2 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-2xl"
        onClick={handleDeleteSet}
        disabled={deleteSet.isPending}
      >
        <Trash2 className="w-5 h-5 mr-2" />
        <span className="font-bold text-base">Delete Preset</span>
      </Button>

      <SelectMealSetDrawer
        open={isLogOpen}
        onOpenChange={setIsLogOpen}
        mealType={logMealType}
        date={getTodayStr()}
        initialPresetId={id}
      />
    </div>
  );
}
