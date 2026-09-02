import { pgTable, serial, text, real, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { foodsTable } from "./foods";

export const diaryEntriesTable = pgTable("diary_entries", {
  id: serial("id").primaryKey(),
  userId: text("user_id"), // null = legacy row not yet claimed
  date: date("date", { mode: "string" }).notNull(),
  mealType: text("meal_type").notNull(), // breakfast | lunch | dinner | snack
  foodId: serial("food_id").references(() => foodsTable.id, { onDelete: "cascade" }).notNull(),
  servings: real("servings").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const insertDiaryEntrySchema = createInsertSchema(diaryEntriesTable).omit({ id: true, createdAt: true });
export type InsertDiaryEntry = z.infer<typeof insertDiaryEntrySchema>;
export type DiaryEntry = typeof diaryEntriesTable.$inferSelect;
