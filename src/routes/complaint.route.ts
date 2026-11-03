import { Router } from 'express';
import { createComplaintHandler, getComplaintHandler, listComplaintsHandler } from '../controllers/complaint.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { complaintLimiter } from '../middlewares/rate-limit.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  complaintParamsSchema,
  createComplaintSchema,
  listComplaintsQuerySchema,
} from '../validators/complaint.validator';

const router = Router();

// Only students submit. Staff and admins work on complaints; they do not file them.
router.post('/', ...requireRole('STUDENT'), complaintLimiter, validate(createComplaintSchema), createComplaintHandler);

// Everyone signed in may list/open; the access policy decides what they actually get.
router.get('/', requireAuth, validate(listComplaintsQuerySchema, 'query'), listComplaintsHandler);
router.get('/:complaintId', requireAuth, validate(complaintParamsSchema, 'params'), getComplaintHandler);

export default router;
