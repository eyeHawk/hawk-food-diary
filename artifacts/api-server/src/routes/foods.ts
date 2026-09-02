import { Router, type IRouter, type Request } from "express";
import { desc, eq, ilike, or } from "drizzle-orm";
import { db, foodsTable, scanHistoryTable } from "@workspace/db";
import { GoogleGenAI, Type } from "@google/genai";
import {
  SearchFoodsQueryParams,
  LookupFoodBody,
  LookupFoodResponse,
  SearchFoodsResponse,
  ParseFoodBody,
  ParseFoodResponse,
  CreateFoodBody,
  CreateFoodResponse,
  GetFoodHistoryQueryParams,
  GetFoodHistoryResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth.js";

const router: IRouter = Router();
type AuthedRequest = Request & { userId: string };
type ScanWriter = Pick<typeof db, "insert">;

async function recordScan(
  database: ScanWriter,
  userId: string,
  foodId: number,
): Promise<void> {
  await database.insert(scanHistoryTable).values({ userId, foodId });
}

// ── Per-user AI rate limiter (in-memory, resets daily) ────────────────────

const AI_DAILY_LIMIT = 20;

interface RateLimitEntry {
  count: number;
  resetAt: number; // Unix ms at midnight UTC
}

const aiRateLimitStore = new Map<string, RateLimitEntry>();

function checkAiRateLimit(userId: string): { allowed: boolean; remaining: number; resetAt: number } {
  const nowMs = Date.now();
  const midnightUtc = new Date();
  midnightUtc.setUTCHours(24, 0, 0, 0);
  const resetAt = midnightUtc.getTime();

  let entry = aiRateLimitStore.get(userId);
  if (!entry || nowMs >= entry.resetAt) {
    entry = { count: 0, resetAt };
    aiRateLimitStore.set(userId, entry);
  }

  if (entry.count >= AI_DAILY_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: AI_DAILY_LIMIT - entry.count, resetAt: entry.resetAt };
}

// ── AI: Parse natural-language food description ────────────────────────────

router.post("/foods/parse", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const { allowed, remaining, resetAt } = checkAiRateLimit(userId);

  res.setHeader("X-RateLimit-Limit", AI_DAILY_LIMIT);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", Math.floor(resetAt / 1000));

  if (!allowed) {
    res.status(429).json({
      error: `Daily AI request limit reached (${AI_DAILY_LIMIT}/day). Resets at midnight UTC.`,
    });
    return;
  }
  const parsed = ParseFoodBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "GEMINI_API_KEY is not configured" });
    return;
  }

  const ai = new GoogleGenAI({ apiKey });

  let result: {
    food_name: string;
    quantity: number;
    unit: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: parsed.data.query,
      config: {
        systemInstruction:
          "You are a nutritional database assistant. Parse the food input and estimate nutritional values using standard USDA averages for uncooked/cooked items as specified. Always return numbers rounded to one decimal place.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            food_name: { type: Type.STRING, description: "Human-readable food name" },
            quantity: { type: Type.NUMBER, description: "Numeric quantity of the described portion" },
            unit: { type: Type.STRING, description: "Unit of measurement, e.g. oz, g, cup, item" },
            calories: { type: Type.NUMBER, description: "Estimated total calories (kcal) for this portion" },
            protein_g: { type: Type.NUMBER, description: "Protein in grams" },
            carbs_g: { type: Type.NUMBER, description: "Total carbohydrates in grams" },
            fat_g: { type: Type.NUMBER, description: "Total fat in grams" },
          },
          required: ["food_name", "quantity", "unit", "calories", "protein_g", "carbs_g", "fat_g"],
        },
      },
    });

    result = JSON.parse(response.text ?? "{}");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI request failed";
    res.status(503).json({ error: msg });
    return;
  }

  const parsedResponse = ParseFoodResponse.parse({
    foodName: result.food_name,
    quantity: result.quantity,
    unit: result.unit,
    calories: result.calories,
    proteinG: result.protein_g,
    carbsG: result.carbs_g,
    fatG: result.fat_g,
  });

  // Parsed foods do not come from the barcode catalog, so persist the
  // structured result as a food first in order to give the scan a foodId.
  try {
    await db.transaction(async (tx) => {
      const [food] = await tx
        .insert(foodsTable)
        .values({
          barcode: null,
          name: parsedResponse.foodName,
          servingSize: `${parsedResponse.quantity} ${parsedResponse.unit}`,
          kcalPerServing: parsedResponse.calories,
          proteinPerServing: parsedResponse.proteinG,
          carbsPerServing: parsedResponse.carbsG,
          fatPerServing: parsedResponse.fatG,
        })
        .returning({ id: foodsTable.id });

      if (!food) throw new Error("Failed to save parsed food");
      await recordScan(tx, userId, food.id);
    });
  } catch {
    res.status(500).json({ error: "Failed to save scan" });
    return;
  }

  res.json(parsedResponse);
});

