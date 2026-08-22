import { Router, type IRouter } from "express";
import supportRouter from "./routes";

const router: IRouter = Router();
router.use(supportRouter);

export default router;
