import { useState } from "react";
import { useListMealSets, useCreateMealSet, getListMealSetsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Utensils, Plus, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const CATEGORY_OPTIONS = [
  { value: "", label: "No category" },
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
] as const;

const CATEGORY_PILL: Record<string, string> = {
  breakfast: "bg-amber-100 text-amber-700 border-amber-200",
  lunch: "bg-emerald-100 text-emerald-700 border-emerald-200",
  dinner: "bg-blue-100 text-blue-700 border-blue-200",
  snack: "bg-purple-100 text-purple-700 border-purple-200",
};

export default function MealSets() {
  const { data: sets, isLoading } = useListMealSets({ query: { queryKey: getListMealSetsQueryKey() } });
  const [isCreating, setIsCreating] = useState(false);
  const [newSetName, setNewSetName] = useState("");
  const [newSetCategory, setNewSetCategory] = useState("");

  const createSet = useCreateMealSet();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleCreate = () => {
    if (!newSetName.trim()) return;
    createSet.mutate(
      { data: { name: newSetName.trim(), category: (newSetCategory || undefined) as Parameters<typeof createSet.mutate>[0]["data"]["category"] } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMealSetsQueryKey() });
          setIsCreating(false);
          setNewSetName("");
          setNewSetCategory("");
          toast({ title: "Preset created" });
        },
        onError: () => {
          toast({ title: "Failed to create preset", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="py-4 mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tighter">Presets</h1>
          <p className="text-sm font-medium text-muted-foreground">Log your routine meals in one tap</p>
        </div>
      </header>

      {isCreating ? (
        <div className="bg-card border-2 border-foreground p-5 rounded-2xl mb-6 shadow-[4px_4px_0_0_hsl(var(--foreground))] animate-in fade-in slide-in-from-top-4">
          <label className="font-bold text-sm uppercase tracking-wider mb-2 block">Preset Name</label>
          <Input
            value={newSetName}
            onChange={(e) => setNewSetName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="e.g. Standard Breakfast"
            className="mb-3"
            autoFocus
          />
          <label className="font-bold text-sm uppercase tracking-wider mb-2 block">Category</label>
          <select
            className="w-full h-10 px-3 mb-4 border-2 border-input bg-background rounded-xl text-sm font-medium focus:outline-none focus:border-primary"
            value={newSetCategory}
            onChange={(e) => setNewSetCategory(e.target.value)}
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 border-2 border-foreground"
              onClick={() => { setIsCreating(false); setNewSetName(""); setNewSetCategory(""); }}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 border-2 border-transparent shadow-[4px_4px_0_0_hsl(var(--foreground))]"
              onClick={handleCreate}
              disabled={createSet.isPending || !newSetName.trim()}
            >
              {createSet.isPending ? "Saving…" : "Save Preset"}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          className="w-full h-14 mb-6 border-2 border-dashed border-primary text-primary bg-primary/5 hover:bg-primary/10 gap-2 rounded-2xl shadow-none"
          onClick={() => setIsCreating(true)}
        >
          <Plus className="w-5 h-5" />
          <span className="font-bold text-base">Create New Preset</span>
        </Button>
      )}

      {isLoading ? (
        <div className="p-8 text-center text-sm font-bold text-muted-foreground">Loading…</div>
      ) : sets?.length === 0 && !isCreating ? (
        <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground gap-4 border-2 border-dashed border-border rounded-3xl">
          <Utensils className="w-12 h-12 opacity-20" />
          <div>
            <p className="font-bold text-lg text-foreground">No Presets Yet</p>
            <p className="text-sm max-w-[250px] mt-1">
              Group foods you often eat together so you can log them instantly.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {sets?.map((set) => {
            const totalKcal = set.items.reduce(
              (acc, item) => acc + Math.round((item.food.kcalPerServing || 0) * item.servings),
              0
            );
            return (
              <Link key={set.id} href={`/meal-sets/${set.id}`}>
                <div className="bg-card border-2 border-foreground rounded-2xl p-5 shadow-[4px_4px_0_0_hsl(var(--foreground))] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all group flex justify-between items-center cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-bold text-xl">{set.name}</h3>
                      {set.category && (
                        <span
                          className={cn(
                            "text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border",
                            CATEGORY_PILL[set.category] ?? "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {set.category}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {set.items.length} {set.items.length === 1 ? "item" : "items"} •{" "}
                      <span className="font-mono text-primary">{totalKcal} kcal</span>
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
