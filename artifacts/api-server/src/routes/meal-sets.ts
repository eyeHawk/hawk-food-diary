import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, mealSetsTable, mealSetItemsTable, foodsTable, diaryEntriesTable } from "@workspace/db";
import {
  ListMealSetsResponse,
  CreateMealSetBody,
  CreateMealSetResponse,
  GetMealSetParams,
  GetMealSetResponse,
  DeleteMealSetParams,
  AddMealSetItemParams,
  AddMealSetItemBody,
  AddMealSetItemResponse,
  DeleteMealSetItemParams,
  DeleteMealSetItemResponse,
  LogMealSetParams,
  LogMealSetBody,
  LogMealSetResponse,
  UpdateMealSetBody,
  UpdateMealSetResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import type { Request } from "express";

const router: IRouter = Router();

type AuthedRequest = Request & { userId: string };

async function getMealSetWithItems(id: number) {
  const [mealSet] = await db
    .select()
    .from(mealSetsTable)
    .where(eq(mealSetsTable.id, id))
    .limit(1);
  if (!mealSet) return null;

  const items = await db
    .select({
      id: mealSetItemsTable.id,
      servings: mealSetItemsTable.servings,
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
        nutriscoreGrade: foodsTable.nutriscoreGrade,
        imageUrl: foodsTable.imageUrl,
      },
    })
    .from(mealSetItemsTable)
    .innerJoin(foodsTable, eq(mealSetItemsTable.foodId, foodsTable.id))
    .where(eq(mealSetItemsTable.mealSetId, id));

  return { ...mealSet, items };
}

router.get("/meal-sets", requireAuth, async (req, _res, next): Promise<void> => {
  const res = _res;
  const userId = (req as AuthedRequest).userId;
  const sets = await db
    .select()
    .from(mealSetsTable)
    .where(eq(mealSetsTable.userId, userId))
    .orderBy(mealSetsTable.createdAt);

  const results = await Promise.all(sets.map((s) => getMealSetWithItems(s.id)));
  res.json(ListMealSetsResponse.parse(results));
});

router.post("/meal-sets", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateMealSetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const [mealSet] = await db
    .insert(mealSetsTable)
    .values({ userId, name: parsed.data.name, category: parsed.data.category ?? null })
    .returning();
  res.status(201).json(CreateMealSetResponse.parse({ ...mealSet, items: [] }));
});

router.get("/meal-sets/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetMealSetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const userId = (req as AuthedRequest).userId;
  const result = await getMealSetWithItems(id);
  if (!result || result.userId !== userId) {
    res.status(404).json({ error: "Meal set not found" });
    return;
  }
  res.json(GetMealSetResponse.parse(result));
});

router.patch("/meal-sets/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetMealSetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const userId = (req as AuthedRequest).userId;

  const body = UpdateMealSetBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const existing = await getMealSetWithItems(id);
  if (!existing || existing.userId !== userId) {
    res.status(404).json({ error: "Meal set not found" });
    return;
  }

  const updates: { name?: string; category?: string | null } = {};
  if (body.data.name !== undefined) updates.name = body.data.name;
  if ("category" in body.data) updates.category = body.data.category ?? null;

  await db.update(mealSetsTable).set(updates).where(eq(mealSetsTable.id, id));

  const updated = await getMealSetWithItems(id);
  res.json(UpdateMealSetResponse.parse(updated));
});

router.delete("/meal-sets/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteMealSetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const userId = (req as AuthedRequest).userId;
  const [deleted] = await db
    .delete(mealSetsTable)
    .where(and(eq(mealSetsTable.id, id), eq(mealSetsTable.userId, userId)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Meal set not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/meal-sets/:id/items", requireAuth, async (req, res): Promise<void> => {
  const params = AddMealSetItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const userId = (req as AuthedRequest).userId;

  const body = AddMealSetItemBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const mealSet = await getMealSetWithItems(id);
  if (!mealSet || mealSet.userId !== userId) {
    res.status(404).json({ error: "Meal set not found" });
    return;
  }

  await db.insert(mealSetItemsTable).values({
    mealSetId: id,
    foodId: body.data.foodId,
    servings: body.data.servings,
  });

  const updated = await getMealSetWithItems(id);
  res.status(201).json(AddMealSetItemResponse.parse(updated));
});

router.delete("/meal-sets/:id/items/:itemId", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteMealSetItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const rawItem = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
  const id = parseInt(raw, 10);
  const itemId = parseInt(rawItem, 10);
  const userId = (req as AuthedRequest).userId;

  const mealSet = await getMealSetWithItems(id);
  if (!mealSet || mealSet.userId !== userId) {
    res.status(404).json({ error: "Meal set not found" });
    return;
  }

  const [deleted] = await db
    .delete(mealSetItemsTable)
    .where(eq(mealSetItemsTable.id, itemId))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const updated = await getMealSetWithItems(id);
  if (!updated) {
    res.status(404).json({ error: "Meal set not found" });
    return;
  }
  res.json(DeleteMealSetItemResponse.parse(updated));
});

router.post("/meal-sets/:id/log", requireAuth, async (req, res): Promise<void> => {
  const params = LogMealSetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const userId = (req as AuthedRequest).userId;

  const body = LogMealSetBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const mealSet = await getMealSetWithItems(id);
  if (!mealSet || mealSet.userId !== userId) {
    res.status(404).json({ error: "Meal set not found" });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const date = body.data.date ?? today;
  const mealType = body.data.mealType;

  if (mealSet.items.length === 0) {
    res.status(201).json([]);
    return;
  }

  const inserted = await db
    .insert(diaryEntriesTable)
    .values(
      mealSet.items.map((item) => ({
        userId,
        foodId: item.food.id,
        date,
        mealType,
        servings: item.servings,
      }))
    )
    .returning();

  type InsertedEntry = (typeof inserted)[number];
  type MealSetItemWithFood = NonNullable<Awaited<ReturnType<typeof getMealSetWithItems>>>["items"][number];
  const entries = inserted.map((entry: InsertedEntry) => {
    const item = mealSet.items.find((i: MealSetItemWithFood) => i.food.id === entry.foodId)!;
    return { ...entry, food: item.food };
  });

  res.status(201).json(LogMealSetResponse.parse(entries));
});

export default router;