// ── Create custom food ─────────────────────────────────────────────────────

router.post("/foods", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateFoodBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [food] = await db
    .insert(foodsTable)
    .values({
      barcode: null,
      name: parsed.data.name,
      servingSize: parsed.data.servingSize ?? null,
      kcalPerServing: parsed.data.kcalPerServing ?? null,
      fatPerServing: parsed.data.fatPerServing ?? null,
      saturatedFatPerServing: parsed.data.saturatedFatPerServing ?? null,
      carbsPerServing: parsed.data.carbsPerServing ?? null,
      sugarsPerServing: parsed.data.sugarsPerServing ?? null,
      fiberPerServing: parsed.data.fiberPerServing ?? null,
      proteinPerServing: parsed.data.proteinPerServing ?? null,
      saltPerServing: parsed.data.saltPerServing ?? null,
    })
    .returning();

  res.status(201).json(CreateFoodResponse.parse(food));
});

// ── Search cached foods ────────────────────────────────────────────────────

router.get("/foods/search", async (req, res): Promise<void> => {
  const parsed = SearchFoodsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data.q;
  const foods = await db
    .select()
    .from(foodsTable)
    .where(or(ilike(foodsTable.name, `%${q}%`), ilike(foodsTable.brand, `%${q}%`)))
    .limit(20);
  res.json(SearchFoodsResponse.parse(foods));
});

// ── Barcode lookup via Open Food Facts ────────────────────────────────────

