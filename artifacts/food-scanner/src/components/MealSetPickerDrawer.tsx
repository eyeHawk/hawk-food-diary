import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListMealSets, 
  useAddMealSetItem,
  useCreateMealSet,
  getListMealSetsQueryKey,
  getGetMealSetQueryKey,
  type Food
} from "@workspace/api-client-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Check } from "lucide-react";

interface MealSetPickerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  food: Food;
  servings: number;
  onDone: () => void;
}

export function MealSetPickerDrawer({ open, onOpenChange, food, servings, onDone }: MealSetPickerDrawerProps) {
  const { data: sets, isLoading } = useListMealSets({ query: { queryKey: getListMealSetsQueryKey() }});
  const [isCreating, setIsCreating] = useState(false);
  const [newSetName, setNewSetName] = useState("");
  
  const createSet = useCreateMealSet();
  const addItem = useAddMealSetItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleAddToSet = (setId: number) => {
    addItem.mutate({ id: setId, data: { foodId: food.id, servings } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMealSetsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMealSetQueryKey(setId) });
        toast({ title: "Added to meal set" });
        onDone();
      },
      onError: () => {
        toast({ title: "Failed to add", variant: "destructive" });
      }
    });
  };

  const handleCreateAndAdd = () => {
    if (!newSetName.trim()) return;
    createSet.mutate({ data: { name: newSetName.trim() } }, {
      onSuccess: (newSet) => {
        handleAddToSet(newSet.id);
      },
      onError: () => {
        toast({ title: "Failed to create meal set", variant: "destructive" });
      }
    });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="border-b-2 border-foreground pb-4 mb-4">
          <DrawerTitle className="text-xl font-bold">Save to Meal Set</DrawerTitle>
        </DrawerHeader>
        
        <div className="px-4 pb-6 overflow-y-auto space-y-4">
          {isCreating ? (
            <div className="bg-card border-2 border-foreground p-4 rounded-xl flex flex-col gap-3 shadow-[4px_4px_0_0_hsl(var(--foreground))]">
              <label className="font-bold">New Set Name</label>
              <Input 
                value={newSetName} 
                onChange={(e) => setNewSetName(e.target.value)} 
                placeholder="e.g. My Breakfast"
                autoFocus
              />
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 border-2" onClick={() => setIsCreating(false)}>Cancel</Button>
                <Button className="flex-1" onClick={handleCreateAndAdd} disabled={createSet.isPending || addItem.isPending}>
                  {createSet.isPending ? "Creating..." : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button 
                variant="outline" 
                className="w-full h-14 border-2 border-dashed border-primary text-primary hover:bg-primary/10 gap-2"
                onClick={() => setIsCreating(true)}
              >
                <Plus className="w-5 h-5" />
                Create New Meal Set
              </Button>

              <div className="space-y-2">
                {isLoading ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
                ) : sets?.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">No saved meal sets yet.</div>
                ) : (
                  sets?.map(set => (
                    <button 
                      key={set.id}
                      onClick={() => handleAddToSet(set.id)}
                      disabled={addItem.isPending}
                      className="w-full flex items-center justify-between p-4 bg-card border-2 border-input hover:border-primary rounded-xl transition-colors text-left group disabled:opacity-50"
                    >
                      <div>
                        <div className="font-bold">{set.name}</div>
                        <div className="text-xs text-muted-foreground">{set.items.length} items</div>
                      </div>
                      <div className="w-8 h-8 rounded-full border-2 border-input group-hover:border-primary flex items-center justify-center text-primary opacity-0 group-hover:opacity-100 transition-all">
                        <Check className="w-4 h-4" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
