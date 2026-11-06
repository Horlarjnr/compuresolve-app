import { Router } from 'express';
import {
  assignComplaintHandler,
  createComplaintHandler,
  createReopenRequestHandler,
  getComplaintHandler,
  listComplaintsHandler,
  transitionComplaintHandler,
  unassignComplaintHandler,
} from '../controllers/complaint.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { complaintLimiter, reopenRequestLimiter } from '../middlewares/rate-limit.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  assignComplaintSchema,
  complaintParamsSchema,
  createComplaintSchema,
  listComplaintsQuerySchema,
  transitionSchema,
} from '../validators/complaint.validator';
import { createReopenSchema } from '../validators/reopen.validator';

const router = Router();

// Only students submit. Staff and admins work on complaints; they do not file them.
router.post('/', ...requireRole('STUDENT'), complaintLimiter, validate(createComplaintSchema), createComplaintHandler);

// Everyone signed in may list/open; the access policy decides what they actually get.
router.get('/', requireAuth, validate(listComplaintsQuerySchema, 'query'), listComplaintsHandler);
router.get('/:complaintId', requireAuth, validate(complaintParamsSchema, 'params'), getComplaintHandler);

// Working on a complaint. Fine-grained rules (department, assignment, state machine) live in the service.
router.post(
  '/:complaintId/assignments',
  ...requireRole('OFFICER', 'HOD'),
  validate(complaintParamsSchema, 'params'),
  validate(assignComplaintSchema),
  assignComplaintHandler,
);
router.delete(
  '/:complaintId/assignments/current',
  ...requireRole('HOD'),
  validate(complaintParamsSchema, 'params'),
  unassignComplaintHandler,
);
router.post(
  '/:complaintId/status-transitions',
  ...requireRole('OFFICER', 'HOD', 'FACULTY_ADMIN'),
  validate(complaintParamsSchema, 'params'),
  validate(transitionSchema),
  transitionComplaintHandler,
);

// A student asks for a reopen. This only records a request; staff decide.
router.post(
  '/:complaintId/reopen-requests',
  ...requireRole('STUDENT'),
  reopenRequestLimiter,
  validate(complaintParamsSchema, 'params'),
  validate(createReopenSchema),
  createReopenRequestHandler,
);

export default router;
