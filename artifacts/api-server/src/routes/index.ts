import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import healthRouter from "./health";
import officeRouter from "./office";

const router: IRouter = Router();

router.use(healthRouter);
router.use((req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to access office operations." });
    return;
  }
  next();
});
router.use(officeRouter);

export default router;
