import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { foodsTable } from "./foods";

export const scanHistoryTable = pgTable(
  "scan_history",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    foodId: integer("food_id").references(() => foodsTable.id, { onDelete: "cascade" }).notNull(),
    scannedAt: timestamp("scanned_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    index("scan_history_user_scanned_at_idx").on(table.userId, table.scannedAt, table.id),
  ],
);

export type ScanHistory = typeof scanHistoryTable.$inferSelect;