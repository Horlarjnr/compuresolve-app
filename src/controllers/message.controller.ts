import type { NextFunction, Request, Response } from 'express';
import { listMessages, postMessage } from '../services/message.service';
import type { ListMessagesQuery } from '../validators/message.validator';

export const listMessagesHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = res.locals.query as ListMessagesQuery;
    const { items, meta } = await listMessages(req.user!, req.params.complaintId as string, page, limit);
    res.status(200).json({ success: true, data: items, meta });
  } catch (error) {
    next(error);
  }
};

export const postMessageHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const message = await postMessage(req.user!, req.params.complaintId as string, req.body);
    res.status(201).json({ success: true, message: 'Message sent', data: message });
  } catch (error) {
    next(error);
  }
};
