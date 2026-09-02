export interface FoodProduct {
  product_name: string;
  brands?: string;
  serving_size?: string;
  nutriments: {
    "energy-kcal_serving"?: number;
    "energy-kcal_100g"?: number;
    fat_serving?: number;
    fat_100g?: number;
    "saturated-fat_serving"?: number;
    "saturated-fat_100g"?: number;
    carbohydrates_serving?: number;
    carbohydrates_100g?: number;
    sugars_serving?: number;
    sugars_100g?: number;
    fiber_serving?: number;
    fiber_100g?: number;
    proteins_serving?: number;
    proteins_100g?: number;
    salt_serving?: number;
    salt_100g?: number;
    sodium_serving?: number;
    sodium_100g?: number;
  };
  nutriscore_grade?: string;
  image_front_url?: string;
}

export interface FoodApiResponse {
  status: number;
  status_verbose: string;
  code: string;
  product?: FoodProduct;
}

export async function fetchFoodByBarcode(barcode: string): Promise<FoodApiResponse> {
  const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      // Best practice for Open Food Facts is to provide a User-Agent, but in browsers we can't reliably override it.
    }
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}
