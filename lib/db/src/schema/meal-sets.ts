import { pgTable, serial, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { foodsTable } from "./foods";

export const mealSetsTable = pgTable("meal_sets", {
  id: serial("id").primaryKey(),
  userId: text("user_id"), // null = legacy row not yet claimed
  name: text("name").notNull(),
  category: text("category"), // breakfast | lunch | dinner | snack | null
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const mealSetItemsTable = pgTable("meal_set_items", {
  id: serial("id").primaryKey(),
  mealSetId: serial("meal_set_id").references(() => mealSetsTable.id, { onDelete: "cascade" }).notNull(),
  foodId: serial("food_id").references(() => foodsTable.id, { onDelete: "cascade" }).notNull(),
  servings: real("servings").notNull().default(1),
});

export const insertMealSetSchema = createInsertSchema(mealSetsTable).omit({ id: true, createdAt: true });
export const insertMealSetItemSchema = createInsertSchema(mealSetItemsTable).omit({ id: true });
export type InsertMealSet = z.infer<typeof insertMealSetSchema>;
export type InsertMealSetItem = z.infer<typeof insertMealSetItemSchema>;
export type MealSet = typeof mealSetsTable.$inferSelect;
export type MealSetItem = typeof mealSetItemsTable.$inferSelect;
