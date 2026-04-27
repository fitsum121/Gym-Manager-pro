import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import authRouter from "./auth";
import staffRouter from "./staff";
import membersRouter from "./members";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminRouter);
router.use("/auth", authRouter);
router.use("/staff", staffRouter);
router.use("/members", membersRouter);

export default router;
