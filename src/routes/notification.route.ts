import { Router } from 'express';
import { listNotificationsHandler, markNotificationReadHandler } from '../controllers/notification.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { listNotificationsQuerySchema, notificationParamsSchema } from '../validators/notification.validator';

const router = Router();

// Every signed-in user, but only ever their OWN notifications (the service filters by user id).
router.get('/', requireAuth, validate(listNotificationsQuerySchema, 'query'), listNotificationsHandler);
router.patch(
  '/:notificationId/read',
  requireAuth,
  validate(notificationParamsSchema, 'params'),
  markNotificationReadHandler,
);

export default router;
