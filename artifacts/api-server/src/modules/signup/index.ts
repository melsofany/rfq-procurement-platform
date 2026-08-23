/**
 * Signup Module — تسجيل الشركات الجديدة (self-service)
 *
 * Routes mounted (via routes/index.ts):
 *   POST /signup — public: a company registers itself. Creates the tenant
 *                  with status "pending" + its first admin employee, then a
 *                  platform superadmin reviews/activates it from /admin/tenants.
 */
import { Router, type IRouter } from "express";
import signupRouter from "./routes";

const router: IRouter = Router();
router.use(signupRouter);

export default router;
