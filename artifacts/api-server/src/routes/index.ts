import { Router, type IRouter } from "express";
import healthRouter from "./health";
import foodsRouter from "./foods";
import diaryRouter from "./diary";
import mealSetsRouter from "./meal-sets";
import userRouter from "./user";
import webhooksRouter from "./webhooks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(foodsRouter);
router.use(diaryRouter);
router.use(mealSetsRouter);
router.use(userRouter);
router.use(webhooksRouter);

export default router;
