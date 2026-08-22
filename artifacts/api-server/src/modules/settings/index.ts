/**
 * Settings Module — إعدادات الشركة (self-service): تكامل واتساب
 *
 * Routes mounted (via routes/index.ts):
 *   GET/PUT /settings/whatsapp  (admin/manager of the tenant)
 */
import { Router, type IRouter } from "express";
import settingsRouter from "./routes";

const router: IRouter = Router();
router.use(settingsRouter);

export default router;
