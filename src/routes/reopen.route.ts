import { Router } from 'express';
import { decideReopenRequestHandler, listReopenRequestsHandler } from '../controllers/reopen.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { listReopenQuerySchema, reopenDecisionSchema, reopenParamsSchema } from '../validators/reopen.validator';

const router = Router();

// Staff work queue; a student sees only requests on their own complaints. The access policy decides.
router.get('/', requireAuth, validate(listReopenQuerySchema, 'query'), listReopenRequestsHandler);

// Staff decide. Who exactly (HOD, assigned Officer, Faculty Admin) is checked in the service.
router.post(
  '/:requestId/decision',
  ...requireRole('OFFICER', 'HOD', 'FACULTY_ADMIN'),
  validate(reopenParamsSchema, 'params'),
  validate(reopenDecisionSchema),
  decideReopenRequestHandler,
);

export default router;
