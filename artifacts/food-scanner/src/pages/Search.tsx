import { useState } from "react";
import { useSearchFoods, getSearchFoodsQueryKey, type Food } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { FoodDetailDrawer } from "@/components/FoodDetailDrawer";
import { AiQuickLogDrawer } from "@/components/AiQuickLogDrawer";
import { Search as SearchIcon, ScanLine, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export default function Search() {
  const searchParams = new URLSearchParams(window.location.search);
  const defaultMealType = searchParams.get("mealType") || undefined;
  const defaultDate = searchParams.get("date") || undefined;

  const [query, setQuery] = useState("");
  const [isAiOpen, setIsAiOpen] = useState(false);
  const { data: foods, isLoading } = useSearchFoods(
    { q: query },
    { query: { enabled: query.length > 1, queryKey: getSearchFoodsQueryKey({ q: query }) } }
  );

  const [selectedFood, setSelectedFood] = useState<Food | null>(null);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-[calc(100dvh-72px-32px)]">
      <header className="py-4 mb-2 flex items-center gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <SearchIcon className="w-5 h-5" />
          </div>
          <Input
            autoFocus
            className="pl-10 h-14 text-base border-2 border-foreground rounded-2xl shadow-[4px_4px_0_0_hsl(var(--foreground))]"
            placeholder="Search foods..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* AI Quick Log button */}
        <button
          onClick={() => setIsAiOpen(true)}
          title="AI Quick Log — describe any food"
          className={cn(
            "inline-flex items-center justify-center rounded-2xl border-2 h-14 w-14 transition-colors shrink-0",
            "border-primary bg-primary/10 text-primary hover:bg-primary/20"
          )}
        >
          <Sparkles className="w-6 h-6" />
        </button>

        {/* Barcode scanner */}
        <Link
          href={`/scan?mealType=${defaultMealType || ""}&date=${defaultDate || ""}`}
          className="inline-flex items-center justify-center rounded-2xl border-2 border-foreground h-14 w-14 hover:bg-accent transition-colors shrink-0"
        >
          <ScanLine className="w-6 h-6" />
        </Link>
      </header>

      {/* AI Quick Log hint when search is empty */}
      {query.length <= 1 && (
        <button
          onClick={() => setIsAiOpen(true)}
          className="mx-0.5 mb-4 p-4 rounded-2xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left flex items-center gap-4 group"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/25 transition-colors">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-bold text-sm text-primary">AI Quick Log</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Describe any food — "4 oz hamburger patty", "1 medium apple"
            </p>
          </div>
        </button>
      )}

      <div className="flex-1 overflow-y-auto pb-12">
        {query.length <= 1 ? (
          <div className="flex flex-col items-center justify-center text-center p-6 text-muted-foreground gap-4 h-[calc(100%-80px)]">
            <SearchIcon className="w-12 h-12 opacity-20" />
            <p className="font-medium">Type at least 2 characters to search locally cached foods.</p>
          </div>
        ) : isLoading ? (
          <div className="p-4 text-center text-sm font-bold text-muted-foreground">Searching...</div>
        ) : foods?.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-6 gap-4 h-[calc(100%-80px)]">
            <p className="font-bold text-lg">No results found</p>
            <p className="text-sm text-muted-foreground">
              Scan a barcode or use AI Quick Log to add new foods.
            </p>
            <div className="flex flex-col gap-3 w-full max-w-xs mt-2">
              <button
                onClick={() => setIsAiOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold h-12 px-6 hover:opacity-90 transition-opacity border-2 border-foreground shadow-[4px_4px_0_0_hsl(var(--foreground))]"
              >
                <Sparkles className="w-4 h-4" /> AI Quick Log
              </button>
              <Link
                href={`/scan?mealType=${defaultMealType || ""}&date=${defaultDate || ""}`}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-background font-bold h-12 px-6 hover:bg-accent transition-colors border-2 border-foreground shadow-[4px_4px_0_0_hsl(var(--foreground))]"
              >
                <ScanLine className="w-4 h-4" /> Open Scanner
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {foods?.map((food) => (
              <button
                key={food.id}
                onClick={() => setSelectedFood(food)}
                className="flex items-center justify-between p-4 bg-card border-2 border-input hover:border-primary hover:bg-primary/5 rounded-2xl text-left transition-all group"
              >
                <div>
                  <div className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">
                    {food.name}
                  </div>
                  <div className="text-sm text-muted-foreground font-medium mt-1">
                    {food.brand && `${food.brand} • `}
                    {food.servingSize || "1 serving"}
                  </div>
                </div>
                <div className="font-mono font-bold text-xl ml-4 shrink-0">
                  {Math.round(food.kcalPerServing || 0)}
                  <span className="text-[10px] uppercase text-muted-foreground ml-1">kcal</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <FoodDetailDrawer
        food={selectedFood}
        open={!!selectedFood}
        onOpenChange={(open) => !open && setSelectedFood(null)}
        defaultMealType={defaultMealType}
        defaultDate={defaultDate}
      />

      <AiQuickLogDrawer
        open={isAiOpen}
        onOpenChange={setIsAiOpen}
        defaultMealType={defaultMealType}
        defaultDate={defaultDate}
      />
    </div>
  );
}
