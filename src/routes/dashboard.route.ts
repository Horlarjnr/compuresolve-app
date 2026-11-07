import { Router } from 'express';
import { getDashboardSummaryHandler } from '../controllers/dashboard.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { dashboardQuerySchema } from '../validators/dashboard.validator';

const router = Router();

// Any signed-in user. What comes back depends only on the roles they hold and the records they may see.
router.get('/summary', requireAuth, validate(dashboardQuerySchema, 'query'), getDashboardSummaryHandler);

export default router;
