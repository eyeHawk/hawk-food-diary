import { Router, type IRouter } from "express";
import { eq, and, isNull, or } from "drizzle-orm";
import { db, diaryEntriesTable, foodsTable } from "@workspace/db";
import {
  GetDiaryQueryParams,
  AddDiaryEntryBody,
  DeleteDiaryEntryParams,
  GetDiarySummaryQueryParams,
  AddDiaryEntryResponse,
  GetDiaryResponse,
  GetDiarySummaryResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import type { Request } from "express";

const router: IRouter = Router();

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

type AuthedRequest = Request & { userId: string };

async function getEntriesForDate(date: string, userId: string) {
  return db
    .select({
      id: diaryEntriesTable.id,
      date: diaryEntriesTable.date,
      mealType: diaryEntriesTable.mealType,
      servings: diaryEntriesTable.servings,
      createdAt: diaryEntriesTable.createdAt,
      food: {
        id: foodsTable.id,
        barcode: foodsTable.barcode,
        name: foodsTable.name,
        brand: foodsTable.brand,
        servingSize: foodsTable.servingSize,
        kcalPerServing: foodsTable.kcalPerServing,
        fatPerServing: foodsTable.fatPerServing,
        saturatedFatPerServing: foodsTable.saturatedFatPerServing,
        carbsPerServing: foodsTable.carbsPerServing,
        sugarsPerServing: foodsTable.sugarsPerServing,
        fiberPerServing: foodsTable.fiberPerServing,
        proteinPerServing: foodsTable.proteinPerServing,
        saltPerServing: foodsTable.saltPerServing,
        sodiumPerServing: foodsTable.sodiumPerServing,
        potassiumPerServing: foodsTable.potassiumPerServing,
        cholesterolPerServing: foodsTable.cholesterolPerServing,
        nutriscoreGrade: foodsTable.nutriscoreGrade,
        imageUrl: foodsTable.imageUrl,
      },
    })
    .from(diaryEntriesTable)
    .innerJoin(foodsTable, eq(diaryEntriesTable.foodId, foodsTable.id))
    .where(
      and(
        eq(diaryEntriesTable.date, date),
        eq(diaryEntriesTable.userId, userId),
      ),
    )
    .orderBy(diaryEntriesTable.createdAt);
}

router.get("/diary", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetDiaryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { date } = parsed.data;
  const userId = (req as AuthedRequest).userId;
  const rows = await getEntriesForDate(date, userId);
  const grouped: Record<string, typeof rows> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  for (const row of rows) {
    if (grouped[row.mealType]) grouped[row.mealType].push(row);
  }
  res.json(GetDiaryResponse.parse({ date, ...grouped }));
});

router.post("/diary/entries", requireAuth, async (req, res): Promise<void> => {
  const parsed = AddDiaryEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { foodId, date, mealType, servings } = parsed.data;
  const userId = (req as AuthedRequest).userId;

  const [food] = await db.select().from(foodsTable).where(eq(foodsTable.id, foodId)).limit(1);
  if (!food) {
    res.status(404).json({ error: "Food not found" });
    return;
  }

  const [entry] = await db
    .insert(diaryEntriesTable)
    .values({ userId, foodId, date, mealType, servings })
    .returning();

  const result = { ...entry, food };
  res.status(201).json(AddDiaryEntryResponse.parse(result));
});

router.delete("/diary/entries/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteDiaryEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const userId = (req as AuthedRequest).userId;

  const [deleted] = await db
    .delete(diaryEntriesTable)
    .where(and(eq(diaryEntriesTable.id, id), eq(diaryEntriesTable.userId, userId)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/diary/summary", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetDiarySummaryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { date } = parsed.data;
  const userId = (req as AuthedRequest).userId;
  const rows = await getEntriesForDate(date, userId);

  let totalKcal = 0;
  let totalFat = 0;
  let totalCarbs = 0;
  let totalProtein = 0;

  for (const row of rows) {
    const s = row.servings;
    totalKcal += (row.food.kcalPerServing ?? 0) * s;
    totalFat += (row.food.fatPerServing ?? 0) * s;
    totalCarbs += (row.food.carbsPerServing ?? 0) * s;
    totalProtein += (row.food.proteinPerServing ?? 0) * s;
  }

  res.json(
    GetDiarySummaryResponse.parse({
      date,
      totalKcal: Math.round(totalKcal),
      totalFat: Math.round(totalFat * 10) / 10,
      totalCarbs: Math.round(totalCarbs * 10) / 10,
      totalProtein: Math.round(totalProtein * 10) / 10,
      entryCount: rows.length,
    })
  );
});

export { getEntriesForDate, MEAL_TYPES };
export default router;
