import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import catalogRouter from "./catalog";
import adminRouter from "./admin";
import mediaRouter from "./media";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(catalogRouter);
router.use(mediaRouter);
router.use(adminRouter);

export default router;
