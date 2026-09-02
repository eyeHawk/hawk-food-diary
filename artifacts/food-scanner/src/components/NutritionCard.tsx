import { FoodProduct } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface NutritionCardProps {
  product: FoodProduct;
}

export function NutritionCard({ product }: NutritionCardProps) {
  const { nutriments, nutriscore_grade } = product;

  // Fallback to 100g if serving data is missing
  const getNutrient = (keyServing: string, key100g: string) => {
    const val = nutriments[keyServing as keyof typeof nutriments];
    if (val !== undefined) return val;
    return nutriments[key100g as keyof typeof nutriments] ?? 0;
  };

  const calories = getNutrient("energy-kcal_serving", "energy-kcal_100g");
  const fat = getNutrient("fat_serving", "fat_100g");
  const satFat = getNutrient("saturated-fat_serving", "saturated-fat_100g");
  const carbs = getNutrient("carbohydrates_serving", "carbohydrates_100g");
  const sugars = getNutrient("sugars_serving", "sugars_100g");
  const fiber = getNutrient("fiber_serving", "fiber_100g");
  const protein = getNutrient("proteins_serving", "proteins_100g");
  const salt = getNutrient("salt_serving", "salt_100g");
  const sodium = getNutrient("sodium_serving", "sodium_100g");

  const getNutriscoreColor = (grade?: string) => {
    switch (grade?.toLowerCase()) {
      case "a": return "bg-[#038141] text-white";
      case "b": return "bg-[#85BB2F] text-white";
      case "c": return "bg-[#FECB02] text-black";
      case "d": return "bg-[#EE8100] text-white";
      case "e": return "bg-[#E63E11] text-white";
      default: return "bg-gray-200 text-gray-800";
    }
  };

  return (
    <Card className="w-full max-w-sm mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500" data-testid="card-nutrition-results">
      <CardHeader className="pb-4">
        <div className="flex justify-between items-start gap-4">
          <div>
            <CardTitle className="text-2xl font-bold mb-1" data-testid="text-product-name">
              {product.product_name || "Unknown Product"}
            </CardTitle>
            <CardDescription className="text-base" data-testid="text-product-brand">
              {product.brands ? product.brands.split(",")[0] : "Unknown Brand"}
            </CardDescription>
            {product.serving_size && (
              <Badge variant="secondary" className="mt-3 font-medium px-3 py-1 bg-secondary text-secondary-foreground" data-testid="badge-serving-size">
                Serving: {product.serving_size}
              </Badge>
            )}
          </div>
          {product.image_front_url && (
            <img 
              src={product.image_front_url} 
              alt={product.product_name} 
              className="w-20 h-20 object-cover rounded-2xl shadow-xs border border-card-border"
              data-testid="img-product-thumbnail"
            />
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-2xl">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Energy</div>
            <div className="text-3xl font-bold tracking-tight text-foreground" data-testid="text-calories">
              {calories ? Math.round(calories) : "--"} <span className="text-base font-medium text-muted-foreground ml-1">kcal</span>
            </div>
          </div>
          {nutriscore_grade && (
            <div className="flex flex-col items-end">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Nutri-Score</div>
              <div 
                className={`w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold uppercase shadow-sm ${getNutriscoreColor(nutriscore_grade)}`}
                data-testid="badge-nutriscore"
              >
                {nutriscore_grade}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <NutrientRow label="Total Fat" value={fat} unit="g" subItems={[
            { label: "Saturated Fat", value: satFat, unit: "g" }
          ]} />
          
          <div className="h-px bg-border/50 w-full" />
          
          <NutrientRow label="Total Carbohydrates" value={carbs} unit="g" subItems={[
            { label: "Sugars", value: sugars, unit: "g" },
            { label: "Dietary Fiber", value: fiber, unit: "g" }
          ]} />
          
          <div className="h-px bg-border/50 w-full" />
          
          <NutrientRow label="Protein" value={protein} unit="g" />
          
          <div className="h-px bg-border/50 w-full" />
          
          <NutrientRow label="Salt" value={salt} unit="g" subItems={[
            { label: "Sodium", value: sodium, unit: "g", small: true }
          ]} />
        </div>
      </CardContent>
    </Card>
  );
}

function NutrientRow({ 
  label, 
  value, 
  unit, 
  subItems 
}: { 
  label: string; 
  value?: number; 
  unit: string; 
  subItems?: { label: string; value?: number; unit: string; small?: boolean }[] 
}) {
  const displayValue = value !== undefined && !isNaN(value) ? Number(value.toFixed(1)) : "--";
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-base">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="font-medium text-foreground">{displayValue}{unit}</span>
      </div>
      {subItems && subItems.map((item, i) => (
        <div key={i} className="flex justify-between items-center text-sm pl-4 relative">
          <div className="absolute left-0 top-1/2 w-3 h-px bg-border -translate-y-1/2" />
          <span className="text-muted-foreground">{item.label}</span>
          <span className="text-muted-foreground">{item.value !== undefined && !isNaN(item.value) ? Number(item.value.toFixed(2)) : "--"}{item.unit}</span>
        </div>
      ))}
    </div>
  );
}
