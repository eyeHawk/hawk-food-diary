import { pgTable, serial, text, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const foodsTable = pgTable("foods", {
  id: serial("id").primaryKey(),
  barcode: text("barcode").unique(),
  name: text("name").notNull(),
  brand: text("brand"),
  servingSize: text("serving_size"),
  kcalPerServing: real("kcal_per_serving"),
  fatPerServing: real("fat_per_serving"),
  saturatedFatPerServing: real("saturated_fat_per_serving"),
  carbsPerServing: real("carbs_per_serving"),
  sugarsPerServing: real("sugars_per_serving"),
  fiberPerServing: real("fiber_per_serving"),
  proteinPerServing: real("protein_per_serving"),
  saltPerServing: real("salt_per_serving"),
  sodiumPerServing: real("sodium_per_serving"),
  potassiumPerServing: real("potassium_per_serving"),
  cholesterolPerServing: real("cholesterol_per_serving"),
  nutriscoreGrade: text("nutriscore_grade"),
  imageUrl: text("image_url"),
});

export const insertFoodSchema = createInsertSchema(foodsTable).omit({ id: true });
export type InsertFood = z.infer<typeof insertFoodSchema>;
export type Food = typeof foodsTable.$inferSelect;
