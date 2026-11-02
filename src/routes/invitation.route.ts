import { Router } from 'express';
import {
  acceptInvitationHandler,
  createInvitationHandler,
  listInvitationsHandler,
  revokeInvitationHandler,
} from '../controllers/invitation.controller';
import { requireRole } from '../middlewares/auth.middleware';
import { acceptInvitationLimiter, createInvitationLimiter } from '../middlewares/rate-limit.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  invitationIdParamSchema,
} from '../validators/invitation.validator';

const router = Router();

// Public: the invitee has no account yet. The emailed token is the credential.
router.post('/accept', acceptInvitationLimiter, validate(acceptInvitationSchema), acceptInvitationHandler);

// Staff only. Fine-grained rules (HOD: own-department Officers only) are enforced in the service.
const staff = requireRole('FACULTY_ADMIN', 'HOD');
router.post('/', ...staff, createInvitationLimiter, validate(createInvitationSchema), createInvitationHandler);
router.get('/', ...staff, listInvitationsHandler);
router.delete('/:id', ...staff, validate(invitationIdParamSchema, 'params'), revokeInvitationHandler);

export default router;
