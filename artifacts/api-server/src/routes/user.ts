import { Router, type IRouter } from "express";
import { eq, isNull } from "drizzle-orm";
import {
  db,
  diaryEntriesTable,
  mealSetsTable,
  userPreferencesTable,
  type NutrientTargets,
} from "@workspace/db";
import { GetUserPreferencesResponse, UpdateUserPreferencesBody, UpdateUserPreferencesResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import type { Request } from "express";

const router: IRouter = Router();
type AuthedRequest = Request & { userId: string };

const DEFAULT_MONITORED_NUTRIENTS = ["potassium"] as const;

function targetsForResponse(targets: NutrientTargets | null | undefined) {
  if (!targets || Object.keys(targets).length === 0) {
    return undefined;
  }

  return targets;
}

/**
 * POST /user/claim-legacy-data
 *
 * One-time migration: assigns all rows with userId=NULL (created before auth
 * was added) to the currently authenticated user. Safe to call multiple times.
 */
router.post("/user/claim-legacy-data", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;

  const [diary, sets] = await Promise.all([
    db
      .update(diaryEntriesTable)
      .set({ userId })
      .where(isNull(diaryEntriesTable.userId))
      .returning({ id: diaryEntriesTable.id }),
    db
      .update(mealSetsTable)
      .set({ userId })
      .where(isNull(mealSetsTable.userId))
      .returning({ id: mealSetsTable.id }),
  ]);

  res.json({
    claimed: {
      diaryEntries: diary.length,
      mealSets: sets.length,
    },
  });
});

router.get("/user/preferences", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const [preferences] = await db
    .select({
      monitoredNutrients: userPreferencesTable.monitoredNutrients,
      nutrientTargets: userPreferencesTable.nutrientTargets,
    })
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId))
    .limit(1);

  res.json(
    GetUserPreferencesResponse.parse({
      monitoredNutrients: preferences?.monitoredNutrients ?? [...DEFAULT_MONITORED_NUTRIENTS],
      nutrientTargets: targetsForResponse(preferences?.nutrientTargets),
    }),
  );
});

router.patch("/user/preferences", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateUserPreferencesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = (req as AuthedRequest).userId;
  const [existingPreferences] = await db
    .select({ nutrientTargets: userPreferencesTable.nutrientTargets })
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId))
    .limit(1);
  const nutrientTargets = parsed.data.nutrientTargets ?? existingPreferences?.nutrientTargets ?? {};
  const [preferences] = await db
    .insert(userPreferencesTable)
    .values({
      userId,
      monitoredNutrients: parsed.data.monitoredNutrients,
      nutrientTargets,
    })
    .onConflictDoUpdate({
      target: userPreferencesTable.userId,
      set: {
        monitoredNutrients: parsed.data.monitoredNutrients,
        nutrientTargets,
      },
    })
    .returning({
      monitoredNutrients: userPreferencesTable.monitoredNutrients,
      nutrientTargets: userPreferencesTable.nutrientTargets,
    });

  res.json(
    UpdateUserPreferencesResponse.parse({
      ...preferences,
      nutrientTargets: targetsForResponse(preferences.nutrientTargets),
    }),
  );
});

export default router;
