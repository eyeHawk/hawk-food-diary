import { jsonb, pgTable, text } from "drizzle-orm/pg-core";

export type NutrientTargets = Partial<
  Record<"potassium" | "sodium" | "cholesterol", number>
>;

export const userPreferencesTable = pgTable("user_preferences", {
  userId: text("user_id").primaryKey(),
  monitoredNutrients: text("monitored_nutrients")
    .array()
    .notNull()
    .default(["potassium"]),
  nutrientTargets: jsonb("nutrient_targets")
    .$type<NutrientTargets>()
    .notNull()
    .default({}),
});

export type UserPreferences = typeof userPreferencesTable.$inferSelect;