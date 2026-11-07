import type { NextFunction, Request, Response } from 'express';
import { listNotifications, markNotificationRead } from '../services/notification.service';
import type { ListNotificationsQuery } from '../validators/notification.validator';

export const listNotificationsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, meta } = await listNotifications(req.user!, res.locals.query as ListNotificationsQuery);
    res.status(200).json({ success: true, data: items, meta });
  } catch (error) {
    next(error);
  }
};

export const markNotificationReadHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notification = await markNotificationRead(req.user!, req.params.notificationId as string);
    res.status(200).json({ success: true, message: 'Notification marked as read', data: notification });
  } catch (error) {
    next(error);
  }
};