router.post("/foods/lookup", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const parsed = LookupFoodBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { barcode } = parsed.data;

  const [cached] = await db
    .select()
    .from(foodsTable)
    .where(ilike(foodsTable.barcode, barcode))
    .limit(1);

  // Skip the cache if any core macro is missing, or if micronutrients haven't
  // been fetched yet (added later — existing rows will re-fetch once to pick them up).
  const cacheComplete =
    cached != null &&
    cached.kcalPerServing != null &&
    cached.proteinPerServing != null &&
    cached.carbsPerServing != null &&
    cached.fatPerServing != null &&
    cached.potassiumPerServing != null;

  if (cacheComplete) {
    if (userId) {
      try {
        await db.transaction((tx) => recordScan(tx, userId, cached.id));
      } catch {
        res.status(500).json({ error: "Failed to save scan" });
        return;
      }
    }
    res.json(LookupFoodResponse.parse(cached));
    return;
  }

  let offData: Record<string, unknown>;
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
      { signal: AbortSignal.timeout(10000) }
    );
    offData = (await response.json()) as Record<string, unknown>;
  } catch {
    res.status(502).json({ error: "Failed to reach Open Food Facts" });
    return;
  }

  if (!offData || offData.status !== 1 || !offData.product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const p = offData.product as Record<string, unknown>;
  const n = (p.nutriments ?? {}) as Record<string, unknown>;

  // Note: do NOT use `parseFloat(...) || null` — that coerces 0 to null.
  const toNum = (v: unknown): number | null => {
    if (typeof v === "number") return v;
    if (v == null) return null;
    const n = parseFloat(String(v));
    return isNaN(n) ? null : n;
  };

  // Many OFf products only carry _100g values, not _serving values.
  // When _serving is absent, scale from _100g using serving_quantity (grams).
  // If serving_quantity is also absent, use _100g directly as a best effort.
  const servingGrams = toNum(p.serving_quantity);
  const scale = servingGrams != null ? servingGrams / 100 : 1;

  function getNutrient(key: string): number | null {
    const serving = toNum(n[`${key}_serving`]);
    if (serving != null) return serving;
    const per100 = toNum(n[`${key}_100g`]);
    if (per100 != null) return Math.round(per100 * scale * 10) / 10;
    return null;
  }

  const values = {
    name: String(p.product_name || p.product_name_en || "Unknown Product"),
    brand: p.brands ? String(p.brands) : null,
    servingSize: p.serving_size ? String(p.serving_size) : null,
    kcalPerServing: getNutrient("energy-kcal"),
    fatPerServing: getNutrient("fat"),
    saturatedFatPerServing: getNutrient("saturated-fat"),
    carbsPerServing: getNutrient("carbohydrates"),
    sugarsPerServing: getNutrient("sugars"),
    fiberPerServing: getNutrient("fiber"),
    proteinPerServing: getNutrient("proteins"),
    saltPerServing: getNutrient("salt"),
    sodiumPerServing: getNutrient("sodium"),
    potassiumPerServing: getNutrient("potassium"),
    cholesterolPerServing: getNutrient("cholesterol"),
    nutriscoreGrade: p.nutriscore_grade ? String(p.nutriscore_grade) : null,
    imageUrl: p.image_front_url ? String(p.image_front_url) : null,
  };

  let food: typeof foodsTable.$inferSelect;
  try {
    food = await db.transaction(async (tx) => {
      const [savedFood] = await tx
        .insert(foodsTable)
        .values({ barcode, ...values })
        .onConflictDoUpdate({ target: foodsTable.barcode, set: values })
        .returning();

      if (!savedFood) throw new Error("Failed to save food");
      if (userId) await recordScan(tx, userId, savedFood.id);
      return savedFood;
    });
  } catch {
    res.status(500).json({ error: "Failed to save scan" });
    return;
  }

  res.json(LookupFoodResponse.parse(food));
});

// ── Per-user scan history ───────────────────────────────────────────────────

router.get("/foods/history", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetFoodHistoryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { limit, offset } = parsed.data;
  const userId = (req as AuthedRequest).userId;
  const rows = await db
    .select({
      id: scanHistoryTable.id,
      foodId: scanHistoryTable.foodId,
      scannedAt: scanHistoryTable.scannedAt,
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
    .from(scanHistoryTable)
    .innerJoin(foodsTable, eq(scanHistoryTable.foodId, foodsTable.id))
    .where(eq(scanHistoryTable.userId, userId))
    .orderBy(desc(scanHistoryTable.scannedAt), desc(scanHistoryTable.id))
    .limit(limit + 1)
    .offset(offset);

  const items = rows.slice(0, limit);
  res.json(
    GetFoodHistoryResponse.parse({
      items,
      pagination: {
        limit,
        offset,
        hasMore: rows.length > limit,
      },
    })
  );
});

// ── Update food nutrition values (user correction) ────────────────────────

router.patch("/foods/:id", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid food id" });
    return;
  }

  const UpdateFoodBody = CreateFoodBody.partial();
  const parsed = UpdateFoodBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [food] = await db
    .update(foodsTable)
    .set(parsed.data)
    .where(eq(foodsTable.id, id))
    .returning();

  if (!food) {
    res.status(404).json({ error: "Food not found" });
    return;
  }

  res.json(CreateFoodResponse.parse(food));
});

export default router;
