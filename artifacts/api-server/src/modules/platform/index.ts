/**
 * Platform Module — إدارة منصة SaaS: الشركات، الباقات، الاشتراكات، واتساب
 *
 * Routes mounted (via routes/index.ts):
 *   GET/POST /platform/tenants, GET/PATCH /platform/tenants/:id (superadmin)
 *   POST /platform/tenants/:id/subscriptions
 *   GET/POST/PATCH /platform/plans(/:id)
 *   GET/PUT/DELETE /platform/tenants/:id/whatsapp
 */
import { Router, type IRouter } from "express";
import platformRouter from "./routes";

const router: IRouter = Router();
router.use(platformRouter);

export default router;
