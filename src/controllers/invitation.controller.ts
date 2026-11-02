import type { NextFunction, Request, Response } from 'express';
import {
  acceptInvitation,
  createInvitation,
  listInvitations,
  revokeInvitation,
} from '../services/invitation.service';

export const createInvitationHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invitation = await createInvitation(req.user!, req.body);
    res.status(201).json({ success: true, message: 'Invitation sent', data: invitation });
  } catch (error) {
    next(error);
  }
};

export const listInvitationsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invitations = await listInvitations(req.user!);
    res.status(200).json({ success: true, data: invitations });
  } catch (error) {
    next(error);
  }
};

export const revokeInvitationHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await revokeInvitation(req.user!, req.params.id as string);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const acceptInvitationHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await acceptInvitation(req.body);
    res.status(201).json({ success: true, message: 'Invitation accepted. You can now log in.' });
  } catch (error) {
    next(error);
  }
};
