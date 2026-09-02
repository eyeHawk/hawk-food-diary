import { Router, type IRouter, type Request, type Response } from "express";
import { Webhook } from "svix";
import {
  db,
  diaryEntriesTable,
  mealSetsTable,
  userPreferencesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/webhooks/clerk", async (req: Request, res: Response): Promise<void> => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("CLERK_WEBHOOK_SECRET is not set – webhook endpoint is disabled");
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  // svix requires the raw request body as a string or Buffer
  const payload = req.body as Buffer;
  if (!Buffer.isBuffer(payload)) {
    res.status(400).json({ error: "Unexpected body type – raw body required" });
    return;
  }

  const svixId = req.headers["svix-id"] as string | undefined;
  const svixTimestamp = req.headers["svix-timestamp"] as string | undefined;
  const svixSignature = req.headers["svix-signature"] as string | undefined;

  if (!svixId || !svixTimestamp || !svixSignature) {
    res.status(400).json({ error: "Missing svix headers" });
    return;
  }

  let event: { type: string; data: Record<string, unknown> };
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof event;
  } catch (err) {
    logger.warn({ err }, "Clerk webhook signature verification failed");
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  if (event.type === "user.deleted") {
    const userId = event.data.id as string | undefined;
    if (!userId) {
      res.status(400).json({ error: "Missing user id in event payload" });
      return;
    }

    logger.info({ userId }, "Deleting data for deleted Clerk user");

    await Promise.all([
      db.delete(diaryEntriesTable).where(eq(diaryEntriesTable.userId, userId)),
      db.delete(mealSetsTable).where(eq(mealSetsTable.userId, userId)),
      db.delete(userPreferencesTable).where(eq(userPreferencesTable.userId, userId)),
    ]);

    logger.info({ userId }, "Deleted user data cleanup complete");
  }

  res.json({ received: true });
});

export default router;
